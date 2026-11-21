import { METRIC_LABELS } from '../metrics.js';

const STOP = new Set(
  `a an and are as at be by did do does for from has have how in is it its of on or that the their this to was were what when where which who why will with
   company companys report reports please tell me about our we they them there these those than then into over under per total year years fy`.split(/\s+/),
);

/** Turn a natural-language question into an OR tsquery of meaningful terms. */
export function toOrQuery(question) {
  const terms = [
    ...new Set(
      String(question)
        .toLowerCase()
        .replace(/scope\s*([123])/g, 'scope$1 scope')
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 1 && !STOP.has(w)),
    ),
  ].slice(0, 16);
  return terms.join(' | ');
}

export async function retrieve(db, { companyId, reportId = null, question, embedding = null, useVector = false, limit = 8 }) {
  const tsq = toOrQuery(question);
  const ranked = new Map();
  const add = (rows, weight) =>
    rows.forEach((r, i) => {
      const cur = ranked.get(r.id) || { ...r, score: 0 };
      cur.score += weight / (60 + i + 1);
      ranked.set(r.id, cur);
    });

  if (tsq) {
    const rows = await db.query(
      `SELECT c.id, c.report_id, c.page, c.content
         FROM esg.chunks c, to_tsquery('english', $1) q
        WHERE c.company_id = $2 AND ($3::bigint IS NULL OR c.report_id = $3) AND c.tsv @@ q
        ORDER BY ts_rank_cd(c.tsv, q, 32) DESC
        LIMIT 20`,
      [tsq, companyId, reportId],
    );
    add(rows, 1);
  }
  if (useVector && embedding) {
    const rows = await db.query(
      `SELECT id, report_id, page, content
         FROM esg.chunks
        WHERE company_id = $1 AND ($2::bigint IS NULL OR report_id = $2) AND embedding IS NOT NULL
        ORDER BY embedding <=> $3::vector
        LIMIT 20`,
      [companyId, reportId, `[${embedding.join(',')}]`],
    );
    add(rows, 1.2);
  }
  return [...ranked.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

function fmt(v) {
  return Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export async function answerQuestion({ db, llm, useVector }, { company, question, reportId = null }) {
  let embedding = null;
  if (useVector && llm.embeddingsProvider !== 'none') {
    try {
      [embedding] = (await llm.embed([question], { taskType: 'RETRIEVAL_QUERY' })) || [null];
    } catch (err) {
      console.warn('[ask] embedding failed, falling back to full-text:', err.message);
    }
  }
  const passages = await retrieve(db, { companyId: company.id, reportId, question, embedding, useVector, limit: 8 });
  const reports = await db.query(
    `SELECT id, title, fiscal_year, source_url FROM esg.reports WHERE company_id = $1`,
    [company.id],
  );
  const reportById = new Map(reports.map((r) => [r.id, r]));
  const facts = await db.query(
    `SELECT metric, fiscal_year, value, unit, page, report_id, method
       FROM esg.metrics WHERE company_id = $1 AND is_primary
      ORDER BY fiscal_year DESC, metric LIMIT 40`,
    [company.id],
  );

  const sources = passages.map((p, i) => ({
    n: i + 1,
    chunk_id: p.id,
    report_id: p.report_id,
    report_title: reportById.get(p.report_id)?.title || null,
    fiscal_year: reportById.get(p.report_id)?.fiscal_year || null,
    page: p.page,
    excerpt: p.content.length > 600 ? `${p.content.slice(0, 600)}…` : p.content,
  }));

  if (!passages.length && !facts.length) {
    return {
      answer: `GreenOrb has no processed report text for ${company.name} yet. Ingest a sustainability report first.`,
      mode: 'empty',
      sources: [],
    };
  }

  if (!llm.configured) {
    return {
      answer:
        'No LLM provider is configured, so here are the most relevant passages from the reports. ' +
        'Set GROQ_API_KEY (or GEMINI_API_KEY / OLLAMA_BASE_URL) on the API to get written answers.',
      mode: 'extractive',
      sources,
    };
  }

  const factLines = facts
    .map(
      (f) =>
        `- ${METRIC_LABELS[f.metric] || f.metric}, FY${f.fiscal_year}: ${fmt(f.value)} ${f.unit}` +
        (f.page ? ` (report #${f.report_id}, page ${f.page}${f.method === 'legacy' ? ', unverified legacy import' : ''})` : ''),
    )
    .join('\n');
  const context = sources
    .map((s) => `[${s.n}] ${s.report_title || 'Report'} (FY${s.fiscal_year ?? '?'}), page ${s.page}:\n${s.excerpt}`)
    .join('\n\n');

  const system =
    `You are GreenOrb, a careful ESG analyst. Answer questions about ${company.name} using ONLY the extracted ` +
    `metrics and report passages provided. Cite passages inline as [n]. If the answer is not in the material, ` +
    `say so plainly. Never invent numbers, years or targets. Keep answers under 200 words. ` +
    `Units: tCO2e = tonnes CO2-equivalent, MWh, m3, t.`;
  const user = `Extracted metrics (primary values):\n${factLines || '(none)'}\n\nReport passages:\n${context || '(none)'}\n\nQuestion: ${question}`;

  const out = await llm.chat({ system, user, maxTokens: 700, temperature: 0.1 });
  return { answer: out.text.trim(), mode: 'generative', provider: out.provider, model: out.model, latency_ms: out.latencyMs, sources };
}
