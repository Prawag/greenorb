import db from '../db.js';
import fs from 'fs';
import path from 'path';

async function exportData() {
    try {
        console.log('Querying companies table...');
        const res = await db.query('SELECT * FROM companies ORDER BY updated_at DESC');
        const rows = res.rows || [];
        
        const outputPath = path.join(process.cwd(), '..', 'extracted_companies.json');
        fs.writeFileSync(outputPath, JSON.stringify(rows, null, 2), 'utf-8');
        
        console.log(`Successfully exported ${rows.length} records to ${outputPath}`);
        
        // Print preview of first 3 records
        console.log('\n--- PREVIEW OF RECENT RECORDS ---');
        console.log(JSON.stringify(rows.slice(0, 3), null, 2));
    } catch (e) {
        console.error('Error during export:', e.message);
    }
    process.exit(0);
}

exportData();
