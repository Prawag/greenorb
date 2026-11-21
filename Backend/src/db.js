import pg from 'pg';

// Return BIGINT/COUNT as JS numbers (ids and counts stay far below 2^53) and NUMERIC as floats.
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

function sslOption(url, mode) {
  if (mode === 'disable') return false;
  if (mode === 'require') return { rejectUnauthorized: false };
  // auto: honour sslmode in the URL; Neon and most hosted providers require TLS.
  try {
    const u = new URL(url);
    const sslmode = u.searchParams.get('sslmode');
    if (sslmode === 'disable') return false;
    if (sslmode) return { rejectUnauthorized: false };
    const host = u.hostname;
    if (['localhost', '127.0.0.1', 'db', 'postgres'].includes(host) || host.endsWith('.local')) return false;
    return { rejectUnauthorized: false };
  } catch {
    return false;
  }
}

export function createDb(config) {
  const pool = new pg.Pool({
    connectionString: config.DATABASE_URL,
    ssl: sslOption(config.DATABASE_URL, config.DATABASE_SSL),
    max: config.DATABASE_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });
  pool.on('error', (err) => console.error('[db] idle client error:', err.message));

  const db = {
    pool,
    async query(text, params = []) {
      const res = await pool.query(text, params);
      return res.rows;
    },
    async one(text, params = []) {
      const rows = await db.query(text, params);
      return rows[0] ?? null;
    },
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const q = {
          query: async (t, p = []) => (await client.query(t, p)).rows,
          one: async (t, p = []) => (await client.query(t, p)).rows[0] ?? null,
        };
        const out = await fn(q);
        await client.query('COMMIT');
        return out;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
  return db;
}
