import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

const sql = neon(process.env.DATABASE_URL);

async function run() {
    try {
        await sql`ALTER TABLE facilities ADD COLUMN IF NOT EXISTS ndvi_mean NUMERIC(5,4)`;
        await sql`ALTER TABLE facilities ADD COLUMN IF NOT EXISTS ndvi_verdict VARCHAR(50)`;
        await sql`ALTER TABLE facilities ADD COLUMN IF NOT EXISTS ndvi_date DATE`;
        await sql`ALTER TABLE facilities ADD COLUMN IF NOT EXISTS no2_column NUMERIC(10,6)`;
        await sql`ALTER TABLE facilities ADD COLUMN IF NOT EXISTS no2_verdict VARCHAR(50)`;
        await sql`ALTER TABLE facilities ADD COLUMN IF NOT EXISTS no2_date DATE`;
        await sql`ALTER TABLE facilities ADD COLUMN IF NOT EXISTS cloud_coverage_pct NUMERIC(5,2)`;
        await sql`ALTER TABLE facilities ADD COLUMN IF NOT EXISTS satellite_updated_at TIMESTAMPTZ`;
        console.log('✅ Migration 008: satellite columns added to facilities');
    } catch(e) {
        console.error('❌ Migration 008 failed:', e.message);
    }
}
run();
