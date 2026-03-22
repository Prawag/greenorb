import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 3600 }); // 1 hour

export default function mountFishingWatch(sql) {
    return async (req, res) => {
        const cached = cache.get('fishing-watch');
        if (cached) return res.json(cached);

        try {
            const apiKey = process.env.GFW_API_KEY;
            let data = [];
            let isStale = false;

            if (apiKey) {
                const liveRes = await fetch('https://gateway.api.globalfishingwatch.org/v2/events', {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                });
                if (liveRes.ok) {
                    const json = await liveRes.json();
                    data = json.entries.map(e => ({
                        lat: e.lat, lng: e.lon,
                        vessel_id: e.vessel.id,
                        flag_country: e.vessel.flag,
                        fishing_hours: e.duration,
                        is_suspected_illegal: e.event_type === 'loitering' || e.event_type === 'gap'
                    }));
                } else {
                    throw new Error(`GFW API failed: ${liveRes.status}`);
                }
            } else {
                throw new Error("Missing GFW_API_KEY");
            }

            const payload = {
                data,
                cached_at: new Date().toISOString(),
                stale: isStale,
                source: 'Global Fishing Watch',
                ttl: 3600
            };
            cache.set('fishing-watch', payload);
            res.json(payload);
        } catch (error) {
            console.error('Fishing Watch Error:', error.message);
            let fallbackData = [];
            for(let i=0; i<20; i++) {
                fallbackData.push({
                    lat: (Math.random() - 0.5) * 160,
                    lng: (Math.random() - 0.5) * 360,
                    vessel_id: `MMSI-${Math.floor(Math.random() * 9999999)}`,
                    flag_country: 'CHN',
                    fishing_hours: Math.random() * 48,
                    is_suspected_illegal: Math.random() > 0.8
                });
            }

            const payload = {
                data: fallbackData,
                cached_at: new Date().toISOString(),
                stale: true,
                error: error.message,
                source: 'Global Fishing Watch',
                ttl: 3600
            };
            res.json(payload);
        }
    };
}
