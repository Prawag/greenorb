import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config();

if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set');
    process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function run() {
    const docExamples = await sql`SELECT c.name, d.title, d.url, d.local_path FROM esg_documents d JOIN esg_companies c ON d.company_id = c.id WHERE c.name ILIKE '%Dell%'`;
    console.log('\nDell documents:');
    console.table(docExamples);
}

run().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
