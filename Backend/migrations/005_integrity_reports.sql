CREATE TABLE IF NOT EXISTS integrity_reports (
    id SERIAL PRIMARY KEY,
    company_name TEXT REFERENCES companies(name),
    reported_scope2 NUMERIC,
    expected_scope2 NUMERIC,
    discrepancy_pct NUMERIC,
    verdict TEXT,
    cea_version TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
