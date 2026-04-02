CREATE TABLE IF NOT EXISTS welford_baselines (
  company_id VARCHAR NOT NULL,
  metric_name VARCHAR NOT NULL,
  observation_count BIGINT DEFAULT 0,
  running_mean DOUBLE PRECISION DEFAULT 0,
  m2_sum DOUBLE PRECISION DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (company_id, metric_name)
);

CREATE TABLE IF NOT EXISTS city_metrics (
  city_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_name TEXT,
  state_name TEXT,
  boundary_geojson TEXT,
  aqi_level INTEGER,
  pm2_5 DOUBLE PRECISION,
  water_quality_index DOUBLE PRECISION,
  municipal_energy_kwh BIGINT,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS brsr_filings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  scrip_code INTEGER,
  report_year INTEGER,
  scope1_emissions NUMERIC,
  scope2_emissions NUMERIC,
  water_consumption NUMERIC,
  energy_consumption NUMERIC,
  waste_generated NUMERIC,
  women_workforce_pct NUMERIC,
  board_independence_pct NUMERIC,
  raw_xbrl_url TEXT,
  parsed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_name, report_year)
);
