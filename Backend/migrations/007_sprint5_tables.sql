CREATE TABLE IF NOT EXISTS welford_baselines (
  company_id        VARCHAR(255) NOT NULL,
  metric_name       VARCHAR(255) NOT NULL,
  observation_count BIGINT DEFAULT 0,
  running_mean      DOUBLE PRECISION DEFAULT 0.0,
  m2_sum            DOUBLE PRECISION DEFAULT 0.0,
  last_updated      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (company_id, metric_name)
);
CREATE INDEX IF NOT EXISTS idx_welford_lookup
  ON welford_baselines(company_id, metric_name);

CREATE TABLE IF NOT EXISTS city_metrics (
  city_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_name       VARCHAR(100) NOT NULL,
  state_name      VARCHAR(100) NOT NULL,
  boundary_geojson TEXT,
  aqi_level        INTEGER,
  pm2_5            DOUBLE PRECISION,
  water_quality_index DOUBLE PRECISION,
  municipal_energy_kwh BIGINT,
  last_updated     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_city_name ON city_metrics(city_name);

CREATE TABLE IF NOT EXISTS brsr_filings (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name           VARCHAR(255) NOT NULL,
  scrip_code             VARCHAR(20),
  report_year            INTEGER NOT NULL,
  scope1_emissions       DOUBLE PRECISION,
  scope2_emissions       DOUBLE PRECISION,
  water_consumption      DOUBLE PRECISION,
  energy_consumption     DOUBLE PRECISION,
  waste_generated        DOUBLE PRECISION,
  women_workforce_pct    DOUBLE PRECISION,
  board_independence_pct DOUBLE PRECISION,
  raw_xbrl_url           TEXT,
  parsed_at              TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_name, report_year)
);
CREATE INDEX IF NOT EXISTS idx_brsr_company ON brsr_filings(company_name);
