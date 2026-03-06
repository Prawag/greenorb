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
                ts TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
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

// POST Vector Embeddings
app.post('/api/embeddings', async (req, res) => {
    const { company_name, content, embedding, page_number, report_year, metadata } = req.body;
    try {
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

    try {
        // 1. Generate embedding for the question
        const embedRes = await fetch("http://localhost:11434/api/embeddings", {
            method: 'POST',
            body: JSON.stringify({ model: "nomic-embed-text", prompt: question })
        });
        const { embedding } = await embedRes.json();
        const vectorStr = `[${embedding.join(',')}]`;

        // 2. Perform Vector Similarity Search (Semantic Search)
        // We find the top 5 chunks closest to the question
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

        // 3. Build context for Gemini/Llama
        const context = chunks.map(c => `[Page ${c.page_number}, ${c.report_year} Report]: ${c.content}`).join("\n\n");

        // 4. Generate answer with Gemini (or local LLM)
        const prompt = `
            You are "GreenOrb Intelligence", an ESG analyst. Use the following context from ${company}'s official reports to answer the user's question.
            Be extremely precise and factual. Cite the page numbers if available.
            If the answer is not in the context, say "Based on the official reports I have, I cannot find that specific information."

            CONTEXT:
            ${context}

            USER QUESTION:
            ${question}
        `;

        // Using Gemini for higher quality RAG answers (or fallback to local Llama)
        const geminiRes = await fetch("http://localhost:5000/api/analyze", { // Shortcut to existing logic
            method: 'POST',
            body: JSON.stringify({ company, prompt })
        });
        // Note: For simplicity, we'll implement a clean fetch here or reuse existing LLM logic
        // For this implementation, let's assume a clean call to Ollama or Gemini

        const ollamaRes = await fetch("http://localhost:11434/api/generate", {
            method: 'POST',
            body: JSON.stringify({
                model: "llama3.2",
                prompt: prompt,
                stream: false
            })
        });
        const { response } = await ollamaRes.json();

        res.json({
            answer: response,
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

app.listen(port, () => {
    console.log(`🚀 GreenOrb Backend running on port ${port}`);
});
