CREATE TABLE IF NOT EXISTS forest_alerts (
    id SERIAL PRIMARY KEY,
    lat DECIMAL(10, 6) NOT EXISTS,
    lng DECIMAL(10, 6) NOT NULL,
    alert_date TIMESTAMP WITH TIME ZONE NOT NULL,
    area_ha DECIMAL(10, 2),
    confidence VARCHAR(20),
    country VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS coral_alerts (
    id SERIAL PRIMARY KEY,
    lat DECIMAL(10, 6) NOT NULL,
    lng DECIMAL(10, 6) NOT NULL,
    alert_level VARCHAR(50) NOT NULL,
    dhw DECIMAL(8, 2),
    region_name VARCHAR(255),
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fishing_alerts (
    id SERIAL PRIMARY KEY,
    vessel_id VARCHAR(100),
    lat DECIMAL(10, 6) NOT NULL,
    lng DECIMAL(10, 6) NOT NULL,
    flag_country VARCHAR(100),
    fishing_hours DECIMAL(8, 2),
    is_suspected_illegal BOOLEAN DEFAULT false,
    observed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_forest_lat_lng ON forest_alerts(lat, lng);
CREATE INDEX IF NOT EXISTS idx_forest_created ON forest_alerts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_coral_lat_lng ON coral_alerts(lat, lng);
CREATE INDEX IF NOT EXISTS idx_coral_created ON coral_alerts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fishing_lat_lng ON fishing_alerts(lat, lng);
CREATE INDEX IF NOT EXISTS idx_fishing_created ON fishing_alerts(created_at DESC);
