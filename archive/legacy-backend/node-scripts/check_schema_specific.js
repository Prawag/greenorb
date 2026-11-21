import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
dotenv.config();

const sql = neon(process.env.DATABASE_URL);

async function check() {
  const tables = ['companies', 'facilities'];
  for (const table of tables) {
    const columns = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = ${table}
    `;
    console.log(`\nColumns for ${table}:`);
    columns.forEach(c => console.log(`  - ${c.column_name} (${c.data_type})`));
  }
}

check().then(() => process.exit(0));
