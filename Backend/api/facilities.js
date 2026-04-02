export default function mountFacilities(app, sql) {
    // GET all facilities or filter by company
    app.get('/api/facilities', async (req, res) => {
        const { company } = req.query;
        try {
            let data;
            if (company) {
                data = await sql`SELECT * FROM facilities WHERE company_name = ${company} ORDER BY created_at DESC`;
            } else {
                data = await sql`SELECT * FROM facilities ORDER BY created_at DESC`;
            }
            res.json({
                data,
                cached_at: new Date().toISOString(),
                stale: false,
                source: 'GreenOrb Facility Network',
                ttl: 300
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // POST new facility
    app.post('/api/facilities', async (req, res) => {
        const { company_name, facility_name, facility_type, lat, lng, status } = req.body;
        try {
            await sql`
                INSERT INTO facilities (company_name, facility_name, facility_type, lat, lng, status)
                VALUES (${company_name}, ${facility_name}, ${facility_type}, ${lat}, ${lng}, ${status || 'OPERATIONAL'})
                ON CONFLICT (company_name, facility_name) DO UPDATE SET
                    facility_type = EXCLUDED.facility_type,
                    lat = EXCLUDED.lat,
                    lng = EXCLUDED.lng,
                    status = EXCLUDED.status
            `;
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
}
