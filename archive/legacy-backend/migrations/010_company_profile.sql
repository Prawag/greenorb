-- Add financial + trade fields to companies table
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS ticker TEXT,
  ADD COLUMN IF NOT EXISTS exchange TEXT,
  ADD COLUMN IF NOT EXISTS market_cap_usd NUMERIC,
  ADD COLUMN IF NOT EXISTS revenue_usd NUMERIC,
  ADD COLUMN IF NOT EXISTS revenue_growth_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS ebitda_usd NUMERIC,
  ADD COLUMN IF NOT EXISTS annual_production_mt NUMERIC,
  ADD COLUMN IF NOT EXISTS production_unit TEXT,
  ADD COLUMN IF NOT EXISTS capacity_utilization_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS emission_intensity NUMERIC,
  ADD COLUMN IF NOT EXISTS eu_export_volume_mt NUMERIC,
  ADD COLUMN IF NOT EXISTS cbam_liability_eur NUMERIC,
  ADD COLUMN IF NOT EXISTS shipping_emissions_mt NUMERIC,
  ADD COLUMN IF NOT EXISTS greenwash_risk TEXT DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS clean200 BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS brsr_top1000 BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS incorporation_year INTEGER,
  ADD COLUMN IF NOT EXISTS incorporation_country TEXT,
  ADD COLUMN IF NOT EXISTS financial_updated_at TIMESTAMPTZ;

-- New table: company_financials (5-year history)
CREATE TABLE IF NOT EXISTS company_financials (
  id SERIAL PRIMARY KEY,
  company_name TEXT REFERENCES companies(name) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  revenue_usd NUMERIC,
  ebitda_usd NUMERIC,
  net_income_usd NUMERIC,
  total_assets_usd NUMERIC,
  source TEXT,
  fetched_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_name, year)
);

-- New table: company_trade (UN Comtrade export data)
CREATE TABLE IF NOT EXISTS company_trade (
  id SERIAL PRIMARY KEY,
  company_name TEXT REFERENCES companies(name) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  hs_code TEXT,
  partner_country TEXT,
  export_value_usd NUMERIC,
  export_weight_tonnes NUMERIC,
  is_eu_destination BOOLEAN DEFAULT false,
  fetched_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
