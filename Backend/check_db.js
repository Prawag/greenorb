import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config();

const sql = neon(process.env.DATABASE_URL);

async function check() {
    try {
        const rows = await sql`SELECT sector, count(*) FROM companies GROUP BY sector ORDER BY count DESC`;
        console.log("Unique Sectors in DB:");
        console.table(rows);
    } catch (err) {
        console.error("Check failed:", err);
    }
}

check();
