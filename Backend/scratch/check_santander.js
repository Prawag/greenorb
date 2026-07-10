import db from '../db.js';

async function run() {
  const r = await db.query("SELECT * FROM companies WHERE name = 'Santander US'");
  console.log("Santander US database row:");
  console.table(r.rows);
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
