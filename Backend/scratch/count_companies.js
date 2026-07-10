import db from '../db.js';

async function count() {
    try {
        const res = await db.query('SELECT COUNT(*) FROM companies');
        console.log('Total companies in database:', res.rows[0]);
    } catch (e) {
        console.error('Error:', e.message);
    }
    process.exit(0);
}

count();
