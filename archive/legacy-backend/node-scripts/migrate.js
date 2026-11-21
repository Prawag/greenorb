import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config();

const sql = neon(process.env.DATABASE_URL);

async function migrate() {
    try {
        console.log("Running migration...");
        await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS report_year INTEGER`;
        await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS lat NUMERIC`;
        await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS lng NUMERIC`;
        await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS audit_status TEXT DEFAULT 'PENDING'`;
        await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`;
        console.log("✅ Successfully updated 'companies' table schema.");
    } catch (err) {
        console.error("Migration failed:", err);
    }
}

migrate();
