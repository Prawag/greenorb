import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();
const sql = neon(process.env.DATABASE_URL);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration010() {
  try {
    const sqlPath = path.join(__dirname, 'migrations', '010_company_profile.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('Running migration 010...');
    await sql(fs.readFileSync(sqlPath, 'utf8'));
    console.log('Migration 010 completed successfully.');
  } catch (error) {
    console.error('Migration 010 failed:', error);
  }
}

// Check if run directly
if (process.argv[1] === __filename || process.argv[1].endsWith('migrate_010.js')) {
    runMigration010().then(() => process.exit(0)).catch(() => process.exit(1));
}

export default runMigration010;
