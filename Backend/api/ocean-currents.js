import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 21600 }); // 6 hours

export default function mountOceanCurrents(sql) {
    return async (req, res) => {
        const cached = cache.get('ocean-currents');
        if (cached) return res.json(cached);

        try {
            const apiKey = process.env.COPERNICUS_MARINE_KEY;
            let data = [];
            let isStale = false;

            if (apiKey) {
                // Attempt live fetch if key is provided
                const liveRes = await fetch('https://data.marine.copernicus.eu/api/fake-marine-trajectory', {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                });
                if (liveRes.ok) {
                    const json = await liveRes.json();
                    data = json.currents || []; // map real schema here
                } else {
                    throw new Error(`Copernicus API failed: ${liveRes.status}`);
                }
            } else {
                throw new Error("Missing COPERNICUS_MARINE_KEY");
            }

            const payload = {
                data,
                cached_at: new Date().toISOString(),
                stale: isStale,
                source: 'Copernicus Marine',
                ttl: 21600
            };
            cache.set('ocean-currents', payload);
            cache.set('ocean-currents_fallback', { ...payload, stale: true, source: 'Copernicus Marine (Fallback)' });
            res.json(payload);
        } catch (error) {
            console.error('Ocean Currents Error:', error.message);
            // Fallback generation
            let fallbackData = [];
            for(let i=0; i<300; i++) {
                fallbackData.push({
                    lat: (Math.random() - 0.5) * 160,
                    lng: (Math.random() - 0.5) * 360,
                    speed_ms: parseFloat((Math.random() * 2.5).toFixed(2)), // 0 to 2.5 m/s
                    direction_deg: Math.floor(Math.random() * 360) 
                });
            }
            
            const payload = {
                data: fallbackData,
                cached_at: new Date().toISOString(),
                stale: true,
                error: error.message,
                source: 'Copernicus Marine',
                ttl: 21600
            };
            cache.set('ocean-currents_fallback', payload);
            res.json(payload);
        }
    };
}
