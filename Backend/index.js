import 'dotenv/config';
import { loadConfig } from './src/config.js';
import { createDb } from './src/db.js';
import { hasVectorColumn, migrate } from './src/migrate.js';
import { createLlm } from './src/services/llm.js';
import { createApp } from './src/app.js';

async function main() {
  const config = loadConfig();
  const db = createDb(config);

  if (config.MIGRATE_ON_START) await migrate(db);
  const features = { vector: await hasVectorColumn(db).catch(() => false) };
  const llm = createLlm(config);

  if (!config.ADMIN_TOKEN) console.warn('[api] ADMIN_TOKEN is not set: reviewing, editing and ingestion are disabled.');
  if (!llm.configured) console.warn('[api] No LLM provider configured: Ask-the-report returns passages only.');

  const app = createApp({ db, config, llm, features });
  const server = app.listen(config.PORT, () => {
    console.log(`[api] GreenOrb API listening on :${config.PORT}`);
    console.log(`[api] LLM: ${llm.providers.map((p) => `${p.name}(${p.model})`).join(' → ') || 'none'} · embeddings: ${llm.embeddingsProvider} · vector search: ${features.vector}`);
  });

  const shutdown = (signal) => {
    console.log(`[api] ${signal} received, shutting down`);
    server.close(async () => {
      await db.close().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[api] failed to start:', err.message);
  process.exit(1);
});
