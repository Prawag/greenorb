import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
dotenv.config();

const sql = neon(process.env.DATABASE_URL);

async function alterTable() {
  try {
    console.log('Adding city column to companies...');
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS city TEXT`;
    console.log('Column added successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Error altering table:', err);
    process.exit(1);
  }
}

alterTable();
