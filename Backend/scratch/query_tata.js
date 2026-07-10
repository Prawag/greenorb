import db from '../db.js';

async function query() {
    try {
        console.log('Querying database for Tata Motors records...');
        const res = await db.query(
            "SELECT name, report_year, revenue, profit, employee_count, s1, s2, s3, co2 FROM companies WHERE name ILIKE '%Tata%'"
        );
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    }
    process.exit(0);
}

query();
