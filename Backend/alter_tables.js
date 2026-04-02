import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
dotenv.config();

const sql = neon(process.env.DATABASE_URL);

async function alter() {
  try {
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS city TEXT;`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS geocoding_source TEXT;`;
    console.log('Columns added successfully');
  } catch (err) {
    console.error('Error adding columns:', err);
  }
  process.exit(0);
}

alter();
