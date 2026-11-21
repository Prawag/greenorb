import db from '../db.js';

async function query() {
    try {
        console.log('Querying companies with non-null Scope 1, 2, or 3 emissions...');
        const res = await db.query(
            'SELECT name, report_year, s1, s2, s3, co2 FROM companies WHERE s1 IS NOT NULL OR s2 IS NOT NULL OR s3 IS NOT NULL LIMIT 10'
        );
        const rows = res.rows || [];
        console.log(`Found ${rows.length} examples:\n`);
        console.log(JSON.stringify(rows, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    }
    process.exit(0);
}

query();
