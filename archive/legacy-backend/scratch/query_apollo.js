import db from '../db.js';

async function query() {
    try {
        console.log('Querying database for companies like Apollo...');
        const res = await db.query(
            "SELECT name, report_year, s1, s2, s3, co2 FROM companies WHERE name ILIKE '%Apollo%'"
        );
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    }
    process.exit(0);
}

query();
