import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';

dotenv.config();

const sql = neon(process.env.DATABASE_URL);
const dir = '../RawData/ESG_Reports/JSON_Results';

async function run() {
    try {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const rows = await sql`SELECT * FROM companies WHERE report_year IS NOT NULL`;
        console.log(`Found ${rows.length} relevant companies.`);

        rows.forEach(r => {
            const fileName = `${r.name.replace(/ /g, '_')}_${r.report_year}.json`;
            const filePath = path.join(dir, fileName);
            fs.writeFileSync(filePath, JSON.stringify(r, null, 2));
            console.log(`✅ Created: ${fileName}`);
        });

    } catch (err) {
        console.error("Gen JSON failed:", err);
    }
}

run();
