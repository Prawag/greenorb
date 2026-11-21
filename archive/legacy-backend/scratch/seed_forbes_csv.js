import fs from 'fs';
import { parse } from 'csv-parse/sync';
import db from '../db.js';

async function seed() {
  const content = fs.readFileSync('scratch/forbes_2000.csv', 'utf-8');
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true
  });
  console.log(`Found ${records.length} companies in CSV. Seeding...`);
  
  let inserted = 0;
  let skipped = 0;
  for (const r of records) {
    const name = r['Organization Name'] ? r['Organization Name'].trim() : null;
    if (!name) continue;
    
    const sector = r['Industry'] ? r['Industry'].trim() : 'Unknown';
    const country = r['Country'] ? r['Country'].trim() : 'Unknown';
    const rank = r['2022 Ranking'];
    const marketCap = r['Market Value (Billions)'];
    const methodology = `Forbes 2022 Rank #${rank} | Market Value: $${marketCap} B`;
    
    try {
      const res = await db.query(`
        INSERT INTO companies (name, sector, country, methodology)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (name) DO NOTHING
      `, [name, sector, country, methodology]);
      
      if (res.rowCount > 0) {
        inserted++;
      } else {
        skipped++;
      }
    } catch (e) {
      console.error(`Failed to insert ${name}:`, e.message);
    }
  }
  console.log(`Successfully seeded: ${inserted} new companies, skipped (already existed): ${skipped}`);
}

seed().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
