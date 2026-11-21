import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config();

if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set');
    process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function run() {
    // 1. Total companies
    const total = await sql`SELECT COUNT(*) FROM companies`;
    
    // 2. Count of companies with non-zero s1 or s2
    const withRealEmissions = await sql`SELECT COUNT(*) FROM companies WHERE (s1 IS NOT NULL AND s1 > 0) OR (s2 IS NOT NULL AND s2 > 0)`;
    
    // 3. Let's see all companies with non-zero emissions
    const examples = await sql`SELECT name, country, sector, s1, s2, s3, scope2_location, scope2_market, water_withdrawal_kl, renewable_energy_pct, net_zero_year FROM companies WHERE (s1 IS NOT NULL AND s1 > 0) OR (s2 IS NOT NULL AND s2 > 0) ORDER BY s1 DESC`;

    console.log('Total companies in database:', total[0].count);
    console.log('Companies with non-zero emissions data:', withRealEmissions[0].count);
    console.log('\nAll companies with non-zero emissions data:');
    console.table(examples);
}

run().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
