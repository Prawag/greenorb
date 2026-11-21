import dotenv from 'dotenv';
import pg from 'pg';
const { Pool } = pg;
import axios from 'axios';
import { parse } from 'csv-parse/sync';

dotenv.config();

if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set in Backend/.env');
    process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

async function seedNifty500() {
    console.log(`🌱 Fetching official NIFTY 500 list from NSE...`);
    
    try {
        const response = await axios.get("https://archives.nseindia.com/content/indices/ind_nifty500list.csv", {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const records = parse(response.data, {
            columns: true,
            skip_empty_lines: true
        });

        console.log(`Found ${records.length} companies. Injecting into database...\n`);
        
        let inserted = 0;
        for (const record of records) {
            const companyName = record['Company Name'];
            const sector = record['Industry'] || 'Unknown';
            
            try {
                await pool.query(`
                    INSERT INTO companies (name, sector, country)
                    VALUES ($1, $2, 'India')
                    ON CONFLICT (name) DO NOTHING
                `, [companyName, sector]);
                inserted++;
                if (inserted % 50 === 0) {
                    console.log(`✅ Injected ${inserted}/${records.length} companies...`);
                }
            } catch (dbErr) {
                console.error(`❌ Failed to insert ${companyName}: ${dbErr.message}`);
            }
        }
        
        console.log(`\n🎉 Successfully injected ${inserted} new NIFTY 500 companies into the database!`);
        console.log(`They are now ready for the bulk scout runner to find their ESG PDFs.`);
        
    } catch (e) {
        console.error(`❌ Failed to fetch NIFTY 500 CSV:`, e.message);
    } finally {
        await pool.end();
    }
}

seedNifty500();
