import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();
const sql = neon(process.env.DATABASE_URL);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration011() {
  try {
    const sqlPath = path.join(__dirname, 'migrations', '011_tier_lock.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('Running migration 011...');
    const commands = sqlContent.split(';').map(cmd => cmd.trim()).filter(cmd => cmd.length > 0);
    for (const cmd of commands) {
      await sql.query(cmd);
    }
    console.log('Migration 011 completed successfully.');
  } catch (error) {
    console.error('Migration 011 failed:', error);
    process.exit(1);
  }
}

runMigration011().then(() => process.exit(0));
