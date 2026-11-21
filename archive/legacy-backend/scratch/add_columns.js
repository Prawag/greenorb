import db from '../db.js';

async function run() {
  console.log("Adding columns to companies table...");
  await db.query("ALTER TABLE companies ADD COLUMN IF NOT EXISTS ebitda NUMERIC");
  await db.query("ALTER TABLE companies ADD COLUMN IF NOT EXISTS local_procurement_pct NUMERIC");
  await db.query("ALTER TABLE companies ADD COLUMN IF NOT EXISTS employee_count INTEGER");
  await db.query("ALTER TABLE companies ADD COLUMN IF NOT EXISTS operational_capacity NUMERIC");
  await db.query("ALTER TABLE companies ADD COLUMN IF NOT EXISTS capacity_unit TEXT");
  console.log("✅ Columns added successfully!");
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
