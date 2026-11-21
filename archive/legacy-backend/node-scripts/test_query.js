import sql from './db.js';

async function test() {
  try {
    const res = await sql`SELECT * FROM companies LIMIT 1`;
    console.log(res);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
test();
