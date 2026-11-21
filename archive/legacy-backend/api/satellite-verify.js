import NodeCache from 'node-cache';
import fetch from 'node-fetch';

// 7-day TTL — matches Sentinel-2 revisit cycle
const ndviCache = new NodeCache({ stdTTL: 604800 });
const no2Cache  = new NodeCache({ stdTTL: 86400 }); // NO2 changes faster — 24h

export default function mountSatelliteVerify(app) {

    // POST /api/audit/satellite/ndvi
    app.post('/api/audit/satellite/ndvi', async (req, res) => {
        const { lat, lng, company_name } = req.body;
        if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

        const cacheKey = `ndvi_${parseFloat(lat).toFixed(3)}_${parseFloat(lng).toFixed(3)}`;
        const cached = ndviCache.get(cacheKey);
        if (cached) return res.json({ ...cached, stale: false });

        const cdse_token = process.env.CDSE_TOKEN;
        if (!cdse_token) {
            return res.json({
                data: { verdict: 'NO_CREDENTIALS', company_name },
                cached_at: new Date().toISOString(),
                stale: true, source: 'CDSE_SENTINEL_2_L2A', ttl: 0,
                error: 'CDSE_TOKEN not set in Backend/.env'
            });
        }

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 45000);
            const pyRes = await fetch('http://127.0.0.1:8000/verify/ndvi', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat, lng, radius_m: 500, cdse_token }),
                signal: controller.signal
            });
            clearTimeout(timeout);
            const pyData = await pyRes.json();

            const payload = {
                data: { company_name, lat, lng, ...pyData },
                cached_at: new Date().toISOString(),
                stale: false, source: 'CDSE_SENTINEL_2_L2A', ttl: 604800
            };
            ndviCache.set(cacheKey, payload);
            res.json(payload);
        } catch (err) {
            const stale = ndviCache.get(cacheKey);
            if (stale) return res.json({ ...stale, stale: true });
            res.json({
                data: { verdict: 'API_ERROR', error: err.message, company_name },
                cached_at: new Date().toISOString(),
                stale: true, source: 'INTERNAL_BRIDGE_FAILURE', ttl: 0
            });
        }
    });

    // POST /api/audit/satellite/no2
    app.post('/api/audit/satellite/no2', async (req, res) => {
        const { lat, lng, company_name } = req.body;
        if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

        const cacheKey = `no2_${parseFloat(lat).toFixed(3)}_${parseFloat(lng).toFixed(3)}`;
        const cached = no2Cache.get(cacheKey);
        if (cached) return res.json({ ...cached, stale: false });

        const cdse_token = process.env.CDSE_TOKEN;
        if (!cdse_token) {
            return res.json({
                data: { verdict: 'NO_CREDENTIALS', company_name },
                cached_at: new Date().toISOString(),
                stale: true, source: 'CDSE_SENTINEL_5P_NO2', ttl: 0,
                error: 'CDSE_TOKEN not set in Backend/.env'
            });
        }

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 45000);
            const pyRes = await fetch('http://127.0.0.1:8000/verify/no2', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat, lng, cdse_token }),
                signal: controller.signal
            });
            clearTimeout(timeout);
            const pyData = await pyRes.json();

            const payload = {
                data: { company_name, lat, lng, ...pyData },
                cached_at: new Date().toISOString(),
                stale: false, source: 'CDSE_SENTINEL_5P_NO2', ttl: 86400
            };
            no2Cache.set(cacheKey, payload);
            res.json(payload);
        } catch (err) {
            res.json({
                data: { verdict: 'API_ERROR', error: err.message, company_name },
                cached_at: new Date().toISOString(),
                stale: true, source: 'INTERNAL_BRIDGE_FAILURE', ttl: 0
            });
        }
    });
}
