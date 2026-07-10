import db from '../db.js';

async function run() {
  const r = await db.query("SELECT COUNT(*) FROM companies");
  console.log("Total companies:", r.rows[0].count);
  
  const r2 = await db.query("SELECT name FROM companies ORDER BY name LIMIT 50");
  console.log("First 50 companies:");
  console.log(r2.rows.map(row => row.name));
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
