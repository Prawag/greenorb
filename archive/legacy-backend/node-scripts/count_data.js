import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
dotenv.config();

const sql = neon(process.env.DATABASE_URL);

async function run() {
  const c = await sql`SELECT COUNT(*) FROM companies`;
  const f = await sql`SELECT COUNT(*) FROM facilities`;
  console.log('Companies:', c[0].count);
  console.log('Facilities:', f[0].count);
}

run().then(() => process.exit(0));
