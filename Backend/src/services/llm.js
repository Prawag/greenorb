/**
 * Pluggable LLM client. Every chat provider speaks the OpenAI-compatible
 * /chat/completions protocol (Groq, Gemini's OpenAI endpoint, OpenAI, Ollama),
 * so switching providers is configuration only. Providers are tried in order;
 * a provider that fails is skipped for a cool-down period.
 */
export const EMBED_DIM = 768;

function buildProviders(c) {
  const all = {
    groq: c.GROQ_API_KEY && { name: 'groq', baseUrl: 'https://api.groq.com/openai/v1', apiKey: c.GROQ_API_KEY, model: c.GROQ_MODEL },
    gemini: c.GEMINI_API_KEY && {
      name: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      apiKey: c.GEMINI_API_KEY,
      model: c.GEMINI_MODEL,
    },
    openai: c.OPENAI_API_KEY && { name: 'openai', baseUrl: c.OPENAI_BASE_URL.replace(/\/$/, ''), apiKey: c.OPENAI_API_KEY, model: c.OPENAI_MODEL },
    ollama: c.OLLAMA_BASE_URL && {
      name: 'ollama',
      baseUrl: `${c.OLLAMA_BASE_URL.replace(/\/$/, '')}/v1`,
      apiKey: 'ollama',
      model: c.OLLAMA_MODEL,
    },
  };
  return c.LLM_PROVIDERS.map((n) => all[n]).filter(Boolean);
}

class ProviderError extends Error {
  constructor(provider, status, message) {
    super(`${provider}: ${message}`);
    this.status = status;
  }
}

export function normalize(vec) {
  const n = Math.sqrt(vec.reduce((s, x) => s + x * x, 0)) || 1;
  return vec.map((x) => x / n);
}

export function createLlm(config, { fetchImpl = globalThis.fetch } = {}) {
  const providers = buildProviders(config);
  const cooldownUntil = new Map();
  const timeoutMs = config.LLM_TIMEOUT_MS;

  async function post(url, body, headers) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }
      return { status: res.status, ok: res.ok, data, text };
    } finally {
      clearTimeout(t);
    }
  }

  async function callChat(p, { system, user, json, maxTokens, temperature }) {
    const body = {
      model: p.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature,
      max_tokens: maxTokens,
    };
    if (json) body.response_format = { type: 'json_object' };
    let r = await post(`${p.baseUrl}/chat/completions`, body, { authorization: `Bearer ${p.apiKey}` });
    if (!r.ok && json && r.status === 400) {
      // Some OpenAI-compatible servers reject response_format; retry once without it.
      delete body.response_format;
      r = await post(`${p.baseUrl}/chat/completions`, body, { authorization: `Bearer ${p.apiKey}` });
    }
    if (!r.ok) {
      const msg = r.data?.error?.message || r.text?.slice(0, 200) || `HTTP ${r.status}`;
      throw new ProviderError(p.name, r.status, msg);
    }
    const text = r.data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) throw new ProviderError(p.name, 502, 'empty completion');
    return text;
  }

  async function chat({ system, user, json = false, maxTokens = 1024, temperature = 0 }) {
    if (!providers.length) throw new Error('No LLM provider configured (set GROQ_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY or OLLAMA_BASE_URL).');
    const errors = [];
    for (const p of providers) {
      if ((cooldownUntil.get(p.name) || 0) > Date.now()) continue;
      const started = Date.now();
      try {
        const text = await callChat(p, { system, user, json, maxTokens, temperature });
        return { text, provider: p.name, model: p.model, latencyMs: Date.now() - started };
      } catch (err) {
        errors.push(err.message);
        const authError = err.status === 401 || err.status === 403;
        cooldownUntil.set(p.name, Date.now() + (authError ? 10 * 60_000 : 60_000));
        console.warn(`[llm] ${err.message}`);
      }
    }
    throw new Error(`All LLM providers failed: ${errors.join(' | ') || 'all providers cooling down'}`);
  }

  const embeddingsProvider = config.EMBEDDINGS_PROVIDER;

  async function embed(texts, { taskType = 'RETRIEVAL_QUERY' } = {}) {
    if (!texts.length || embeddingsProvider === 'none') return null;
    if (embeddingsProvider === 'gemini') {
      const model = config.GEMINI_EMBED_MODEL;
      const r = await post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`,
        {
          requests: texts.map((t) => ({
            model: `models/${model}`,
            content: { parts: [{ text: t }] },
            taskType,
            outputDimensionality: EMBED_DIM,
          })),
        },
        { 'x-goog-api-key': config.GEMINI_API_KEY },
      );
      if (!r.ok) throw new Error(`gemini embeddings: ${r.data?.error?.message || r.status}`);
      return r.data.embeddings.map((e) => normalize(e.values));
    }
    if (embeddingsProvider === 'openai') {
      const r = await post(
        `${config.OPENAI_BASE_URL.replace(/\/$/, '')}/embeddings`,
        { model: config.OPENAI_EMBED_MODEL, input: texts, dimensions: EMBED_DIM },
        { authorization: `Bearer ${config.OPENAI_API_KEY}` },
      );
      if (!r.ok) throw new Error(`openai embeddings: ${r.data?.error?.message || r.status}`);
      return r.data.data.map((d) => normalize(d.embedding));
    }
    if (embeddingsProvider === 'ollama') {
      const r = await post(`${config.OLLAMA_BASE_URL.replace(/\/$/, '')}/api/embed`, { model: config.OLLAMA_EMBED_MODEL, input: texts });
      if (!r.ok) throw new Error(`ollama embeddings: ${r.data?.error || r.status}`);
      return r.data.embeddings.map((e) => normalize(e));
    }
    return null;
  }

  return {
    providers: providers.map((p) => ({ name: p.name, model: p.model })),
    configured: providers.length > 0,
    embeddingsProvider,
    chat,
    embed,
  };
}
