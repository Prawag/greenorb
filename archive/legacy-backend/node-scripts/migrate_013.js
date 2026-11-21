import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();
const sql = neon(process.env.DATABASE_URL);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration013() {
  try {
    const sqlPath = path.join(__dirname, 'migrations', '013_financial_final.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('Running migration 013 (Financial Intelligence)...');
    const commands = sqlContent.split(';').map(cmd => cmd.trim()).filter(cmd => cmd.length > 0);
    for (const cmd of commands) {
      await sql.query(cmd);
    }
    console.log('Migration 013 completed successfully.');
  } catch (error) {
    console.error('Migration 013 failed:', error);
    process.exit(1);
  }
}

runMigration013().then(() => process.exit(0));
