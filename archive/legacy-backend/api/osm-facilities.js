import fetch from 'node-fetch';
import NodeCache from 'node-cache';
import { indexOsmBbox } from '../workers/osm-indexer.js';

// Overpass API restricts rate heavily, 24h caching in memory
const cache = new NodeCache({ stdTTL: 86400 });

export default function mountOsmFacilities(app, sql) {
  app.post('/api/facilities/osm', async (req, res) => {
    const { lat, lng, radius_km, company_name } = req.body;
    
    if (!lat || !lng || !radius_km) {
      return res.status(400).json({ error: "lat, lng, and radius_km required" });
    }

    const radius_m = parseFloat(radius_km) * 1000;
    const bbox_hash = `osm_${lat.toFixed(2)}_${lng.toFixed(2)}_${radius_m}`;

    try {
      // 1. Check DB for cached facilities in this bbox
      const dbCached = await sql`
        SELECT * FROM facilities 
        WHERE bbox_hash = ${bbox_hash}
      `;

      if (dbCached.length > 0) {
        console.log(`[OSM API] Cache hit (DB) for ${bbox_hash}`);
        const features = dbCached.map(el => ({
          type: "Feature",
          properties: { id: el.id, name: el.facility_name, landuse: el.facility_type, source: "osm", source_tier: el.source_tier },
          geometry: { type: "Point", coordinates: [el.lng, el.lat] }
        }));
        
        return res.json({ type: "FeatureCollection", features, status: "READY" });
      }

      // 2. Check memory cache for "INDEXING" status to avoid duplicate background jobs
      if (cache.get(`${bbox_hash}_indexing`)) {
        return res.json({ type: "FeatureCollection", features: [], status: "INDEXING" });
      }

      // 3. Trigger background indexing
      cache.set(`${bbox_hash}_indexing`, true, 600); // 10 min lock
      setImmediate(() => {
        indexOsmBbox(sql, lat, lng, radius_km).then(() => {
          cache.del(`${bbox_hash}_indexing`);
        });
      });

      return res.json({
        type: "FeatureCollection",
        features: [],
        status: "INDEXING",
        message: "OSM fetch initiated in background. Try again in 60s."
      });

    } catch (err) {
      console.error("[OSM API Error]:", err);
      res.status(500).json({ error: err.message });
    }
  });
}
