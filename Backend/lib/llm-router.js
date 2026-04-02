/**
 * LLM Fallback Router — Gemini 2.0 Flash → Groq 70B → Groq 8B → Ollama (dev)
 * Handles 429 rate limits, 500/503 errors, and 120s timeouts.
 */

const PROVIDERS = [
  { id: 'gemini', name: 'Gemini 2.0 Flash', model: 'gemini-2.0-flash' },
  { id: 'groq_70b', name: 'Groq Llama 3.3 70B', model: 'llama-3.3-70b-versatile' },
  { id: 'groq_8b', name: 'Groq Llama 3.1 8B', model: 'llama-3.1-8b-instant' },
  { id: 'ollama', name: 'Ollama Local', model: 'llama3' },
];

class LLMRouter {
  constructor() {
    this.retryAfter = {}; // { providerId: timestamp }
    this.status = {};     // { providerId: 'ok' | 'rate_limited' | 'error' }
    for (const p of PROVIDERS) this.status[p.id] = 'ok';
  }

  isAvailable(providerId) {
    if (providerId === 'ollama' && process.env.NODE_ENV !== 'development') return false;
    const cooldown = this.retryAfter[providerId] || 0;
    return Date.now() >= cooldown;
  }

  setCooldown(providerId, seconds) {
    this.retryAfter[providerId] = Date.now() + seconds * 1000;
    this.status[providerId] = 'rate_limited';
  }

  setError(providerId) {
    this.status[providerId] = 'error';
    this.retryAfter[providerId] = Date.now() + 60000; // 60s cooldown on error
  }

  async callGemini(systemPrompt, userPrompt, maxTokens) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY not set');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: maxTokens }
          }),
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);

      if (res.status === 429) {
        const retry = parseInt(res.headers.get('Retry-After') || '30');
        throw { status: 429, retryAfter: retry };
      }
      if (!res.ok) throw { status: res.status };

      const data = await res.json();
      return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } finally {
      clearTimeout(timeout);
    }
  }

  async callGroq(model, systemPrompt, userPrompt, maxTokens) {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error('GROQ_API_KEY not set');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: maxTokens,
          temperature: 0.3,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.status === 429) {
        const retry = parseInt(res.headers.get('Retry-After') || '30');
        throw { status: 429, retryAfter: retry };
      }
      if (!res.ok) throw { status: res.status };

      const data = await res.json();
      return data?.choices?.[0]?.message?.content || '';
    } finally {
      clearTimeout(timeout);
    }
  }

  async callOllama(systemPrompt, userPrompt, maxTokens) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    try {
      const res = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama3',
          prompt: `${systemPrompt}\n\n${userPrompt}`,
          stream: false,
          options: { num_predict: maxTokens },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw { status: res.status };
      const data = await res.json();
      return data?.response || '';
    } finally {
      clearTimeout(timeout);
    }
  }

  async complete(systemPrompt, userPrompt, maxTokens = 1000) {
    const attempts = [
      { id: 'gemini', fn: () => this.callGemini(systemPrompt, userPrompt, maxTokens) },
      { id: 'groq_70b', fn: () => this.callGroq('llama-3.3-70b-versatile', systemPrompt, userPrompt, maxTokens) },
      { id: 'groq_8b', fn: () => this.callGroq('llama-3.1-8b-instant', systemPrompt, userPrompt, maxTokens) },
      { id: 'ollama', fn: () => this.callOllama(systemPrompt, userPrompt, maxTokens) },
    ];

    for (const attempt of attempts) {
      if (!this.isAvailable(attempt.id)) continue;

      const start = Date.now();
      try {
        const text = await attempt.fn();
        this.status[attempt.id] = 'ok';
        return {
          text,
          provider_used: attempt.id,
          latency_ms: Date.now() - start,
        };
      } catch (err) {
        if (err?.status === 429) {
          const retry = err.retryAfter || 30;
          if (retry > 10) {
            this.setCooldown(attempt.id, retry);
            continue; // Switch to next provider
          } else {
            // Short wait then retry same provider
            await new Promise(r => setTimeout(r, retry * 1000));
            try {
              const text = await attempt.fn();
              this.status[attempt.id] = 'ok';
              return { text, provider_used: attempt.id, latency_ms: Date.now() - start };
            } catch {
              this.setCooldown(attempt.id, 60);
              continue;
            }
          }
        }
        // 500/503/timeout — switch immediately
        this.setError(attempt.id);
        continue;
      }
    }

    throw new Error('All LLM providers exhausted — no response available');
  }

  getStatus() {
    const result = {};
    for (const p of PROVIDERS) {
      if (p.id === 'ollama' && process.env.NODE_ENV !== 'development') {
        result[p.id] = 'unavailable';
      } else if (!this.isAvailable(p.id)) {
        result[p.id] = this.status[p.id] || 'rate_limited';
      } else {
        result[p.id] = this.status[p.id] || 'ok';
      }
    }
    return result;
  }
}

// Singleton instance
const llmRouter = new LLMRouter();
export default llmRouter;
