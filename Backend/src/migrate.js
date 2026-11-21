import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/**
 * Apply SQL migrations in filename order. Files named `*.optional.sql` require the
 * pgvector extension; they are skipped (and retried on the next start) when it is missing.
 * Uses an advisory lock so several API instances can start at the same time safely.
 */
export async function migrate(db, { log = console.log } = {}) {
  const client = await db.pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(727274)');
    await client.query('CREATE SCHEMA IF NOT EXISTS esg');
    await client.query(`CREATE TABLE IF NOT EXISTS esg.schema_migrations (
      version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const done = new Set((await client.query('SELECT version FROM esg.schema_migrations')).rows.map((r) => r.version));
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    const applied = [];
    const skipped = [];

    for (const file of files) {
      if (done.has(file)) continue;
      if (file.endsWith('.optional.sql')) {
        try {
          await client.query('CREATE EXTENSION IF NOT EXISTS vector');
        } catch (err) {
          skipped.push(file);
          log(`[migrate] skipping ${file}: pgvector unavailable (${err.message}). Ask-the-report will use full-text search.`);
          continue;
        }
      }
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO esg.schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
        log(`[migrate] applied ${file}`);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`Migration ${file} failed: ${err.message}`);
      }
    }
    return { applied, skipped };
  } finally {
    await client.query('SELECT pg_advisory_unlock(727274)').catch(() => {});
    client.release();
  }
}

export async function hasVectorColumn(db) {
  const row = await db.one(
    `SELECT 1 AS ok FROM information_schema.columns
     WHERE table_schema = 'esg' AND table_name = 'chunks' AND column_name = 'embedding'`,
  );
  return Boolean(row);
}
