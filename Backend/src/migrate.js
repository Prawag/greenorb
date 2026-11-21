import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const LOCK_ID = 727274;

/**
 * Apply SQL migrations in filename order, each in its own transaction guarded by a
 * transaction-scoped advisory lock (safe with PgBouncer/Neon pooled connections and with
 * several API instances starting at once). Files named `*.optional.sql` need pgvector; they
 * are skipped, and retried on the next start, when the extension is unavailable.
 */
export async function migrate(db, { log = console.log } = {}) {
  const client = await db.pool.connect();
  const applied = [];
  const skipped = [];
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_ID]);
    await client.query('CREATE SCHEMA IF NOT EXISTS esg');
    await client.query(`CREATE TABLE IF NOT EXISTS esg.schema_migrations (
      version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await client.query('COMMIT');
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

    for (const file of files) {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_ID]);
        const done = await client.query('SELECT 1 FROM esg.schema_migrations WHERE version = $1', [file]);
        if (done.rowCount) {
          await client.query('COMMIT');
          continue;
        }
        if (file.endsWith('.optional.sql')) {
          await client.query('SAVEPOINT ext');
          try {
            await client.query('CREATE EXTENSION IF NOT EXISTS vector');
          } catch (err) {
            await client.query('ROLLBACK TO SAVEPOINT ext');
            await client.query('COMMIT');
            skipped.push(file);
            log(`[migrate] skipping ${file}: pgvector unavailable (${err.message}). Ask-the-report will use full-text search.`);
            continue;
          }
        }
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
