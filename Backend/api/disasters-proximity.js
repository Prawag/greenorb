export default function mountDisastersProximity(app, sql) {
    // ─── Phase 6: Server-Side Physical Proximity Engine ──────────
    // Uses Haversine formula to detect physical footprint contradictions
    function haversineDist(lat1, lon1, lat2, lon2) {
        const R = 6371; // km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    async function evaluateSprint4Proximity() {
        try {
            // Fetch live environmental states
            const port = process.env.PORT || 5000;
            const baseUrl = `http://localhost:${port}`;
            
            const [forestReq, coralReq, waterReq] = await Promise.all([
                fetch(`${baseUrl}/api/forest-loss`).catch(()=>null),
                fetch(`${baseUrl}/api/coral-bleaching`).catch(()=>null),
                fetch(`${baseUrl}/api/water-stress`).catch(()=>null),
            ]);

            const forestData = forestReq && forestReq.ok ? (await forestReq.json()).data || [] : [];
            const coralData = coralReq && coralReq.ok ? (await coralReq.json()).data || [] : [];
            const waterData = waterReq && waterReq.ok ? (await waterReq.json()).data || [] : [];

            const companies = await sql`SELECT name, lat, lng FROM companies WHERE lat IS NOT NULL`;

            let inserted = 0;

            for (const c of companies) {
                // 1. Forest Loss Alert (100km radius)
                for (const act of forestData) {
                    const dist = haversineDist(c.lat, c.lng, act.lat, act.lng);
                    if (dist <= 100) {
                        try {
                            await sql`INSERT INTO proximity_alerts (company_id, disaster_type, disaster_title, distance_km, dis_score, severity) VALUES (${c.name}, 'forest_loss', 'Active Deforestation Zone', ${dist}, 85, 'CRITICAL') ON CONFLICT (company_id, disaster_title) DO NOTHING`;
                            inserted++;
                        } catch(e){}
                        break;
                    }
                }

                // 2. Coral Bleaching Alert2 (50km radius)
                const alert2Corals = coralData.filter(d => d.alert_level === 'Alert2');
                for (const act of alert2Corals) {
                    const dist = haversineDist(c.lat, c.lng, act.lat, act.lng);
                    if (dist <= 50) {
                        try {
                            await sql`INSERT INTO proximity_alerts (company_id, disaster_type, disaster_title, distance_km, dis_score, severity) VALUES (${c.name}, 'coral', 'Coral Bleaching Alert Level 2', ${dist}, 90, 'CRITICAL') ON CONFLICT (company_id, disaster_title) DO NOTHING`;
                            inserted++;
                        } catch(e){}
                        break;
                    }
                }

                // 3. Water Stress (200km radius)
                const highWater = waterData.filter(d => d.stress_score >= 3);
                for (const act of highWater) {
                    const dist = haversineDist(c.lat, c.lng, act.lat, act.lng);
                    if (dist <= 200) {
                        try {
                            await sql`INSERT INTO proximity_alerts (company_id, disaster_type, disaster_title, distance_km, dis_score, severity) VALUES (${c.name}, 'water_stress', ${'Water Stress: ' + act.basin_name}, ${dist}, 75, 'HIGH') ON CONFLICT (company_id, disaster_title) DO NOTHING`;
                            inserted++;
                        } catch(e){}
                        break;
                    }
                }
            }
            if (inserted > 0) console.log(`[Proximity Engine] Inserted ${inserted} new land/ocean alerts.`);
        } catch (e) {
            console.error('[Proximity Engine Evaluation]', e.message);
        }
    }

    // Run Engine
    app.post('/api/disasters-proximity/run', async (req, res) => {
        evaluateSprint4Proximity();
        res.json({ success: true, message: 'Proximity engine evaluation triggered.' });
    });

    // Run evaluating periodically
    setInterval(evaluateSprint4Proximity, 1800000); // 30 minutes

    // ─── Save new proximity alerts (called by UI Worker) ──────────
    app.post('/api/disasters-proximity', async (req, res) => {
        const { alerts } = req.body;
        if (!alerts || !Array.isArray(alerts)) return res.status(400).json({ error: 'alerts array required' });

        let inserted = 0;
        for (const alert of alerts) {
            // alert contains physical proximity signals from convergence.worker
            const pxSignals = alert.signals.filter(s => s.type === 'PHYSICAL_PROXIMITY_ALERT');
            for (const s of pxSignals) {
                // Parse "Flood within 25.4km"
                const titleMatch = s.label.match(/^(.*?) within ([\d.]+)km/);
                const title = titleMatch ? titleMatch[1] : s.label;
                const dist = titleMatch ? parseFloat(titleMatch[2]) : 0;
                // Parse "DIS Score: 85/100"
                const scoreMatch = s.value.match(/DIS Score: (\d+)/);
                const score = scoreMatch ? parseInt(scoreMatch[1]) : 0;

                try {
                    await sql`
                        INSERT INTO proximity_alerts (company_id, disaster_type, disaster_title, distance_km, dis_score, severity)
                        VALUES (${alert.company_name}, ${title}, ${title}, ${dist}, ${score}, ${s.severity})
                        ON CONFLICT (company_id, disaster_title) DO NOTHING
                    `;
                    inserted++;
                } catch (e) {
                    console.error('[Proximity Engine] DB insert error', e.message);
                }
            }
        }
        res.json({ success: true, inserted });
    });

    app.get('/api/disasters-proximity', async (req, res) => {
        try {
            const alerts = await sql`
                SELECT p.*, c.name as company_name 
                FROM proximity_alerts p
                JOIN companies c ON p.company_id = c.name
                WHERE p.status = 'OPEN'
                ORDER BY p.created_at DESC
                LIMIT 100
            `;
            res.json(alerts);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // ─── Fetch proximity alerts (for TrustDashboard) ──────────
    app.get('/api/disasters-proximity/company/:id', async (req, res) => {
        const companyId = req.params.id;
        try {
            const alerts = await sql`
                SELECT * FROM proximity_alerts 
                WHERE company_id = ${companyId} 
                ORDER BY created_at DESC
            `;
            res.json(alerts);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // ─── Resolve proximity alert ──────────
    app.post('/api/disasters-proximity/:alertId/resolve', async (req, res) => {
        try {
            await sql`
                UPDATE proximity_alerts 
                SET status = 'RESOLVED', resolved_at = CURRENT_TIMESTAMP
                WHERE id = ${req.params.alertId}
            `;
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
}
