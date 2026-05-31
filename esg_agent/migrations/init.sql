-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Companies
CREATE TABLE IF NOT EXISTS esg_companies (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    domain      TEXT UNIQUE NOT NULL,
    industry    TEXT,
    country     TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ESG Source documents
CREATE TABLE IF NOT EXISTS esg_documents (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES esg_companies(id) ON DELETE CASCADE,
    url             TEXT NOT NULL,
    title           TEXT,
    report_type     TEXT CHECK (report_type IN ('sustainability_report','annual_report','csr_report','tcfd_report','press_release','other')),
    date_published  DATE,
    local_path      TEXT,
    content_hash    TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, content_hash)
);

-- Master ESG metric definitions
CREATE TABLE IF NOT EXISTS esg_metrics_def (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category    TEXT NOT NULL CHECK (category IN ('Environmental','Social','Governance')),
    framework   TEXT CHECK (framework IN ('GRI','SASB','TCFD','CDP','CSRD','custom')),
    metric_name TEXT NOT NULL UNIQUE,
    unit        TEXT,
    description TEXT
);

-- Extracted ESG values (structured)
CREATE TABLE IF NOT EXISTS esg_extracted_values (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id     UUID NOT NULL REFERENCES esg_documents(id) ON DELETE CASCADE,
    metric_id       UUID NOT NULL REFERENCES esg_metrics_def(id),
    company_id      UUID NOT NULL REFERENCES esg_companies(id),
    value           NUMERIC,
    value_text      TEXT,
    unit            TEXT,
    year_reported   INTEGER,
    confidence      NUMERIC CHECK (confidence BETWEEN 0 AND 1),
    source_text     TEXT,
    page_number     INTEGER,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Text chunks for semantic search (RAG)
CREATE TABLE IF NOT EXISTS esg_document_chunks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id     UUID NOT NULL REFERENCES esg_documents(id) ON DELETE CASCADE,
    chunk_index     INTEGER NOT NULL,
    chunk_text      TEXT NOT NULL,
    page_number     INTEGER,
    embedding       VECTOR(384),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Vector similarity index (created without IVFFlat initially to avoid needing data)
CREATE INDEX IF NOT EXISTS idx_chunks_embedding
    ON esg_document_chunks USING hnsw (embedding vector_cosine_ops);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_esg_values_company ON esg_extracted_values(company_id);
CREATE INDEX IF NOT EXISTS idx_esg_values_year ON esg_extracted_values(year_reported);
CREATE INDEX IF NOT EXISTS idx_documents_company ON esg_documents(company_id);

-- Seed master metric list (GRI + SASB aligned)
INSERT INTO esg_metrics_def (category, framework, metric_name, unit, description) VALUES
-- Environmental
('Environmental','GRI','Scope 1 GHG Emissions','tCO2e','Direct greenhouse gas emissions'),
('Environmental','GRI','Scope 2 GHG Emissions','tCO2e','Indirect energy GHG emissions'),
('Environmental','GRI','Scope 3 GHG Emissions','tCO2e','Value chain GHG emissions'),
('Environmental','GRI','Total Energy Consumption','MWh','Total energy consumed'),
('Environmental','GRI','Renewable Energy Percentage','%','% energy from renewable sources'),
('Environmental','GRI','Total Water Withdrawal','m3','Total water withdrawn'),
('Environmental','GRI','Total Waste Generated','tonnes','Total waste generated'),
('Environmental','GRI','Waste Recycling Rate','%','% waste recycled or recovered'),
('Environmental','GRI','Total Water Discharged','m3','Water returned to environment'),
-- Social
('Social','GRI','Total Employees','count','Total headcount'),
('Social','GRI','Female Employee Percentage','%','% of employees identifying as female'),
('Social','GRI','Employee Turnover Rate','%','Annual voluntary turnover rate'),
('Social','GRI','Total Recordable Injury Rate','per 200k hours','TRIR safety metric'),
('Social','GRI','Training Hours Per Employee','hours','Avg training hrs per employee/year'),
('Social','GRI','CEO Pay Ratio','ratio','CEO pay vs median employee pay'),
('Social','SASB','Minority Employee Percentage','%','% employees from minority groups'),
-- Governance
('Governance','GRI','Board Size','count','Total number of board members'),
('Governance','GRI','Female Board Percentage','%','% of board members identifying as female'),
('Governance','GRI','Independent Director Percentage','%','% independent board members'),
('Governance','GRI','Executive Compensation Total','USD millions','Total exec compensation'),
('Governance','GRI','Ethics Policy Present','boolean','Whether formal ethics policy exists'),
('Governance','GRI','Anti-Corruption Training Coverage','%','% employees trained on anti-corruption')
ON CONFLICT (metric_name) DO NOTHING;
