import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
dotenv.config();

const sql = neon(process.env.DATABASE_URL);

async function checkSchema() {
  try {
    const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
    console.log('Tables:', tables.map(t => t.table_name));
    
    for (const table of tables) {
      const columns = await sql.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${table.table_name}'`);
      console.log(`Columns for ${table.table_name}:`, columns.map(c => `${c.column_name} (${c.data_type})`));
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

checkSchema().then(() => process.exit(0));
