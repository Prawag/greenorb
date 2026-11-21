import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
dotenv.config();

const sql = neon(process.env.DATABASE_URL);

async function test() {
    try {
        const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
        console.log("Tables found:", tables.map(t => t.table_name));
    } catch (e) {
        console.error("DB Error:", e.message);
    }
    process.exit(0);
}

test();
