-- GreenOrb Neon PostgreSQL Migration
-- Version: 001_initial
-- Date: 2026-03-21
-- Run against Neon database with: psql $DATABASE_URL -f 001_neon_initial.sql

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ═══════════════════════════════════════════════════
-- Core Tables
-- ═══════════════════════════════════════════════════

-- Companies: core entity table with ESG metrics
CREATE TABLE IF NOT EXISTS companies (
    name            TEXT PRIMARY KEY,
    sector          TEXT,
    country         TEXT,
    co2             NUMERIC,
    esg             TEXT,
    url             TEXT,
    products        TEXT,
    methodology     TEXT,
    s1              NUMERIC,          -- Scope 1 emissions (tCO2e)
    s2              NUMERIC,          -- Scope 2 emissions (tCO2e)
    s3              NUMERIC,          -- Scope 3 emissions (tCO2e)
    report_year     INTEGER,
    -- New columns for enhanced pipeline
    energy_consumption  NUMERIC,      -- Total energy (GJ)
    water_withdrawal    NUMERIC,      -- Total water (KL)
    waste_generated     NUMERIC,      -- Total waste (MT)
    renewable_energy_pct NUMERIC,     -- Renewable energy (%)
    llm_provider    TEXT,             -- gemini | groq | ollama | schema
    cache_hit       BOOLEAN DEFAULT FALSE,
    linguistic_flags JSONB DEFAULT '[]',
    framework_tags  JSONB DEFAULT '{}',
    schema_template_id TEXT,
    ts              TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Analysis: ESG scoring output from Strategy Agent
CREATE TABLE IF NOT EXISTS analysis (
    company         TEXT PRIMARY KEY REFERENCES companies(name) ON DELETE CASCADE,
    score           INTEGER,
    e_score         INTEGER,
    s_score         INTEGER,
    g_score         INTEGER,
    trend           TEXT,
    peer            TEXT,
    strengths       TEXT,
    weaknesses      TEXT,
    recommendation  TEXT
);

-- Risks: greenwashing risk assessment from Risk Agent
CREATE TABLE IF NOT EXISTS risks (
    company         TEXT PRIMARY KEY REFERENCES companies(name) ON DELETE CASCADE,
    greenwash       TEXT,
    reg_risk        TEXT,
    climate_exp     TEXT,
    data_quality    TEXT,
    red_flags       TEXT,
    compliance      TEXT,
    linguistic_risk_score NUMERIC,
    absence_signal_count INTEGER DEFAULT 0
);

-- Strategies: investment recommendations from Strategy Agent
CREATE TABLE IF NOT EXISTS strategies (
    company         TEXT PRIMARY KEY REFERENCES companies(name) ON DELETE CASCADE,
    action          TEXT,             -- BUY | HOLD | AVOID
    confidence      INTEGER,
    rationale       TEXT,
    price_impact    TEXT,
    catalyst        TEXT,
    timeline        TEXT
);

-- ═══════════════════════════════════════════════════
-- RAG / Embeddings
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS embeddings (
    id              SERIAL PRIMARY KEY,
    company_name    TEXT REFERENCES companies(name) ON DELETE CASCADE,
    content         TEXT,
    embedding       VECTOR(768),      -- text-embedding-004 outputs 768 dims
    page_number     INTEGER,
    report_year     INTEGER,
    metadata        JSONB,
    ts              TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Index for nearest-neighbor search
CREATE INDEX IF NOT EXISTS idx_embeddings_vector
    ON embeddings USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 50);

-- ═══════════════════════════════════════════════════
-- PDF Cache (mirrors SQLite cache for production)
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pdf_cache (
    pdf_hash        TEXT PRIMARY KEY,
    company_name    TEXT,
    result_json     TEXT NOT NULL,
    provider        TEXT,             -- gemini | groq | ollama | schema
    cached_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    hit_count       INTEGER DEFAULT 0
);

-- ═══════════════════════════════════════════════════
-- ESG Schema Learning
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS esg_schemas (
    id              SERIAL PRIMARY KEY,
    template_id     TEXT UNIQUE NOT NULL,
    schema_json     JSONB NOT NULL,
    company_example TEXT,
    framework       TEXT,             -- GRI | BRSR | TCFD | SASB | CUSTOM
    created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    hit_count       INTEGER DEFAULT 0
);

-- Index for fast template lookup
CREATE INDEX IF NOT EXISTS idx_esg_schemas_template
    ON esg_schemas(template_id);

-- ═══════════════════════════════════════════════════
-- Human-in-the-Loop Verdicts
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS audit_verdicts (
    id              SERIAL PRIMARY KEY,
    company_name    TEXT,
    audit_id        TEXT,
    verdict         TEXT NOT NULL,     -- accepted | rejected
    analyst_accepted BOOLEAN,
    analyst_notes   TEXT,
    provider_used   TEXT,
    created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Index for company lookup
CREATE INDEX IF NOT EXISTS idx_verdicts_company
    ON audit_verdicts(company_name);

-- ═══════════════════════════════════════════════════
-- Absence Detection Baselines
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sector_baselines (
    sector          TEXT PRIMARY KEY,
    total_companies INTEGER DEFAULT 0,
    scope_1_rate    NUMERIC DEFAULT 0,
    scope_2_rate    NUMERIC DEFAULT 0,
    scope_3_rate    NUMERIC DEFAULT 0,
    energy_rate     NUMERIC DEFAULT 0,
    water_rate      NUMERIC DEFAULT 0,
    waste_rate      NUMERIC DEFAULT 0,
    renewable_rate  NUMERIC DEFAULT 0,
    updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════
-- Materialized View: Globe Points
-- ═══════════════════════════════════════════════════

CREATE MATERIALIZED VIEW IF NOT EXISTS globe_points AS
    SELECT
        c.name AS company,
        c.country,
        COALESCE(c.co2, c.s1 + COALESCE(c.s2, 0)) AS emissions_mt,
        c.sector,
        c.esg
    FROM companies c
    WHERE c.co2 IS NOT NULL OR c.s1 IS NOT NULL
    ORDER BY emissions_mt DESC NULLS LAST;

-- Refresh command (run periodically):
-- REFRESH MATERIALIZED VIEW globe_points;

-- ═══════════════════════════════════════════════════
-- Grants (adjust role name as needed)
-- ═══════════════════════════════════════════════════

-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO neondb_owner;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO neondb_owner;
