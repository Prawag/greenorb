import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config();

const sql = neon(process.env.DATABASE_URL);

async function migrate() {
    try {
        console.log("Running migration...");
        await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS report_year INTEGER`;
        console.log("✅ Successfully added 'report_year' column to 'companies' table.");
    } catch (err) {
        console.error("Migration failed:", err);
    }
}

migrate();
