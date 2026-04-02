import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { execFile } from 'child_process';
import path from 'path';
import NodeCache from 'node-cache';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { writeFile } from 'fs/promises';
import { buildSpatialIndex } from './lib/spatial-water.js';

// Globe API route modules
import mountGlobePoints from './api/globe-points.js';
import mountCountryChoropleth from './api/country-choropleth.js';
import mountEsgNews from './api/esg-news.js';
import mountClimateTrace from './api/climate-trace.js';
import mountGdelt from './api/gdelt.js';
import mountGreenwashVelocity from './api/greenwash-velocity.js';
import mountNasaFirms from './api/nasa-firms.js';
import mountGridCarbon from './api/grid-carbon.js';
import mountAirQuality from './api/air-quality.js';
import mountEarthquakes from './api/earthquakes.js';
import mountFloods from './api/floods.js';
import mountCyclones from './api/cyclones.js';
import mountVolcanoes from './api/volcanoes.js';
import mountNasaEonet from './api/nasa-eonet.js';
import mountDisastersProximity from './api/disasters-proximity.js';
import mountFacilities from './api/facilities.js';
import mountGpmImerg from './api/gpm-imerg.js';
import mountSentinel5p from './api/sentinel-5p.js';
import mountBiodiversity from './api/biodiversity.js';
import mountOceanCurrents from './api/ocean-currents.js';
import mountOceanHealthPace from './api/ocean-health-pace.js';
import mountWaterStress from './api/water-stress.js';
import mountBrsrPdf from './api/brsr-pdf.js';
import mountForestLoss from './api/forest-loss.js';
import mountCoralBleaching from './api/coral-bleaching.js';
import mountFishingWatch from './api/fishing-watch.js';
import mountScope2Verifier from './api/scope2-verifier.js';
import compareApi from './api/compare.js';
import welfordCheck from './api/welford-check.js';
import mountCityIiot from './api/city-iiot.js';
import llmStatus from './api/llm-status.js';
import llmRouter from './lib/llm-router.js';
import { runBrsrIngestion } from './workers/brsr-ingestion.js';
import { computeGreendex } from './lib/greendex.js';
import mountSatelliteVerify from './api/satellite-verify.js';
import mountOsiIngest from './api/osi-ingest.js';
import mountEsgCompare from './api/esg-compare.js';
import mountSpatialFacilities from './lib/spatial-facilities.js';
import mountOsmFacilities from './api/osm-facilities.js';
import mountWikidataFacilities from './api/wikidata-facilities.js';
import mountProductLca from './api/product-lca.js';

// Track B Imports
import mountImportYeti from './api/importyeti.js';
import mountOshFacilities from './api/osh-facilities.js';
import mountVesselTracking from './api/vessel-tracking.js';
import mountLogisticsEmissions from './api/logistics-emissions.js';
import mountSectorPeers from './api/sector-peers.js';
import { startAisTracker } from './workers/ais-tracker.js';

// Track C Imports
import mountEdgarFinancials from './api/edgar-financials.js';
import mountMacrotrends from './api/macrotrends.js';
import mountProductionIndices from './api/production-indices.js';
import mountClimateAlignment from './api/climate-alignment.js';

// Sprint 8 Imports
import carbonPriceRouter from './api/carbon-price.js';
import companyFinancialsRouter from './api/company-financials.js';
import tradeIntelligenceRouter from './api/trade-intelligence.js';
import companyProductionRouter from './api/company-production.js';
import scope3CalculatorRouter from './api/scope3-calculator.js';
import companyNewsRouter from './api/company-news.js';
import companyRegistryRouter from './api/company-registry.js';
import countryContextRouter from './api/country-context.js';
import clean200Router from './api/clean200.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

if (!process.env.DATABASE_URL) {
    console.error("❌ ERROR: DATABASE_URL is missing in Backend/.env");
    console.error("Please paste your Neon connection string into Backend/.env");
    process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

app.use(cors());
app.use(express.json());

app.get('/api/compare', compareApi);
app.post('/api/welford/check', welfordCheck(sql));
mountCityIiot(app);
app.get('/api/llm/status', llmStatus);

// ==========================================
// MOUNT SPRINT 6: SATELLITE VERIFICATION
// ==========================================
mountSatelliteVerify(app);

app.post('/api/brsr/ingest', async (req, res) => {
    try {
        const results = await runBrsrIngestion(sql);
        res.json(results);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/greendex/recompute', async (req, res) => {
    const { company } = req.query;
    if (!company) return res.status(400).json({ error: "Missing company query parameter" });
    try {
        const results = await computeGreendex(company, sql);
        res.json(results);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── DATA INITIALIZATION ─────────────────────────────────────────────────────
const WATER_STRESS_PATH = './data/water-stress.json';

async function downloadWaterStressData() {
  if (existsSync(WATER_STRESS_PATH)) return;
  console.log('[water-stress] Initializing WRI Aqueduct data...');
  if (!existsSync('./data')) mkdirSync('./data', { recursive: true });
  
  const keyBasins = [
    { basin: 'Indus', lat: 31.5, lng: 72.0, bws_raw: 4.9, bws_cat: 5, bws_label: 'Extremely High (>80%)' },
    { basin: 'Colorado', lat: 36.0, lng: -112.0, bws_raw: 4.8, bws_cat: 5, bws_label: 'Extremely High (>80%)' },
    { basin: 'Yellow River', lat: 36.0, lng: 105.0, bws_raw: 4.6, bws_cat: 5, bws_label: 'Extremely High (>80%)' },
    { basin: 'Tigris-Euphrates', lat: 33.0, lng: 44.0, bws_raw: 4.5, bws_cat: 5, bws_label: 'Extremely High (>80%)' },
    { basin: 'Amu Darya', lat: 40.0, lng: 61.0, bws_raw: 4.7, bws_cat: 5, bws_label: 'Extremely High (>80%)' },
    { basin: 'Limpopo', lat: -22.0, lng: 29.0, bws_raw: 3.8, bws_cat: 4, bws_label: 'High (40-80%)' },
    { basin: 'Orange', lat: -29.0, lng: 25.0, bws_raw: 4.1, bws_cat: 5, bws_label: 'Extremely High (>80%)' },
    { basin: 'Murray-Darling', lat: -34.0, lng: 143.0, bws_raw: 3.5, bws_cat: 4, bws_label: 'High (40-80%)' },
    { basin: 'Rio Grande', lat: 29.0, lng: -103.0, bws_raw: 4.3, bws_cat: 5, bws_label: 'Extremely High (>80%)' },
    { basin: 'Ganges', lat: 25.0, lng: 83.0, bws_raw: 3.9, bws_cat: 4, bws_label: 'High (40-80%)' },
    { basin: 'Nile', lat: 20.0, lng: 32.0, bws_raw: 4.4, bws_cat: 5, bws_label: 'Extremely High (>80%)' },
    { basin: 'Jordan', lat: 32.0, lng: 35.5, bws_raw: 4.8, bws_cat: 5, bws_label: 'Extremely High (>80%)' },
    { basin: 'Pearl River', lat: 23.0, lng: 113.0, bws_raw: 2.1, bws_cat: 3, bws_label: 'Medium-High (20-40%)' },
    { basin: 'Mekong', lat: 16.0, lng: 102.0, bws_raw: 1.8, bws_cat: 2, bws_label: 'Low-Medium (10-20%)' },
    { basin: 'Amazon', lat: -5.0, lng: -60.0, bws_raw: 0.1, bws_cat: 1, bws_label: 'Low (<10%)' },
    { basin: 'Congo', lat: -3.0, lng: 22.0, bws_raw: 0.2, bws_cat: 1, bws_label: 'Low (<10%)' },
    { basin: 'Rhine', lat: 51.0, lng: 7.0, bws_raw: 2.8, bws_cat: 3, bws_label: 'Medium-High (20-40%)' },
    { basin: 'Danube', lat: 45.0, lng: 20.0, bws_raw: 1.5, bws_cat: 2, bws_label: 'Low-Medium (10-20%)' },
    { basin: 'Yangtze', lat: 30.0, lng: 110.0, bws_raw: 1.2, bws_cat: 2, bws_label: 'Low-Medium (10-20%)' },
    { basin: 'Mississippi', lat: 38.0, lng: -91.0, bws_raw: 1.6, bws_cat: 2, bws_label: 'Low-Medium (10-20%)' },
  ];
  
  await writeFile(WATER_STRESS_PATH, JSON.stringify(keyBasins));
  console.log('[water-stress] WRI Aqueduct data saved locally');
  buildSpatialIndex(keyBasins);
}

downloadWaterStressData().then(() => {
  if (existsSync(WATER_STRESS_PATH)) {
    const data = JSON.parse(readFileSync(WATER_STRESS_PATH, 'utf8'));
    buildSpatialIndex(data);
  }
});

// ─── INITIALIZE DATABASE ─────────────────────────────────────────────────────
const initDb = async () => {
    try {
        // Enable pgvector extension
        await sql`CREATE EXTENSION IF NOT EXISTS vector`;

        await sql`
            CREATE TABLE IF NOT EXISTS companies (
                name TEXT PRIMARY KEY,
                sector TEXT,
                country TEXT,
                co2 NUMERIC,
                esg TEXT,
                url TEXT,
                products TEXT,
                methodology TEXT,
                s1 NUMERIC,
                s2 NUMERIC,
                s3 NUMERIC,
                report_year INTEGER,
                lat NUMERIC,
                lng NUMERIC,
                audit_status TEXT DEFAULT 'PENDING',
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                ts TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await sql`
            ALTER TABLE companies 
            ADD COLUMN IF NOT EXISTS audit_status TEXT DEFAULT 'PENDING'
        `;

        await sql`
            ALTER TABLE companies 
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS embeddings (
                id SERIAL PRIMARY KEY,
                company_name TEXT REFERENCES companies(name) ON DELETE CASCADE,
                content TEXT,
                embedding VECTOR(768),
                page_number INTEGER,
                report_year INTEGER,
                metadata JSONB,
                ts TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS analysis (
                company TEXT PRIMARY KEY REFERENCES companies(name) ON DELETE CASCADE,
                score INTEGER,
                e_score INTEGER,
                s_score INTEGER,
                g_score INTEGER,
                trend TEXT,
                peer TEXT,
                strengths TEXT,
                weaknesses TEXT,
                recommendation TEXT
            )
        `;
        await sql`
            CREATE TABLE IF NOT EXISTS risks (
                company TEXT PRIMARY KEY REFERENCES companies(name) ON DELETE CASCADE,
                greenwash TEXT,
                reg_risk TEXT,
                climate_exp TEXT,
                data_quality TEXT,
                red_flags TEXT,
                compliance TEXT
            )
        `;
        await sql`
            CREATE TABLE IF NOT EXISTS strategies (
                company TEXT PRIMARY KEY REFERENCES companies(name) ON DELETE CASCADE,
                action TEXT,
                confidence INTEGER,
                rationale TEXT,
                price_impact TEXT,
                catalyst TEXT,
                timeline TEXT
            )
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS facilities (
                id SERIAL PRIMARY KEY,
                company_name TEXT REFERENCES companies(name) ON DELETE CASCADE,
                facility_name TEXT NOT NULL,
                facility_type TEXT,
                lat DOUBLE PRECISION NOT NULL,
                lng DOUBLE PRECISION NOT NULL,
                status TEXT DEFAULT 'OPERATIONAL',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(company_name, facility_name)
            )
        `;
        
        await sql`
            ALTER TABLE facilities 
            ADD CONSTRAINT unique_facility_per_company 
            UNIQUE (company_name, facility_name)
        `.catch(e => console.log('[init] Facility constraint already exists or failed:', e.message));

        await sql`
            ALTER TABLE companies 
            ADD COLUMN IF NOT EXISTS city TEXT,
            ADD COLUMN IF NOT EXISTS geocoding_source TEXT
        `.catch(e => console.log('[init] Companies Alter failed:', e.message));

        console.log("✅ Neon Database Initialized");
    } catch (err) {
        console.error("❌ Database Init Error:", err);
    }
};

initDb();

// ─── ROUTES ──────────────────────────────────────────────────────────────────

// GET all companies + their associated data
app.get('/api/data', async (req, res) => {
    try {
        const data = await sql`
            SELECT 
                c.*, 
                a.score, a.e_score, a.s_score, a.g_score, a.trend, a.peer, a.strengths, a.weaknesses, a.recommendation,
                r.greenwash, r.reg_risk, r.climate_exp, r.data_quality, r.red_flags, r.compliance,
                s.action, s.confidence, s.rationale, s.price_impact, s.catalyst, s.timeline
            FROM companies c
            LEFT JOIN analysis a ON c.name = a.company
            LEFT JOIN risks r ON c.name = r.company
            LEFT JOIN strategies s ON c.name = s.company
            ORDER BY c.ts DESC
        `;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET all companies raw row data (for ESG Data Tab frontend)
app.get('/api/esg/companies', async (req, res) => {
    try {
        const data = await sql`SELECT * FROM companies ORDER BY name ASC`;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST Scout data
app.post('/api/scout', async (req, res) => {
    const { name, sector, country, co2, esg, url, products, methodology, s1, s2, s3, report_year } = req.body;
    try {
        await sql`
            INSERT INTO companies (name, sector, country, co2, esg, url, products, methodology, s1, s2, s3, report_year)
            VALUES (${name}, ${sector}, ${country}, ${co2}, ${esg}, ${url}, ${products}, ${methodology}, ${s1}, ${s2}, ${s3}, ${report_year})
            ON CONFLICT (name) DO UPDATE SET
                sector = EXCLUDED.sector,
                country = EXCLUDED.country,
                co2 = EXCLUDED.co2,
                esg = EXCLUDED.esg,
                url = EXCLUDED.url,
                products = EXCLUDED.products,
                methodology = EXCLUDED.methodology,
                s1 = EXCLUDED.s1,
                s2 = EXCLUDED.s2,
                s3 = EXCLUDED.s3,
                report_year = EXCLUDED.report_year,
                ts = CURRENT_TIMESTAMP
        `;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST Analyst data
app.post('/api/analyze', async (req, res) => {
    const { company, score, e_score, s_score, g_score, trend, peer, strengths, weaknesses, recommendation } = req.body;
    try {
        await sql`
            INSERT INTO analysis (company, score, e_score, s_score, g_score, trend, peer, strengths, weaknesses, recommendation)
            VALUES (${company}, ${score}, ${e_score}, ${s_score}, ${g_score}, ${trend}, ${peer}, ${strengths}, ${weaknesses}, ${recommendation})
            ON CONFLICT (company) DO UPDATE SET
                score = EXCLUDED.score,
                e_score = EXCLUDED.e_score,
                s_score = EXCLUDED.s_score,
                g_score = EXCLUDED.g_score,
                trend = EXCLUDED.trend,
                peer = EXCLUDED.peer,
                strengths = EXCLUDED.strengths,
                weaknesses = EXCLUDED.weaknesses,
                recommendation = EXCLUDED.recommendation
        `;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST Risk data
app.post('/api/risk', async (req, res) => {
    const { company, greenwash, reg_risk, climate_exp, data_quality, red_flags, compliance } = req.body;
    try {
        await sql`
            INSERT INTO risks (company, greenwash, reg_risk, climate_exp, data_quality, red_flags, compliance)
            VALUES (${company}, ${greenwash}, ${reg_risk}, ${climate_exp}, ${data_quality}, ${red_flags}, ${compliance})
            ON CONFLICT (company) DO UPDATE SET
                greenwash = EXCLUDED.greenwash,
                reg_risk = EXCLUDED.reg_risk,
                climate_exp = EXCLUDED.climate_exp,
                data_quality = EXCLUDED.data_quality,
                red_flags = EXCLUDED.red_flags,
                compliance = EXCLUDED.compliance
        `;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST Strategy data
app.post('/api/strategy', async (req, res) => {
    const { company, action, confidence, rationale, price_impact, catalyst, timeline } = req.body;
    try {
        await sql`
            INSERT INTO strategies (company, action, confidence, rationale, price_impact, catalyst, timeline)
            VALUES (${company}, ${action}, ${confidence}, ${rationale}, ${price_impact}, ${catalyst}, ${timeline})
            ON CONFLICT (company) DO UPDATE SET
                action = EXCLUDED.action,
                confidence = EXCLUDED.confidence,
                rationale = EXCLUDED.rationale,
                price_impact = EXCLUDED.price_impact,
                catalyst = EXCLUDED.catalyst,
                timeline = EXCLUDED.timeline
        `;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST Vector Embeddings
app.post('/api/embeddings', async (req, res) => {
    const { company_name, content, embedding, page_number, report_year, metadata, is_first_chunk } = req.body;
    try {
        // If it's the first chunk of a new report, clear old embeddings for this company
        if (is_first_chunk) {
            await sql`DELETE FROM embeddings WHERE company_name = ${company_name}`;
        }

        // Format embedding as [0.1, 0.2, ...] string for pgvector
        const vectorStr = `[${embedding.join(',')}]`;
        await sql`
            INSERT INTO embeddings (company_name, content, embedding, page_number, report_year, metadata)
            VALUES (${company_name}, ${content}, ${vectorStr}, ${page_number}, ${report_year}, ${JSON.stringify(metadata)})
        `;
        res.json({ success: true });
    } catch (err) {
        console.error("Vector save error:", err);
        res.status(500).json({ error: err.message });
    }
});

// POST Ask a question about a company (RAG)
app.post('/api/ask', async (req, res) => {
    const { company, question } = req.body;
    if (!company || !question) return res.status(400).json({ error: "Company and question are required" });

    const GEMINI_KEY = process.env.GEMINI_API_KEY || "AIzaSyD2IaDVX6JNm8QwW1fr_gXXIQ0C_-Kgt4s";

    try {
        // 1. Generate embedding for the question using Gemini
        const embedRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "models/text-embedding-004",
                content: { parts: [{ text: question }] }
            })
        });
        const embedData = await embedRes.json();
        const embedding = embedData?.embedding?.values;
        if (!embedding) {
            return res.status(500).json({ error: "Failed to generate embedding for question" });
        }
        const vectorStr = `[${embedding.join(',')}]`;

        // 2. Perform Vector Similarity Search (Semantic Search)
        const chunks = await sql`
            SELECT content, page_number, report_year
            FROM embeddings
            WHERE company_name = ${company}
            ORDER BY embedding <=> ${vectorStr}::vector
            LIMIT 5
        `;

        if (chunks.length === 0) {
            return res.json({
                answer: `I don't have enough specific data indexed for ${company} to answer that. Try running the discovery agent first.`
            });
        }

        // 3. Build context for Gemini
        const context = chunks.map(c => `[Page ${c.page_number}, ${c.report_year} Report]: ${c.content}`).join("\n\n");

        // 4. Generate answer via LLM Router (Gemini → Groq cascade)
        const systemPrompt = `You are "GreenOrb Intelligence", an ESG analyst. Use the following context from ${company}'s official reports to answer the user's question. Be extremely precise and factual. Cite the page numbers if available. If the answer is not in the context, say "Based on the official reports I have, I cannot find that specific information."

CONTEXT:
${context}`;

        const llmResult = await llmRouter.complete(systemPrompt, question, 2048);
        const answer = llmResult.text || "Unable to generate response.";

        res.json({
            answer,
            provider_used: llmResult.provider_used,
            latency_ms: llmResult.latency_ms,
            sources: chunks.map(c => ({ page: c.page_number, year: c.report_year }))
        });

    } catch (err) {
        console.error("RAG Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// POST Crawl URL using Crawl4AI Python script
app.post('/api/crawl', (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    const pythonPath = path.join(process.cwd(), 'venv', 'Scripts', 'python.exe');
    const scriptPath = path.join(process.cwd(), 'crawler.py');

    execFile(pythonPath, [scriptPath, url], { maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
        if (error) {
            console.error("Crawl error:", error);
            try {
                const parsed = JSON.parse(stdout);
                return res.status(500).json(parsed);
            } catch {
                return res.status(500).json({ error: error.message, stderr });
            }
        }

        try {
            const result = JSON.parse(stdout);
            res.json(result);
        } catch (e) {
            res.status(500).json({ error: "Failed to parse crawler output", raw: stdout });
        }
    });
});
// ─── Globe emission points (live from DB) ─────────────────
// GlobeTab can call this to render real emission dots from audited companies
app.get('/api/emissions/globe-points', async (req, res) => {
    try {
        const companies = await sql`
            SELECT name, country, co2, s1, s2, s3
            FROM companies
            WHERE co2 IS NOT NULL OR s1 IS NOT NULL
            ORDER BY co2 DESC NULLS LAST
            LIMIT 500
        `;
        // Map countries to approximate lat/lng (simplified lookup)
        const COUNTRY_COORDS = {
            'India': [20.5937, 78.9629], 'USA': [37.0902, -95.7129],
            'China': [35.8617, 104.1954], 'United Arab Emirates': [23.4241, 53.8478],
            'South Africa': [-30.5595, 22.9375], 'Brazil': [-14.2350, -51.9253],
            'United Kingdom': [55.3781, -3.4360], 'Germany': [51.1657, 10.4515],
            'Japan': [36.2048, 139.6917], 'Australia': [-25.2744, 133.7751],
            'Switzerland': [46.8182, 8.2275], 'Netherlands': [52.1326, 5.2913],
        };
        const points = companies.map(c => {
            const coords = COUNTRY_COORDS[c.country] || [0, 0];
            const total = parseFloat(c.co2) || ((parseFloat(c.s1) || 0) + (parseFloat(c.s2) || 0));
            return {
                lat: coords[0] + (Math.random() - 0.5) * 2,
                lng: coords[1] + (Math.random() - 0.5) * 2,
                size: Math.min(1, Math.max(0.1, total / 5000)),
                color: total > 2000 ? '#ef4444' : total > 500 ? '#f97316' : total > 200 ? '#f59e0b' : total > 50 ? '#22c55e' : '#10b981',
                company: c.name,
                scopeTotal: total
            };
        }).filter(p => p.scopeTotal > 0);
        res.json(points);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Verdict submission (human-in-the-loop) ───────────────
app.post('/api/verdicts', async (req, res) => {
    const { auditId, verdict, company } = req.body;
    console.log(`[Verdicts] ${company || auditId}: ${verdict}`);
    // In production: write to audit_results table
    res.json({ success: true, auditId, verdict });
});

// ─── GLOBE API ROUTES ─────────────────────────────────────────────────────────

mountGlobePoints(app, sql);
mountCountryChoropleth(app, sql);
mountEsgNews(app, sql);
mountOsiIngest(app, sql);
mountEsgCompare(app, sql);
mountClimateTrace(app, sql);
mountDisastersProximity(app, sql);
app.use('/api/globe/fires', mountNasaFirms);
app.use('/api/globe/grid', mountGridCarbon);
app.use('/api/globe/air-quality', mountAirQuality);
app.use('/api/disasters/earthquakes', mountEarthquakes);
app.use('/api/disasters/floods', mountFloods);
app.use('/api/disasters/cyclones', mountCyclones);
app.use('/api/disasters/volcanoes', mountVolcanoes);
app.use('/api/disasters/eonet', mountNasaEonet);

// ==========================================
// MOUNT NEW SPRINT 2 APIS
// ==========================================
app.use('/api/gdelt', mountGdelt(sql));
app.use('/api/greenwash-velocity', mountGreenwashVelocity(sql));

// ==========================================
// MOUNT NEW SPRINT 3 APIS
// ==========================================
app.get('/api/gpm-imerg', mountGpmImerg);
app.use('/api/sentinel-5p', mountSentinel5p(sql));
app.use('/api/biodiversity', mountBiodiversity(sql));

// ==========================================
// MOUNT NEW SPRINT 4 APIS
// ==========================================
app.get('/api/ocean-currents', mountOceanCurrents);
app.get('/api/ocean-health', mountOceanHealthPace(sql));
app.post('/api/audit/brsr-pdf', mountBrsrPdf(sql));
app.use('/api/water-stress', mountWaterStress(app));
app.get('/api/forest-loss', mountForestLoss);
app.use('/api/coral-bleaching', mountCoralBleaching(sql));
app.use('/api/fishing-watch', mountFishingWatch(sql));
app.get('/api/verify/scope2', mountScope2Verifier);
mountFacilities(app, sql);
mountSpatialFacilities(app, sql);
mountOsmFacilities(app);
mountWikidataFacilities(app, sql);
mountProductLca(app);

// ==========================================
// MOUNT NEW SPRINT 8 APIS
// ==========================================
app.use('/api/carbon', carbonPriceRouter);
app.use('/api/company', companyFinancialsRouter);
app.use('/api/company', tradeIntelligenceRouter);
app.use('/api/company', companyProductionRouter);
app.use('/api/company', scope3CalculatorRouter);
app.use('/api/company', companyNewsRouter);
app.use('/api/company', companyRegistryRouter);
app.use('/api/country', countryContextRouter);
app.use('/api/clean200', clean200Router);

// Track B Mounting
mountImportYeti(app, sql);
mountOshFacilities(app, sql);
mountVesselTracking(app, sql);
mountLogisticsEmissions(app);
mountSectorPeers(app, sql);

// Start Background AIS Tracker (WebSocket)
startAisTracker(sql);

// Track C Mounting
mountEdgarFinancials(app, sql);
mountMacrotrends(app, sql);
mountProductionIndices(app);
mountClimateAlignment(app);

// ─── AGENT STATUS (30s cache) ─────────────────────────────────────────────────
const agentCache = new NodeCache({ stdTTL: 30, checkperiod: 10 });
app.get('/api/agent/status', async (req, res) => {
    const cached = agentCache.get('agent_status');
    if (cached) return res.json(cached);

    try {
        const [countResult] = await sql`
            SELECT 
                COUNT(*) FILTER (WHERE audit_status = 'EXTRACTING') AS in_progress,
                COUNT(*) FILTER (WHERE audit_status = 'FAILED') AS failed,
                COUNT(*) FILTER (WHERE audit_status = 'COMPLETED' AND created_at >= NOW() - INTERVAL '24 hours') AS completed_today,
                COUNT(*) AS total
            FROM companies
        `;
        
        const result = {
            active_agents: 4,
            audits_in_progress: parseInt(countResult?.in_progress || '0'),
            audits_failed: parseInt(countResult?.failed || '0'),
            audits_completed_today: parseInt(countResult?.completed_today || '0'),
            total_companies: parseInt(countResult?.total || '0'),
            last_audit_completed_at: new Date().toISOString(),
        };

        agentCache.set('agent_status', result);
        res.json(result);
    } catch (err) {
        console.error('[agent_status] Error querying DB:', err.message);
        res.json({
            active_agents: 4,
            audits_in_progress: 0,
            audits_failed: 0,
            audits_completed_today: 0,
            total_companies: 0,
            last_audit_completed_at: null,
        });
    }
});

app.listen(port, () => {
    console.log(`🚀 GreenOrb Backend running on port ${port}`);
});
