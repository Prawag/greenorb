import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config();

if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set');
    process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function run() {
    console.log('🧹 Running additional cleanup for malformed company names...');
    
    // 1. Get count before delete
    const before = await sql`SELECT COUNT(*) FROM companies`;
    
    // 2. Delete malformed names (pure digits or year-only names)
    const result = await sql`
        DELETE FROM companies 
        WHERE name ~ '^\\d+$' 
           OR name IN ('2024', '2025', '2026', '2023', '2022', 'unknown', 'Unknown')
    `;
    
    // 3. Get count after delete
    const after = await sql`SELECT COUNT(*) FROM companies`;
    console.log(`Total companies after malformed names cleanup: ${after[0].count}`);
    console.log(`Successfully removed ${before[0].count - after[0].count} malformed company entries.`);
}

run().then(() => process.exit(0)).catch(err => {
    console.error('Cleanup failed:', err);
    process.exit(1);
});
