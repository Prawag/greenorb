import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config();

if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set');
    process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function run() {
    console.log('🧹 Cleaning up companies table...');
    
    // 1. Get count before delete
    const before = await sql`SELECT COUNT(*) FROM companies`;
    console.log(`Total companies before cleanup: ${before[0].count}`);

    // 2. Perform delete
    const result = await sql`
        DELETE FROM companies 
        WHERE (url IS NULL OR url = 'N/A' OR url = '') 
          AND (report_url IS NULL OR report_url = 'N/A' OR report_url = '')
    `;
    
    // 3. Get count after delete
    const after = await sql`SELECT COUNT(*) FROM companies`;
    console.log(`Total companies after cleanup: ${after[0].count}`);
    console.log(`Successfully removed ${before[0].count - after[0].count} entries whose ESG PDF is not present.`);
}

run().then(() => process.exit(0)).catch(err => {
    console.error('Cleanup failed:', err);
    process.exit(1);
});
