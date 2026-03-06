import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config();

const sql = neon(process.env.DATABASE_URL);

import fs from 'fs';

async function check() {
    try {
        const rows = await sql`SELECT * FROM companies WHERE name ILIKE '%H&M%' OR country ILIKE '%H&M%'`;
        fs.writeFileSync('hm_check.json', JSON.stringify(rows, null, 2));
        console.log("Data written to hm_check.json");
    } catch (err) {
        console.error("Check failed:", err);
    }
}

check();
