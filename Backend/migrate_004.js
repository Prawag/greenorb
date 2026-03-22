import fs from 'fs';
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({path: './.env'});

const sql = neon(process.env.DATABASE_URL);

async function runMigration() {
    try {
        await sql`CREATE TABLE IF NOT EXISTS forest_alerts (id SERIAL PRIMARY KEY, lat DECIMAL(10, 6) NOT NULL, lng DECIMAL(10, 6) NOT NULL, alert_date TIMESTAMP WITH TIME ZONE NOT NULL, area_ha DECIMAL(10, 2), confidence VARCHAR(20), country VARCHAR(100), created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)`;
        await sql`CREATE TABLE IF NOT EXISTS coral_alerts (id SERIAL PRIMARY KEY, lat DECIMAL(10, 6) NOT NULL, lng DECIMAL(10, 6) NOT NULL, alert_level VARCHAR(50) NOT NULL, dhw DECIMAL(8, 2), region_name VARCHAR(255), recorded_at TIMESTAMP WITH TIME ZONE NOT NULL, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)`;
        await sql`CREATE TABLE IF NOT EXISTS fishing_alerts (id SERIAL PRIMARY KEY, vessel_id VARCHAR(100), lat DECIMAL(10, 6) NOT NULL, lng DECIMAL(10, 6) NOT NULL, flag_country VARCHAR(100), fishing_hours DECIMAL(8, 2), is_suspected_illegal BOOLEAN DEFAULT false, observed_at TIMESTAMP WITH TIME ZONE NOT NULL, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)`;
        await sql`CREATE TABLE IF NOT EXISTS proximity_alerts (id SERIAL PRIMARY KEY, company_id INTEGER, disaster_type VARCHAR(50) NOT NULL, disaster_title VARCHAR(255) NOT NULL, distance_km FLOAT NOT NULL, dis_score INTEGER NOT NULL, severity VARCHAR(20) NOT NULL, status VARCHAR(20) DEFAULT 'OPEN', created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, resolved_at TIMESTAMP WITH TIME ZONE, UNIQUE (company_id, disaster_title))`;
        console.log("✅ Tables Initialized");
    } catch (e) {
        console.error("❌ Migration error:", e);
    }
}
runMigration();
