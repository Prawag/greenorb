import { z } from 'zod';

const bool = (def) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const csv = (def) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? v : def).split(',').map((s) => s.trim()).filter(Boolean));

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (Neon or any Postgres 14+ connection string)'),
  DATABASE_SSL: z.enum(['auto', 'require', 'disable']).default('auto'),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  MIGRATE_ON_START: bool(true),

  // Comma-separated list of allowed browser origins. Empty = same-origin only (plus localhost in dev).
  ALLOWED_ORIGINS: csv(''),
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),

  // Reviewer / admin token. Required for review, edits, reprocessing and (by default) ingestion.
  ADMIN_TOKEN: z.string().optional().default(''),
  PUBLIC_INGEST: bool(false),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(40),
  RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(120),
  ASK_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(10),
  INGEST_RATE_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(20),

  // LLM providers (OpenAI-compatible chat completions), tried in order.
  LLM_PROVIDERS: csv('groq,gemini,openai,ollama'),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  GROQ_API_KEY: z.string().optional().default(''),
  GROQ_MODEL: z.string().default('llama-3.3-70b-versatile'),
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  OPENAI_API_KEY: z.string().optional().default(''),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_BASE_URL: z.string().default('https://api.openai.com/v1'),
  OLLAMA_BASE_URL: z.string().optional().default(''),
  OLLAMA_MODEL: z.string().default('llama3.1:8b'),

  // Embeddings for semantic search. Must match the worker's setting.
  EMBEDDINGS_PROVIDER: z.enum(['auto', 'gemini', 'openai', 'ollama', 'none']).default('auto'),
  GEMINI_EMBED_MODEL: z.string().default('gemini-embedding-001'),
  OPENAI_EMBED_MODEL: z.string().default('text-embedding-3-small'),
  OLLAMA_EMBED_MODEL: z.string().default('nomic-embed-text'),
});

export function loadConfig(env = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${msg}`);
  }
  const c = parsed.data;
  c.isProd = c.NODE_ENV === 'production';
  if (c.EMBEDDINGS_PROVIDER === 'auto') {
    c.EMBEDDINGS_PROVIDER = c.GEMINI_API_KEY ? 'gemini' : c.OPENAI_API_KEY ? 'openai' : 'none';
  }
  return c;
}
