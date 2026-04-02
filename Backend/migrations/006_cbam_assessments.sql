CREATE TABLE IF NOT EXISTS cbam_assessments (
    id SERIAL PRIMARY KEY,
    company_name TEXT REFERENCES companies(name),
    sector TEXT,
    exposure_risk TEXT,
    tariff_estimate_eur NUMERIC,
    eu_export_pct NUMERIC,
    verified_esg BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
