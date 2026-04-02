import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config();
const sql = neon(process.env.DATABASE_URL);

async function format() {
    try {
        await sql`ALTER TABLE proximity_alerts ALTER COLUMN company_id TYPE TEXT`;
        console.log('Fixed DB type mismatch for proximity_alerts');
    } catch(e) {
        console.error(e.message);
    }
}
format();
