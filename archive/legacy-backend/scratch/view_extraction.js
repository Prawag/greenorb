import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not defined in env.');
    process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function main() {
    try {
        console.log('Querying Neon database for 3M India Limited (2020)...');
        const rows = await sql`
            SELECT * FROM companies 
            WHERE name = '3M India Limited' AND report_year = 2022
        `;
        
        if (rows.length === 0) {
            console.log('No database records found matching this company/year.');
        } else {
            console.log('\n--- EXTRACTED DATABASE ENTRY ---');
            console.log(JSON.stringify(rows[0], null, 2));
            console.log('--------------------------------\n');
        }
    } catch (e) {
        console.error('Query error:', e);
    }
}

main();
