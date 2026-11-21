import NodeCache from 'node-cache';
import fetch from 'node-fetch';
import { safeCompanyUpdate } from '../lib/company-service.js';

const cache = new NodeCache({ stdTTL: 86400 });
const CACHE_KEY = 'globe_climate_trace_live';

export default function mountClimateTrace(app, sql) {
  app.get('/api/globe/assets', async (req, res) => {
    const cached = cache.get(CACHE_KEY);
    if (cached) return res.json({ ...cached, stale: false });

    try {
      // Hit v4 API for Steel facilities in India
      const url = "https://api.climatetrace.org/v4/assets?country=IND&sector=steel&limit=100";
      const fetchRes = await fetch(url);
      const json = await fetchRes.json();
      
      const assets = json.assets || [];
      
      const mappedAssets = assets.map(a => ({
        asset_id: a.Id || String(Math.random()),
        name: a.Name,
        asset_type: 'steel',
        lat: a.Centroid?.Geometry?.[1] || 0,
        lng: a.Centroid?.Geometry?.[0] || 0,
        co2e_mt: a.Emissions?.[0] || 0,
        country: 'IND',
        sector: 'steel'
      })).filter(a => a.name && a.lat !== 0);

      // Merge into facilities table
      if (sql && mappedAssets.length > 0) {
          for (const a of mappedAssets) {
             const companyName = 'Unknown (Climate TRACE)';
             await sql`
                 INSERT INTO facilities (company_name, facility_name, facility_type, lat, lng, source, source_tier)
                 VALUES (${companyName}, ${a.name}, ${a.asset_type}, ${a.lat}, ${a.lng}, 'climate_trace', 'SILVER')
                 ON CONFLICT (company_name, facility_name) DO NOTHING
             `.catch(e => console.log('Climate Trace DB Insert error:', e.message));

             // If we had a mechanism to link this facility to a real company, 
             // we would use safeCompanyUpdate(sql, realCompanyName, { ... }, 'SILVER') here.
          }
      }

      const response = {
        data: mappedAssets,
        cached_at: new Date().toISOString(),
        stale: false,
        source: 'Climate TRACE v4 API',
        ttl: 86400,
        total: mappedAssets.length,
      };

      cache.set(CACHE_KEY, response);
      res.json(response);
    } catch (e) {
      console.error("Climate TRACE error:", e);
      res.status(500).json({ error: e.message });
    }
  });
}

