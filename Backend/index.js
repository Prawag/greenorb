import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { execFile } from 'child_process';
import path from 'path';

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

// ─── INITIALIZE DATABASE ─────────────────────────────────────────────────────
const initDb = async () => {
    try {
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

app.listen(port, () => {
    console.log(`🚀 GreenOrb Backend running on port ${port}`);
});
