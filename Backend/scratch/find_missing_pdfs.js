import db from '../db.js';
import fs from 'fs';
import path from 'path';

async function run() {
  const r = await db.query("SELECT name, url FROM companies WHERE url IS NOT NULL AND url != ''");
  console.log("Total companies with URL in DB:", r.rows.length);
  
  let missing = 0;
  for (const row of r.rows) {
    const filename = path.basename(row.url);
    const filepath = path.join('downloaded_reports', filename);
    if (!fs.existsSync(filepath)) {
      console.log(`Missing PDF for: ${row.name} (expected: ${filepath}, url: ${row.url})`);
      missing++;
    }
  }
  console.log("Total missing PDFs:", missing);
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
