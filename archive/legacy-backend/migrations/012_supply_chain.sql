-- Add supply chain tables from Build 6 & 8
CREATE TABLE IF NOT EXISTS company_suppliers (
  id SERIAL PRIMARY KEY,
  buyer_company TEXT REFERENCES companies(name) ON DELETE CASCADE,
  supplier_name TEXT NOT NULL,
  supplier_country TEXT,
  shipment_count INTEGER,
  total_weight_kg NUMERIC,
  hs_codes TEXT[],
  top_ports TEXT[],
  data_source TEXT DEFAULT 'importyeti',
  fetched_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(buyer_company, supplier_name)
);

CREATE TABLE IF NOT EXISTS supply_chain_links (
  id SERIAL PRIMARY KEY,
  buyer_company TEXT REFERENCES companies(name),
  supplier_company TEXT REFERENCES companies(name),
  link_type TEXT DEFAULT 'BUYER_SUPPLIER',
  confirmed BOOLEAN DEFAULT false,
  source TEXT DEFAULT 'importyeti',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vessel_positions (
  mmsi BIGINT PRIMARY KEY,
  vessel_name TEXT,
  lat NUMERIC(9,6),
  lng NUMERIC(9,6),
  sog_knots NUMERIC(5,2),
  company_name TEXT,
  route_from TEXT,  -- e.g., "JNPT Mumbai"
  route_to TEXT,    -- e.g., "Rotterdam"
  estimated_cargo_mt NUMERIC,
  estimated_co2_kg NUMERIC,
  last_seen TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
