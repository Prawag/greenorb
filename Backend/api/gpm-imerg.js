import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 1800 });

export default function mountGpmImerg(sql) {
    return async (req, res) => {
        const cached = cache.get('gpm');
        if (cached) return res.json(cached);

        try {
            // Mock integration for now assuming user will supply EARTHDATA config later
            // The actual GPM IMERG late run is grabbed from NASA's opendap/GDS
            // For now, let's generate some placeholder precipitation data globally
            const data = [];
            for (let i = 0; i < 500; i++) {
                const lat = (Math.random() - 0.5) * 160;
                const lng = (Math.random() - 0.5) * 360;
                const precipitation_mm = Math.random() * 120; // up to 120mm
                if (precipitation_mm > 5) {
                    data.push({
                        lat, lng, 
                        precipitation_mm: parseFloat(precipitation_mm.toFixed(2)),
                        intensity: precipitation_mm > 50 ? 'HEAVY' : precipitation_mm > 20 ? 'MODERATE' : 'LIGHT'
                    });
                }
            }

            const responsePayload = {
                data,
                cached_at: new Date().toISOString(),
                stale: false,
                source: 'NASA GPM IMERG (Mocked)',
                ttl: 1800
            };

            cache.set('gpm', responsePayload);
            cache.set('gpm_fallback', { ...responsePayload, stale: true });
            
            res.json(responsePayload);
        } catch (error) {
            console.error('GPM API Error:', error);
            const fallback = cache.get('gpm_fallback') || { data: [] };
            res.json({
                ...fallback,
                cached_at: new Date().toISOString(),
                stale: true,
                error: error.message,
                source: 'NASA GPM IMERG',
                ttl: 1800
            });
        }
    };
}
