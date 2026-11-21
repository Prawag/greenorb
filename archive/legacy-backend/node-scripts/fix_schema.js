import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
dotenv.config();

const sql = neon(process.env.DATABASE_URL);

async function fix() {
  console.log('Synchronizing schema...');
  try {
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS audit_status TEXT DEFAULT 'PENDING'`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`;
    console.log('Columns audit_status and updated_at ensured.');
    
    // Check if companies has data
    const count = await sql`SELECT COUNT(*) FROM companies`;
    console.log(`Current company count: ${count[0].count}`);
    
    if (parseInt(count[0].count) === 0) {
      console.log('Database empty. Seeding...');
    }
  } catch (err) {
    console.error('Migration fix failed:', err.message);
  }
}

fix().then(() => process.exit(0));
