import { readFileSync, existsSync } from 'fs';
import NodeCache from 'node-cache';
import { checkWaterStress } from '../lib/spatial-water.js';

const cache = new NodeCache({ stdTTL: 86400 });

export default function mountWaterStress(app) {
  app.post('/api/audit/water-stress', (req, res) => {
    const { lat, lng } = req.body;
    if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });
    const result = checkWaterStress(parseFloat(lat), parseFloat(lng));
    res.json({ data: result, source: 'WRI Aqueduct Offline Index (Turf.js)' });
  });

  return async (req, res) => {
    const cached = cache.get('water-stress');
    if (cached) return res.json(cached);

    try {
      const filePath = './data/water-stress.json';
      if (!existsSync(filePath)) {
        throw new Error('WRI data not yet downloaded');
      }
      
      const raw = JSON.parse(readFileSync(filePath, 'utf8'));
      const data = raw.map(b => ({
        lat: b.lat,
        lng: b.lng,
        basin_name: b.basin,
        stress_score: b.bws_raw,
        stress_label: b.bws_label,
        category: b.bws_cat,
      }));
      
      const payload = {
        data,
        cached_at: new Date().toISOString(),
        stale: false,
        source: 'WRI Aqueduct 3.0 (CC-BY 4.0)',
        ttl: 86400,
      };
      cache.set('water-stress', payload);
      res.json(payload);
    } catch (err) {
      res.json({
        data: [],
        cached_at: new Date().toISOString(),
        stale: true,
        source: 'WRI Aqueduct',
        ttl: 86400,
        error: err.message,
      });
    }
  };
}
