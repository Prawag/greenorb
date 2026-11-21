import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
dotenv.config();

const sql = neon(process.env.DATABASE_URL);

async function checkCompanies() {
  try {
    const rows = await sql`SELECT count(*) FROM companies`;
    console.log('Company Count:', rows[0].count);
    
    const sample = await sql`SELECT name, country, city, lat, lng FROM companies LIMIT 5`;
    console.log('Sample Companies:', JSON.stringify(sample, null, 2));
    
    process.exit(0);
  } catch (err) {
    console.error('Error checking companies:', err);
    process.exit(1);
  }
}

checkCompanies();
