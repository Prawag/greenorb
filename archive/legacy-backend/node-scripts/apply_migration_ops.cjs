require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

async function runMigration() {
    const sql = neon(process.env.DATABASE_URL);
    try {
        await sql`
            ALTER TABLE companies
            ADD COLUMN IF NOT EXISTS facilities_list TEXT,
            ADD COLUMN IF NOT EXISTS services TEXT,
            ADD COLUMN IF NOT EXISTS production_volume TEXT,
            ADD COLUMN IF NOT EXISTS manufacturing_process TEXT,
            ADD COLUMN IF NOT EXISTS manufacturing_co2 NUMERIC,
            ADD COLUMN IF NOT EXISTS lifecycle_co2 TEXT
        `;
        console.log("✅ Database schema migrated successfully with operational columns.");
    } catch (e) {
        console.error("❌ Migration failed:", e);
    }
}

runMigration();
