-- Build 16: Final schema hardening for Track C
ALTER TABLE facilities
  ADD COLUMN IF NOT EXISTS merged_from INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS osm_bbox_hash TEXT,
  ADD COLUMN IF NOT EXISTS osm_cached_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data_tier TEXT DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS data_tier_locked BOOLEAN DEFAULT false;

-- Ensure companies table has tiering columns if missing
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS data_tier TEXT DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS data_tier_locked BOOLEAN DEFAULT false;

-- Financial history table (centralized cache)
CREATE TABLE IF NOT EXISTS company_financials (
  id SERIAL PRIMARY KEY,
  company_name TEXT REFERENCES companies(name) ON DELETE CASCADE,
  fiscal_year INTEGER,
  fiscal_period TEXT, -- 'FY', 'Q1', etc.
  revenue_usd NUMERIC,
  gross_profit_usd NUMERIC,
  ebit_usd NUMERIC,
  net_income_usd NUMERIC,
  capex_usd NUMERIC,
  rd_expense_usd NUMERIC,
  source TEXT, -- 'edgar', 'macrotrends'
  fetched_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_name, fiscal_year, fiscal_period)
);
