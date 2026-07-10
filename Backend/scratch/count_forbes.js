import db from '../db.js';

async function run() {
  const r = await db.query("SELECT COUNT(*) FROM companies WHERE methodology LIKE '%Forbes%'");
  console.log("Forbes companies:", r.rows[0].count);
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
