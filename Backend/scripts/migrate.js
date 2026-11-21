import 'dotenv/config';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db.js';
import { migrate } from '../src/migrate.js';

const db = createDb(loadConfig());
try {
  const { applied, skipped } = await migrate(db);
  console.log(`[migrate] done. applied: ${applied.length ? applied.join(', ') : 'none'}${skipped.length ? `; skipped: ${skipped.join(', ')}` : ''}`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
