require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

async function runMigration() {
    const sql = neon(process.env.DATABASE_URL);
    try {
        await sql`
            ALTER TABLE companies
            ADD COLUMN IF NOT EXISTS verification_body TEXT,
            ADD COLUMN IF NOT EXISTS energy_consumption NUMERIC,
            ADD COLUMN IF NOT EXISTS water_withdrawal NUMERIC,
            ADD COLUMN IF NOT EXISTS waste_generated NUMERIC,
            ADD COLUMN IF NOT EXISTS renewable_energy_pct NUMERIC,
            ADD COLUMN IF NOT EXISTS scope2_location NUMERIC,
            ADD COLUMN IF NOT EXISTS scope2_market NUMERIC,
            ADD COLUMN IF NOT EXISTS net_zero_year INTEGER,
            ADD COLUMN IF NOT EXISTS revenue NUMERIC,
            ADD COLUMN IF NOT EXISTS profit NUMERIC,
            ADD COLUMN IF NOT EXISTS supply_chain_budget NUMERIC
        `;
        console.log("✅ Database schema migrated successfully with new financial columns.");
    } catch (e) {
        console.error("❌ Migration failed:", e);
    }
}

runMigration();
