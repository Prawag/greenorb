import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
dotenv.config();

const sql = neon(process.env.DATABASE_URL);

const facilities = [
    { company_name: 'Monde Nissin', facility_name: 'Sta. Rosa Plant', facility_type: 'FACTORY', lat: 14.316, lng: 121.111, status: 'OPERATIONAL' },
    { company_name: 'Adnoc', facility_name: 'Ruwais Refinery', facility_type: 'REFINERY', lat: 24.116, lng: 52.733, status: 'OPERATIONAL' },
    { company_name: 'Agroindustria Fertilizantes', facility_name: 'Fertilizer Base 1', facility_type: 'FACTORY', lat: -23.55, lng: -46.63, status: 'OPERATIONAL' },
    { company_name: 'P&G', facility_name: 'Cincinnati Innovation Center', facility_type: 'R&D', lat: 39.103, lng: -84.512, status: 'OPERATIONAL' },
    { company_name: 'Olam International', facility_name: 'Cocoa Processing Facility', facility_type: 'FACTORY', lat: 5.316, lng: -4.016, status: 'OPERATIONAL' },
    { company_name: 'Syngenta', facility_name: 'Seeds Production Site', facility_type: 'FACTORY', lat: 47.558, lng: 7.589, status: 'OPERATIONAL' },
    { company_name: 'Sara Lee Corporation', facility_name: 'Bakery Logistics Hub', facility_type: 'WAREHOUSE', lat: 41.878, lng: -87.629, status: 'MAINTENANCE' },
    { company_name: 'Kellogg Company', facility_name: 'Battle Creek Plant', facility_type: 'FACTORY', lat: 42.319, lng: -85.182, status: 'OPERATIONAL' }
];

async function seed() {
    console.log("🌱 Seeding Facilities...");
    for (const f of facilities) {
        try {
            await sql`
                INSERT INTO facilities (company_name, facility_name, facility_type, lat, lng, status)
                VALUES (${f.company_name}, ${f.facility_name}, ${f.facility_type}, ${f.lat}, ${f.lng}, ${f.status})
                ON CONFLICT (company_name, facility_name) DO UPDATE SET
                    facility_type = EXCLUDED.facility_type,
                    lat = EXCLUDED.lat,
                    lng = EXCLUDED.lng,
                    status = EXCLUDED.status
            `;
            console.log(`✅ Seeded: ${f.facility_name} for ${f.company_name}`);
        } catch (e) {
            console.error(`❌ Failed: ${f.facility_name}`, e.message);
        }
    }
    console.log("✨ Seeding Complete!");
    process.exit(0);
}

seed();
