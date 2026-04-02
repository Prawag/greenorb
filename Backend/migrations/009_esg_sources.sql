CREATE TABLE IF NOT EXISTS esg_sources (
  id SERIAL PRIMARY KEY,
  company_name TEXT,
  source TEXT NOT NULL,
  scope1_mt NUMERIC,
  scope2_location_mt NUMERIC,
  scope2_market_mt NUMERIC,
  scope3_mt NUMERIC,
  water_withdrawal_kl NUMERIC,
  renewable_energy_pct NUMERIC,
  report_year INTEGER,
  report_url TEXT,
  methodology JSONB,
  fetched_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS scope2_location NUMERIC,
  ADD COLUMN IF NOT EXISTS scope2_market NUMERIC,
  ADD COLUMN IF NOT EXISTS water_withdrawal_kl NUMERIC,
  ADD COLUMN IF NOT EXISTS renewable_energy_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS net_zero_year INTEGER,
  ADD COLUMN IF NOT EXISTS cbam_exposed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS verification_body TEXT,
  ADD COLUMN IF NOT EXISTS report_url TEXT,
  ADD COLUMN IF NOT EXISTS gwp_version TEXT,
  ADD COLUMN IF NOT EXISTS boundary_approach TEXT;
