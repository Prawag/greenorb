import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const sql = neon(process.env.DATABASE_URL);
const stmt = fs.readFileSync('./migrations/003_news_correlation.sql', 'utf8');
(async () => {
    try {
        await sql(stmt);
        console.log("Migration 003 applied successfully!");
    } catch(e) {
        console.error("Migration failed:", e);
    }
})();
