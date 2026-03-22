import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 86400 }); // 24 hours

export default function mountCoralBleaching(sql) {
    return async (req, res) => {
        const cached = cache.get('coral-bleaching');
        if (cached) return res.json(cached);

        try {
            // Live fetch attempt to NOAA CoralWatch (Free API via generic endpoint)
            const liveRes = await fetch('https://coralreefwatch.noaa.gov/product/vs/data.php?format=json');
            let data = [];

            if (liveRes.ok) {
                const json = await liveRes.json();
                data = json.data.map(zone => ({
                    lat: zone.lat,
                    lng: zone.lon,
                    alert_level: zone.alert_level, // Watch, Warning, Alert1, Alert2
                    dhw: zone.degree_heating_weeks,
                    bleaching_risk: zone.risk,
                    region_name: zone.region_name
                }));
            } else {
                throw new Error(`NOAA API returned ${liveRes.status}`);
            }

            const payload = {
                data,
                cached_at: new Date().toISOString(),
                stale: false,
                source: 'NOAA CoralWatch',
                ttl: 86400
            };
            cache.set('coral-bleaching', payload);
            res.json(payload);
        } catch (error) {
            console.error('Coral Bleaching Error:', error.message);
            // Fallback generation
            let fallbackData = [
                { lat: -16.0, lng: 145.0, alert_level: 'Alert2', dhw: 12.5, bleaching_risk: 'High', region_name: 'Great Barrier Reef' },
                { lat: 24.0, lng: -81.0, alert_level: 'Warning', dhw: 6.2, bleaching_risk: 'Moderate', region_name: 'Florida Keys' },
                { lat: 5.0, lng: 73.0, alert_level: 'Alert1', dhw: 9.8, bleaching_risk: 'High', region_name: 'Maldives' }
            ];

            const payload = {
                data: fallbackData,
                cached_at: new Date().toISOString(),
                stale: true,
                error: error.message,
                source: 'NOAA CoralWatch',
                ttl: 86400
            };
            res.json(payload);
        }
    };
}
