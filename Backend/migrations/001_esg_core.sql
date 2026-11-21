-- GreenOrb v4 core schema.
-- Everything lives in the `esg` schema so the legacy `public.*` tables are never touched.
-- This migration is idempotent; the runner records it in esg.schema_migrations.

CREATE SCHEMA IF NOT EXISTS esg;

CREATE OR REPLACE FUNCTION esg.touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Companies ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS esg.companies (
  id                 BIGSERIAL PRIMARY KEY,
  slug               TEXT NOT NULL UNIQUE,
  name               TEXT NOT NULL,
  aliases            TEXT[] NOT NULL DEFAULT '{}',
  ticker             TEXT,
  isin               TEXT,
  sector             TEXT,
  industry           TEXT,
  country            TEXT,
  hq_city            TEXT,
  lat                DOUBLE PRECISION CHECK (lat BETWEEN -90 AND 90),
  lng                DOUBLE PRECISION CHECK (lng BETWEEN -180 AND 180),
  location_precision TEXT CHECK (location_precision IN ('exact', 'city', 'country')),
  website            TEXT,
  description        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS companies_name_lower_idx ON esg.companies (lower(name));
CREATE INDEX IF NOT EXISTS companies_sector_idx ON esg.companies (sector);
CREATE INDEX IF NOT EXISTS companies_country_idx ON esg.companies (country);
DROP TRIGGER IF EXISTS companies_touch ON esg.companies;
CREATE TRIGGER companies_touch BEFORE UPDATE ON esg.companies
  FOR EACH ROW EXECUTE FUNCTION esg.touch_updated_at();

-- ── Reports (one row per source document) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS esg.reports (
  id                 BIGSERIAL PRIMARY KEY,
  company_id         BIGINT NOT NULL REFERENCES esg.companies(id) ON DELETE CASCADE,
  title              TEXT,
  source_url         TEXT,
  source_type        TEXT NOT NULL DEFAULT 'url' CHECK (source_type IN ('url', 'upload', 'local', 'legacy')),
  file_name          TEXT,
  file_sha256        TEXT,
  file_size          BIGINT,
  page_count         INT,
  fiscal_year        INT CHECK (fiscal_year BETWEEN 1990 AND 2100),
  period_label       TEXT,
  frameworks         TEXT[] NOT NULL DEFAULT '{}',
  assurance_level    TEXT NOT NULL DEFAULT 'unknown' CHECK (assurance_level IN ('none', 'limited', 'reasonable', 'unknown')),
  assurance_provider TEXT,
  assurance_page     INT,
  status             TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'processed', 'failed', 'legacy')),
  error              TEXT,
  stats              JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS reports_company_sha_uq ON esg.reports (company_id, file_sha256) WHERE file_sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS reports_company_idx ON esg.reports (company_id, fiscal_year DESC);
CREATE INDEX IF NOT EXISTS reports_status_idx ON esg.reports (status);
DROP TRIGGER IF EXISTS reports_touch ON esg.reports;
CREATE TRIGGER reports_touch BEFORE UPDATE ON esg.reports
  FOR EACH ROW EXECUTE FUNCTION esg.touch_updated_at();

-- Uploaded PDFs (and optionally fetched ones) so the API and worker can run on
-- different hosts without a shared disk. Also used to serve citations (#page=N).
CREATE TABLE IF NOT EXISTS esg.report_files (
  report_id    BIGINT PRIMARY KEY REFERENCES esg.reports(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL DEFAULT 'application/pdf',
  content      BYTEA NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Metrics (every number carries its evidence) ──────────────────────────────
CREATE TABLE IF NOT EXISTS esg.metrics (
  id            BIGSERIAL PRIMARY KEY,
  company_id    BIGINT NOT NULL REFERENCES esg.companies(id) ON DELETE CASCADE,
  report_id     BIGINT NOT NULL REFERENCES esg.reports(id) ON DELETE CASCADE,
  metric        TEXT NOT NULL CHECK (metric IN (
                  'ghg_scope1', 'ghg_scope2_location', 'ghg_scope2_market', 'ghg_scope2',
                  'ghg_scope3', 'ghg_scope12_total', 'energy_total', 'energy_renewable_pct',
                  'water_withdrawal', 'water_consumption', 'waste_generated')),
  fiscal_year   INT NOT NULL CHECK (fiscal_year BETWEEN 1990 AND 2100),
  period_label  TEXT,
  value         DOUBLE PRECISION,
  unit          TEXT NOT NULL,
  raw_value     TEXT,
  raw_unit      TEXT,
  boundary      TEXT,
  page          INT,
  quote         TEXT,
  method        TEXT NOT NULL CHECK (method IN ('table', 'llm', 'table+llm', 'manual', 'legacy')),
  confidence    REAL NOT NULL DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1),
  grounded      BOOLEAN NOT NULL DEFAULT false,
  is_primary    BOOLEAN NOT NULL DEFAULT false,
  status        TEXT NOT NULL DEFAULT 'extracted' CHECK (status IN ('extracted', 'verified', 'rejected')),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS metrics_company_idx ON esg.metrics (company_id, metric, fiscal_year DESC);
CREATE INDEX IF NOT EXISTS metrics_report_idx ON esg.metrics (report_id);
-- At most one primary (chosen) value per company / metric / year.
CREATE UNIQUE INDEX IF NOT EXISTS metrics_primary_uq ON esg.metrics (company_id, metric, fiscal_year) WHERE is_primary;

-- ── Flags (integrity / greenwashing signals + human review) ──────────────────
CREATE TABLE IF NOT EXISTS esg.flags (
  id           BIGSERIAL PRIMARY KEY,
  company_id   BIGINT NOT NULL REFERENCES esg.companies(id) ON DELETE CASCADE,
  report_id    BIGINT REFERENCES esg.reports(id) ON DELETE CASCADE,
  metric_id    BIGINT REFERENCES esg.metrics(id) ON DELETE SET NULL,
  code         TEXT NOT NULL,
  severity     TEXT NOT NULL CHECK (severity IN ('info', 'low', 'medium', 'high')),
  title        TEXT NOT NULL,
  detail       TEXT,
  evidence     JSONB NOT NULL DEFAULT '{}'::jsonb,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'confirmed', 'dismissed')),
  review_note  TEXT,
  reviewed_by  TEXT,
  reviewed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS flags_company_idx ON esg.flags (company_id);
CREATE INDEX IF NOT EXISTS flags_status_idx ON esg.flags (status, severity);
CREATE INDEX IF NOT EXISTS flags_report_idx ON esg.flags (report_id);

-- ── Text chunks for Ask-the-report (full-text always; vectors in 002) ───────
CREATE TABLE IF NOT EXISTS esg.chunks (
  id          BIGSERIAL PRIMARY KEY,
  report_id   BIGINT NOT NULL REFERENCES esg.reports(id) ON DELETE CASCADE,
  company_id  BIGINT NOT NULL REFERENCES esg.companies(id) ON DELETE CASCADE,
  page        INT NOT NULL,
  ord         INT NOT NULL DEFAULT 0,
  content     TEXT NOT NULL,
  tsv         TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
);
CREATE INDEX IF NOT EXISTS chunks_tsv_idx ON esg.chunks USING GIN (tsv);
CREATE INDEX IF NOT EXISTS chunks_company_idx ON esg.chunks (company_id);
CREATE INDEX IF NOT EXISTS chunks_report_idx ON esg.chunks (report_id, page);

-- ── Job queue (API enqueues, worker claims with FOR UPDATE SKIP LOCKED) ─────
CREATE TABLE IF NOT EXISTS esg.jobs (
  id           BIGSERIAL PRIMARY KEY,
  kind         TEXT NOT NULL CHECK (kind IN ('ingest_report')),
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  status       TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  stage        TEXT,
  progress     INT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  logs         JSONB NOT NULL DEFAULT '[]'::jsonb,
  attempts     INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  error        TEXT,
  company_id   BIGINT REFERENCES esg.companies(id) ON DELETE SET NULL,
  report_id    BIGINT REFERENCES esg.reports(id) ON DELETE SET NULL,
  run_after    TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at    TIMESTAMPTZ,
  locked_by    TEXT,
  finished_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobs_claim_idx ON esg.jobs (status, run_after, id);
DROP TRIGGER IF EXISTS jobs_touch ON esg.jobs;
CREATE TRIGGER jobs_touch BEFORE UPDATE ON esg.jobs
  FOR EACH ROW EXECUTE FUNCTION esg.touch_updated_at();

-- ── Audit log (who reviewed / ingested what) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS esg.audit_log (
  id         BIGSERIAL PRIMARY KEY,
  actor      TEXT NOT NULL,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  BIGINT,
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Company summary (latest primary value per metric + disclosure score) ────
-- Disclosure score (0-100), fully transparent:
--   Scope 1: 20 · Scope 2 (any method): 20 (only a combined Scope 1+2 total: 20 for both) · Scope 3: 15 · Energy: 10
--   Water withdrawal or consumption: 10 · Waste: 10
--   External assurance on the latest report: limited 10 / reasonable 15
DROP VIEW IF EXISTS esg.company_summary;
CREATE VIEW esg.company_summary AS
WITH latest_year AS (
  -- Prefer the latest year with cited (non-legacy) data; fall back to legacy imports.
  SELECT company_id, coalesce(max(fiscal_year) FILTER (WHERE method <> 'legacy'), max(fiscal_year)) AS fiscal_year
  FROM esg.metrics
  WHERE is_primary AND status <> 'rejected' AND metric LIKE 'ghg_%'
  GROUP BY company_id
),
latest AS (
  SELECT m.company_id, m.metric, m.value, m.confidence, m.method
  FROM esg.metrics m
  JOIN latest_year ly ON ly.company_id = m.company_id AND ly.fiscal_year = m.fiscal_year
  WHERE m.is_primary AND m.status <> 'rejected'
),
pivot AS (
  SELECT company_id,
    max(value) FILTER (WHERE metric = 'ghg_scope1')          AS scope1,
    max(value) FILTER (WHERE metric = 'ghg_scope2_location') AS scope2_location,
    max(value) FILTER (WHERE metric = 'ghg_scope2_market')   AS scope2_market,
    max(value) FILTER (WHERE metric = 'ghg_scope2')          AS scope2_unspecified,
    max(value) FILTER (WHERE metric = 'ghg_scope3')          AS scope3,
    max(value) FILTER (WHERE metric = 'ghg_scope12_total')   AS scope12_total,
    max(value) FILTER (WHERE metric = 'energy_total')        AS energy_mwh,
    max(value) FILTER (WHERE metric IN ('water_withdrawal', 'water_consumption')) AS water_m3,
    max(value) FILTER (WHERE metric = 'waste_generated')     AS waste_t,
    avg(confidence)                                          AS avg_confidence,
    bool_or(method = 'legacy')                               AS has_legacy
  FROM latest
  GROUP BY company_id
),
latest_report AS (
  SELECT DISTINCT ON (company_id) company_id, id AS report_id, assurance_level, fiscal_year, status
  FROM esg.reports
  WHERE status IN ('processed', 'legacy')
  ORDER BY company_id, fiscal_year DESC NULLS LAST, processed_at DESC NULLS LAST, id DESC
),
open_flags AS (
  SELECT company_id,
    count(*) FILTER (WHERE status = 'open')                                AS open_flags,
    count(*) FILTER (WHERE status = 'open' AND severity IN ('high','medium')) AS open_material_flags,
    count(*) FILTER (WHERE status = 'confirmed')                           AS confirmed_flags
  FROM esg.flags GROUP BY company_id
),
report_counts AS (
  SELECT company_id, count(*) AS report_count FROM esg.reports GROUP BY company_id
)
SELECT
  c.id AS company_id,
  ly.fiscal_year AS latest_year,
  p.scope1,
  coalesce(p.scope2_market, p.scope2_location, p.scope2_unspecified) AS scope2,
  p.scope2_location,
  p.scope2_market,
  p.scope3,
  coalesce(p.scope12_total, CASE WHEN p.scope1 IS NOT NULL AND coalesce(p.scope2_market, p.scope2_location, p.scope2_unspecified) IS NOT NULL
    THEN p.scope1 + coalesce(p.scope2_market, p.scope2_location, p.scope2_unspecified) END) AS scope12,
  p.energy_mwh,
  p.water_m3,
  p.waste_t,
  round(p.avg_confidence::numeric, 2)::double precision AS data_confidence,
  coalesce(p.has_legacy, false) AS has_legacy_data,
  lr.report_id AS latest_report_id,
  coalesce(lr.assurance_level, 'unknown') AS assurance_level,
  coalesce(rc.report_count, 0) AS report_count,
  coalesce(f.open_flags, 0) AS open_flags,
  coalesce(f.open_material_flags, 0) AS open_material_flags,
  coalesce(f.confirmed_flags, 0) AS confirmed_flags,
  CASE WHEN ly.fiscal_year IS NULL THEN NULL ELSE (
      (CASE WHEN p.scope1 IS NOT NULL THEN 20 ELSE 0 END)
    + (CASE WHEN coalesce(p.scope2_market, p.scope2_location, p.scope2_unspecified) IS NOT NULL THEN 20 ELSE 0 END)
    + (CASE WHEN p.scope1 IS NULL AND coalesce(p.scope2_market, p.scope2_location, p.scope2_unspecified) IS NULL
             AND p.scope12_total IS NOT NULL THEN 20 ELSE 0 END)
    + (CASE WHEN p.scope3 IS NOT NULL THEN 15 ELSE 0 END)
    + (CASE WHEN p.energy_mwh IS NOT NULL THEN 10 ELSE 0 END)
    + (CASE WHEN p.water_m3 IS NOT NULL THEN 10 ELSE 0 END)
    + (CASE WHEN p.waste_t IS NOT NULL THEN 10 ELSE 0 END)
    + (CASE lr.assurance_level WHEN 'reasonable' THEN 15 WHEN 'limited' THEN 10 ELSE 0 END)
  ) END AS disclosure_score
FROM esg.companies c
LEFT JOIN latest_year ly ON ly.company_id = c.id
LEFT JOIN pivot p ON p.company_id = c.id
LEFT JOIN latest_report lr ON lr.company_id = c.id
LEFT JOIN open_flags f ON f.company_id = c.id
LEFT JOIN report_counts rc ON rc.company_id = c.id;

-- ── Primary value selection (shared by the API and the worker) ───────────────
-- For each company / metric / fiscal year exactly one non-rejected value is marked primary:
--   human-verified > manual entry > extracted > legacy import,
--   then consolidated > unspecified > standalone boundary,
--   then the most recent report (later reports carry restatements),
--   then grounded (number found verbatim on the cited page), confidence, newest.
CREATE OR REPLACE FUNCTION esg.recompute_primary(p_company_id BIGINT) RETURNS void AS $$
BEGIN
  UPDATE esg.metrics SET is_primary = false WHERE company_id = p_company_id AND is_primary;
  UPDATE esg.metrics m SET is_primary = true
  WHERE m.id IN (
    SELECT DISTINCT ON (x.metric, x.fiscal_year) x.id
    FROM esg.metrics x
    JOIN esg.reports r ON r.id = x.report_id
    WHERE x.company_id = p_company_id AND x.status <> 'rejected' AND x.value IS NOT NULL
    ORDER BY x.metric, x.fiscal_year,
      (x.status = 'verified') DESC,
      (x.method = 'manual') DESC,
      (x.method = 'legacy') ASC,
      CASE lower(coalesce(x.boundary, '')) WHEN 'consolidated' THEN 0 WHEN '' THEN 1 ELSE 2 END,
      r.fiscal_year DESC NULLS LAST,
      x.grounded DESC,
      x.confidence DESC,
      x.id DESC
  );
END;
$$ LANGUAGE plpgsql;
