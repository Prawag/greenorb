import db from '../db.js';

async function run() {
  const r = await db.query("SELECT name, s1, s2, s3, report_year FROM companies WHERE name LIKE '%Aavas%'");
  console.log("Aavas database row:");
  console.table(r.rows);
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
