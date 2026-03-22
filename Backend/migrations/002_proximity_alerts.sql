CREATE TABLE IF NOT EXISTS proximity_alerts (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    disaster_type VARCHAR(50) NOT NULL,
    disaster_title VARCHAR(255) NOT NULL,
    distance_km FLOAT NOT NULL,
    dis_score INTEGER NOT NULL,
    severity VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'OPEN', -- OPEN, ACKNOWLEDGED, RESOLVED
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE,
    -- Simple uniqueness constraint to avoid flooding the table with identical open alerts
    UNIQUE (company_id, disaster_title)
);
