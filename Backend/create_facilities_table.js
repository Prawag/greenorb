import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
dotenv.config();

const sql = neon(process.env.DATABASE_URL);

async function run() {
    console.log("🛠️ Creating facilities table...");
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS facilities (
                id SERIAL PRIMARY KEY,
                company_name TEXT REFERENCES companies(name) ON DELETE CASCADE,
                facility_name TEXT NOT NULL,
                facility_type TEXT,
                lat DOUBLE PRECISION NOT NULL,
                lng DOUBLE PRECISION NOT NULL,
                status TEXT DEFAULT 'OPERATIONAL',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(company_name, facility_name)
            )
        `;
        console.log("✅ Table 'facilities' created or verified.");
    } catch (e) {
        console.error("❌ DB Error:", e.message);
    }
    process.exit(0);
}

run();
