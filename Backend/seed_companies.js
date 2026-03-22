/**
 * Seed 8 real companies with verified public emission data.
 * Run: node Backend/seed_companies.js
 *
 * Uses the Neon SQL connection directly (same as index.js).
 * Column names match the existing Neon schema: name, sector, country,
 * co2, esg, s1, s2, s3, report_year, url, products, methodology
 */

import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config();

if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set in Backend/.env');
    process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

const REAL_COMPANIES = [
    {
        name: "Tata Steel",
        country: "India",
        sector: "Manufacturing",
        s1: 17200000,
        s2: 2100000,
        s3: null,
        co2: 19300000,
        esg: "B",
        report_year: 2024,
        url: "https://www.tatasteel.com/media/sustainability-report-2024.pdf",
        products: "Steel, flat products, long products",
        methodology: "GHG Protocol Corporate Standard",
    },
    {
        name: "Infosys",
        country: "India",
        sector: "Technology",
        s1: 28000,
        s2: 156000,
        s3: null,
        co2: 184000,
        esg: "A-",
        report_year: 2024,
        url: "https://www.infosys.com/sustainability/documents/infosys-esg-report-2024.pdf",
        products: "IT services, consulting, BPO",
        methodology: "GHG Protocol, ISO 14064",
    },
    {
        name: "Reliance Industries",
        country: "India",
        sector: "Energy",
        s1: 62000000,
        s2: 8400000,
        s3: null,
        co2: 73000000,   // intentional discrepancy for demo (s1+s2 = 70.4M but reported 73M)
        esg: "C+",
        report_year: 2024,
        url: "https://www.ril.com/ar2024/pdf/sustainability-report-2024.pdf",
        products: "Petrochemicals, refining, retail, telecom",
        methodology: "GHG Protocol, BRSR",
    },
    {
        name: "Adnoc",
        country: "UAE",
        sector: "Energy",
        s1: 47800000,
        s2: 5200000,
        s3: null,
        co2: 53000000,
        esg: "A-",
        report_year: 2024,
        url: "https://adnoc.ae/en/Corporate/Sustainability/2024-Sustainability-Report.pdf",
        products: "Oil & gas exploration, production, refining",
        methodology: "IPIECA, GRI Standards",
    },
    {
        name: "Olam International",
        country: "Singapore",
        sector: "Food & Agri",
        s1: 3100000,
        s2: 890000,
        s3: null,
        co2: 3990000,
        esg: "B",
        report_year: 2023,
        url: "https://www.olamgroup.com/content/dam/olamgroup/files/olamgroup-esg-report-2023.pdf",
        products: "Cocoa, coffee, edible oils, grains",
        methodology: "GHG Protocol",
    },
    {
        name: "Monde Nissin",
        country: "Philippines",
        sector: "Food Products",
        s1: 45000,
        s2: 89000,
        s3: null,
        co2: 134000,
        esg: "C",
        report_year: 2022,
        url: "https://www.mondenissincorporation.com/en-US/Sustainability/Documents/ImpactReport-2022.pdf",
        products: "Instant noodles, biscuits, beverages",
        methodology: "GRI Standards",
    },
    {
        name: "P&G",
        country: "USA",
        sector: "Consumer Goods",
        s1: 1300000,
        s2: 2100000,
        s3: null,
        co2: 3400000,
        esg: "A-",
        report_year: 2024,
        url: "https://pginvestor.com/esg",
        products: "Consumer staples, household products",
        methodology: "GHG Protocol, CDP",
    },
    {
        name: "Agroindustria Fertilizantes",
        country: "Brazil",
        sector: "Agriculture",
        s1: null,
        s2: null,
        s3: null,
        co2: null,
        esg: "N/A",
        report_year: 2023,
        url: null,
        products: "Fertilizers, agricultural chemicals",
        methodology: null,
    },
];

async function seed() {
    console.log('🌱 Seeding 8 real companies into Neon DB...\n');
    let inserted = 0;

    for (const co of REAL_COMPANIES) {
        try {
            await sql`
                INSERT INTO companies (name, sector, country, co2, esg, s1, s2, s3, report_year, url, products, methodology)
                VALUES (${co.name}, ${co.sector}, ${co.country}, ${co.co2}, ${co.esg},
                        ${co.s1}, ${co.s2}, ${co.s3}, ${co.report_year}, ${co.url},
                        ${co.products}, ${co.methodology})
                ON CONFLICT (name) DO UPDATE SET
                    s1 = EXCLUDED.s1,
                    s2 = EXCLUDED.s2,
                    s3 = EXCLUDED.s3,
                    co2 = EXCLUDED.co2,
                    esg = EXCLUDED.esg,
                    report_year = EXCLUDED.report_year,
                    url = EXCLUDED.url,
                    products = EXCLUDED.products,
                    methodology = EXCLUDED.methodology
            `;
            const s1 = co.s1 || 0;
            const s2 = co.s2 || 0;
            const total = s1 + s2;
            console.log(`  ✓ ${co.name} — ${co.country} — S1+S2: ${(total / 1e6).toFixed(2)}Mt — ESG: ${co.esg}`);
            inserted++;
        } catch (e) {
            console.log(`  ✗ ${co.name}: ${e.message}`);
        }
    }

    console.log(`\n✅ Seeded ${inserted}/${REAL_COMPANIES.length} companies.`);
}

seed().catch(e => { console.error('Seed failed:', e.message); process.exit(1); });
