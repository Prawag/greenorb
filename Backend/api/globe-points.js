// GET /api/globe/companies
// Serves company emission points for the globe with 5-minute in-memory cache.

import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
const CACHE_KEY = 'globe_companies';

let cityMap = null;

async function getCityMap(sql) {
  if (cityMap) return cityMap;
  console.log('[globe-points] Loading 153k cities into memory...');
  const rows = await sql`SELECT name, country, lat, lng FROM geo_cities`;
  cityMap = new Map();
  for (const r of rows) {
    const key = (r.name || '').toLowerCase().trim() + ',' + 
                (r.country || '').toLowerCase().trim();
    // Use first match if duplicates exist
    if (!cityMap.has(key)) {
      cityMap.set(key, [parseFloat(r.lat), parseFloat(r.lng)]);
    }
  }
  console.log(`[globe-points] Geocoding map ready with ${cityMap.size} keys`);
  return cityMap;
}

const COUNTRY_CENTROIDS = {
  "India":        [20.5937, 78.9629],
  "China":        [35.8617, 104.1954],
  "USA":          [37.0902, -95.7129],
  "United Arab Emirates": [23.4241, 53.8478],
  "Germany":      [51.1657, 10.4515],
  "Brazil":       [14.2350, -51.9253],
  "UK":           [55.3781, -3.4360],
  "Japan":        [36.2048, 138.2529],
  "Singapore":    [1.3521,  103.8198],
  "France":       [46.2276, 2.2137],
  "Australia":    [-25.2744, 133.7751],
  "Canada":       [56.1304, -106.3468],
  "Italy":        [41.8719, 12.5674],
  "Spain":        [40.4637, -3.7492],
  "Netherlands":  [52.1326, 5.2913],
  "Switzerland":  [46.8182, 8.2275],
  "Norway":       [60.4720, 8.4689],
};

export default function mountGlobePoints(app, sql) {
  app.get('/api/globe/companies', async (req, res) => {
    const start = Date.now();
    const date = req.query.date;
    const cacheKey = date ? `${CACHE_KEY}_${date}` : CACHE_KEY;

    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({ ...cached, stale: false });
    }

    try {
      const map = await getCityMap(sql);
      
      let rows;
      if (date) {
        rows = await sql`
          SELECT
            name, sector, country, city, co2, esg, s1, s2, s3, report_year,
            lat, lng, url, geocoding_source
          FROM companies
          WHERE DATE(ts) <= ${date}
        `;
      } else {
        rows = await sql`
          SELECT
            name, sector, country, city, co2, esg, s1, s2, s3, report_year,
            lat, lng, url, geocoding_source
          FROM companies
        `;
      }

      const data = rows.map((r, i) => {
        let lat = parseFloat(r.lat);
        let lng = parseFloat(r.lng);
        let source = r.geocoding_source || 'stored';

        // 1. If coordinates are missing, perform runtime geocoding
        if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) {
          // Try city lookup (case-insensitive)
          const cityKey = (r.city || '').toLowerCase().trim() + ',' + 
                          (r.country || '').toLowerCase().trim();
          const coords = map.get(cityKey);
          
          if (coords) {
            [lat, lng] = coords;
            source = 'city_lookup_runtime';
          } else {
            // Fall back to country centroid
            const centroid = COUNTRY_CENTROIDS[r.country] || [0, 0];
            [lat, lng] = centroid;
            source = 'country_centroid';
            
            // Jitter for centroids
            const jitter = () => (Math.random() - 0.5) * 1.5;
            lat += jitter();
            lng += jitter();
          }
        }

        const s1 = parseFloat(r.s1) || 0;
        const s2 = parseFloat(r.s2) || 0;
        const s3 = parseFloat(r.s3) || 0;
        const co2 = parseFloat(r.co2) || (s1 + s2);
        
        const gradeMap = { 
          'A+': 95, 'A': 90, 'A-': 85, 'B+': 75, 'B': 70, 'B-': 65, 
          'C+': 55, 'C': 50, 'C-': 45, 'D+': 35, 'D': 30, 'D-': 25, 
          'F': 10, 'N/A': 50 
        };

        return {
          id: `company-${i}`,
          name: r.name,
          lat, lng,
          geocoding_source: source,
          country: r.country || 'Unknown',
          city: r.city || 'Unknown',
          sector: r.sector || 'Unknown',
          scope_total: co2,
          greendex: gradeMap[r.esg] || 50,
          esg_grade: r.esg || 'N/A',
          audit_status: co2 > 0 ? 'COMPLETED' : 'PENDING',
          url: r.url
        };
      });

      const response = {
        data,
        cached_at: new Date().toISOString(),
        stale: false,
        source: 'neon_db_geocoded',
        ttl: 300,
        total: data.length,
      };

      cache.set(cacheKey, response);
      console.log(`[globe-points] Served ${data.length} companies · ${Date.now() - start}ms`);
      res.json(response);
    } catch (err) {
      console.error('[globe-points] Error:', err.message);
      res.status(500).json({
        data: [],
        cached_at: new Date().toISOString(),
        stale: true,
        error: err.message,
        source: 'neon_db',
        ttl: 300
      });
    }
  });
}
