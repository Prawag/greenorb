/**
 * Seed all 50 fallback companies with analysis, risks, and strategies into the Neon DB.
 * Run: node Backend/seed_companies.js
 */

import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { FALLBACK_COMPANIES } from '../src/data/fallbackData.js';

dotenv.config();

if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set in Backend/.env');
    process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function seed() {
    console.log(`🌱 Seeding ${FALLBACK_COMPANIES.length} companies into Neon DB...\n`);
    let inserted = 0;

    for (const co of FALLBACK_COMPANIES) {
        try {
            // 1. Insert into companies
            await sql`
                INSERT INTO companies (name, sector, country, co2, esg, s1, s2, s3, report_year, url, products, methodology)
                VALUES (${co.name}, ${co.sector}, ${co.country}, ${co.co2 || null}, ${co.esg || null},
                        ${co.s1 || null}, ${co.s2 || null}, ${co.s3 || null}, ${co.report_year || null}, ${co.url || null},
                        ${co.products || null}, ${co.methodology || null})
                ON CONFLICT (name) DO UPDATE SET
                    sector = EXCLUDED.sector,
                    country = EXCLUDED.country,
                    co2 = EXCLUDED.co2,
                    esg = EXCLUDED.esg,
                    s1 = EXCLUDED.s1,
                    s2 = EXCLUDED.s2,
                    s3 = EXCLUDED.s3,
                    report_year = EXCLUDED.report_year,
                    url = EXCLUDED.url,
                    products = EXCLUDED.products,
                    methodology = EXCLUDED.methodology
            `;

            // 2. Insert into analysis
            await sql`
                INSERT INTO analysis (company, score, e_score, s_score, g_score, trend, peer)
                VALUES (${co.name}, ${co.score || null}, ${co.e_score || null}, ${co.s_score || null}, ${co.g_score || null}, ${co.trend || null}, ${co.peer || null})
                ON CONFLICT (company) DO UPDATE SET
                    score = EXCLUDED.score,
                    e_score = EXCLUDED.e_score,
                    s_score = EXCLUDED.s_score,
                    g_score = EXCLUDED.g_score,
                    trend = EXCLUDED.trend,
                    peer = EXCLUDED.peer
            `;

            // 3. Insert into risks
            await sql`
                INSERT INTO risks (company, greenwash, reg_risk, climate_exp, data_quality, red_flags, compliance)
                VALUES (${co.name}, ${co.greenwash || null}, ${co.reg_risk || null}, ${co.climate_exp || null}, ${co.data_quality || null}, ${co.red_flags || null}, ${co.compliance || null})
                ON CONFLICT (company) DO UPDATE SET
                    greenwash = EXCLUDED.greenwash,
                    reg_risk = EXCLUDED.reg_risk,
                    climate_exp = EXCLUDED.climate_exp,
                    data_quality = EXCLUDED.data_quality,
                    red_flags = EXCLUDED.red_flags,
                    compliance = EXCLUDED.compliance
            `;

            // 4. Insert into strategies
            await sql`
                INSERT INTO strategies (company, action, confidence, rationale, price_impact, catalyst, timeline)
                VALUES (${co.name}, ${co.action || null}, ${co.confidence || null}, ${co.rationale || null}, ${co.price_impact || null}, ${co.catalyst || null}, ${co.timeline || null})
                ON CONFLICT (company) DO UPDATE SET
                    action = EXCLUDED.action,
                    confidence = EXCLUDED.confidence,
                    rationale = EXCLUDED.rationale,
                    price_impact = EXCLUDED.price_impact,
                    catalyst = EXCLUDED.catalyst,
                    timeline = EXCLUDED.timeline
            `;

            console.log(`  ✓ ${co.name} seeded successfully.`);
            inserted++;
        } catch (e) {
            console.log(`  ✗ ${co.name}: ${e.message}`);
        }
    }

    console.log(`\n✅ Seeded ${inserted}/${FALLBACK_COMPANIES.length} companies.`);
}

seed().catch(e => { console.error('Seed failed:', e.message); process.exit(1); });
