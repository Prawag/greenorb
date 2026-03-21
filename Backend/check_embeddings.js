import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config();
const sql = neon(process.env.DATABASE_URL);

async function check() {
    try {
        const count = await sql`SELECT count(*) FROM embeddings`;
        console.log("Embeddings count:", count);
        const samples = await sql`SELECT company_name, page_number FROM embeddings LIMIT 5`;
        console.table(samples);
    } catch (err) {
        console.error("Check failed:", err);
    }
}
check();
