import pg from 'pg';
import https from 'https';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const JSON_URL = 'https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master/json/countries%2Bstates%2Bcities.json';

function download(url) {
    return new Promise((resolve, reject) => {
        https.get(url, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(e); }
            });
            res.on('error', reject);
        });
    });
}

async function run() {
    const client = await pool.connect();
    try {
        console.log('Creating table...');
        await client.query(`
      CREATE TABLE IF NOT EXISTS geo_cities (
        id       SERIAL PRIMARY KEY,
        name     TEXT,
        state    TEXT,
        country  TEXT,
        iso2     CHAR(2),
        iso3     CHAR(3),
        lat      FLOAT,
        lng      FLOAT,
        timezone TEXT
      )
    `);

        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_geo_cities_country 
      ON geo_cities(iso2)
    `);

        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_geo_cities_name 
      ON geo_cities(LOWER(name))
    `);

        console.log('Downloading cities database from GitHub...');
        const countries = await download(JSON_URL);

        console.log('Importing — this takes about 60 seconds...');
        let count = 0;
        for (const country of countries) {
            for (const state of country.states || []) {
                for (const city of state.cities || []) {
                    await client.query(
                        `INSERT INTO geo_cities (name, state, country, iso2, iso3, lat, lng, timezone)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT DO NOTHING`,
                        [
                            city.name,
                            state.name,
                            country.name,
                            country.iso2,
                            country.iso3,
                            parseFloat(city.latitude) || null,
                            parseFloat(city.longitude) || null,
                            city.timezone || null,
                        ]
                    );
                    count++;
                }
            }
        }

        console.log(`Done. ${count} cities imported into Neon PostgreSQL.`);
    } finally {
        client.release();
        await pool.end();
    }
}

run().catch(err => {
    console.error('Import failed:', err.message);
    process.exit(1);
});