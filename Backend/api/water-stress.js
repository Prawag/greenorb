import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 86400 }); // 24 hours

export default function mountWaterStress(sql) {
    return async (req, res) => {
        const cached = cache.get('water-stress');
        if (cached) return res.json(cached);

        try {
            // Live fetch attempt to WRI Aqueduct (Free API)
            // Example endpoint (mocking exact API structure since aqueduct v4 requires specific geospatial queries)
            const liveRes = await fetch('https://www.wri.org/data/aqueduct-water-risk-atlas/api/v4/basins?limit=100');
            let data = [];

            if (liveRes.ok) {
                const json = await liveRes.json();
                data = json.data.map(basin => ({
                    basin_name: basin.name,
                    lat: basin.lat,
                    lng: basin.lng,
                    stress_score: basin.score, // 0-5
                    stress_label: basin.label,
                    geometry: basin.geom // GeoJSON
                }));
            } else {
                throw new Error(`WRI API returned ${liveRes.status}`);
            }

            const payload = {
                data,
                cached_at: new Date().toISOString(),
                stale: false,
                source: 'WRI Aqueduct',
                ttl: 86400
            };
            cache.set('water-stress', payload);
            res.json(payload);
        } catch (error) {
            console.error('Water Stress Error:', error.message);
            // Fallback generation (High risk basins)
            let fallbackData = [
                { lat: 34.0, lng: -118.0, basin_name: 'Colorado River Basin', stress_score: 4.8, stress_label: 'Extremely High' },
                { lat: -30.0, lng: 25.0, basin_name: 'Orange River Basin', stress_score: 4.2, stress_label: 'Extremely High' },
                { lat: 25.0, lng: 75.0, basin_name: 'Indus Basin', stress_score: 4.9, stress_label: 'Extremely High' },
                { lat: -33.9, lng: 18.4, basin_name: 'Western Cape System', stress_score: 3.5, stress_label: 'High' }
            ];

            const payload = {
                data: fallbackData,
                cached_at: new Date().toISOString(),
                stale: true,
                error: error.message,
                source: 'WRI Aqueduct',
                ttl: 86400
            };
            res.json(payload);
        }
    };
}
