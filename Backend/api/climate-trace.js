// GET /api/globe/assets
// Fetches top 200 highest-emission assets from Climate TRACE free API.

import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 86400, checkperiod: 300 });
const CACHE_KEY = 'globe_climate_trace';

const CLIMATE_TRACE_URL = 'https://api.climatetrace.org/v6/assets?limit=200&sort=co2e_100yr_desc';

export default function mountClimateTrace(app) {
  app.get('/api/globe/assets', async (req, res) => {
    const cached = cache.get(CACHE_KEY);
    if (cached) return res.json({ ...cached, stale: false });

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const apiRes = await fetch(CLIMATE_TRACE_URL, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });
      clearTimeout(timeout);

      if (!apiRes.ok) throw new Error(`Climate TRACE API: ${apiRes.status}`);

      const raw = await apiRes.json();
      const assets = Array.isArray(raw) ? raw : (raw.data || raw.assets || []);

      const data = assets.slice(0, 200).map((a, i) => ({
        asset_id: a.asset_id || a.id || `ct-${i}`,
        name: a.asset_name || a.name || 'Unknown Asset',
        asset_type: a.asset_type || a.sector || 'unknown',
        lat: parseFloat(a.lat) || parseFloat(a.latitude) || 0,
        lng: parseFloat(a.lon) || parseFloat(a.lng) || parseFloat(a.longitude) || 0,
        co2e_mt: parseFloat(a.emissions_quantity) || parseFloat(a.co2e_100yr) || 0,
        country: a.iso3_country || a.country || 'Unknown',
        sector: a.sector || a.asset_type || 'unknown',
      })).filter(a => a.lat !== 0 && a.lng !== 0);

      const response = {
        data,
        cached_at: new Date().toISOString(),
        stale: false,
        source: 'climate_trace_api',
        ttl: 86400,
        total: data.length,
      };

      cache.set(CACHE_KEY, response);
      console.log(`[climate-trace] Cached ${data.length} assets`);
      res.json(response);
    } catch (err) {
      console.error('[climate-trace] Error:', err.message);
      const staleData = cache.get(CACHE_KEY);
      if (staleData) return res.json({ ...staleData, stale: true });
      res.json({
        data: [],
        cached_at: new Date().toISOString(),
        stale: true,
        source: 'climate_trace_api',
        ttl: 86400,
        total: 0,
        error: err.message,
      });
    }
  });
}
