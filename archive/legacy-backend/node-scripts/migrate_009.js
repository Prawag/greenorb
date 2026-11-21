import dotenv from 'dotenv';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function runMigration() {
  try {
    const sqlPath = path.join(__dirname, 'migrations', '009_esg_sources.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Running Migration 009: esg_sources');
    await pool.query(sql);
    console.log('Migration 009 completed successfully.');
  } catch (error) {
    console.error('Error running migration 009:', error);
  } finally {
    pool.end();
  }
}

runMigration();
