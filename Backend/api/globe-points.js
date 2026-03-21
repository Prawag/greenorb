// GET /api/globe/companies
// Serves company emission points for the globe with 5-minute in-memory cache.

import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
const CACHE_KEY = 'globe_companies';

const COUNTRY_CENTROIDS = {
  "India":        [20.5937, 78.9629],
  "China":        [35.8617, 104.1954],
  "USA":          [37.0902, -95.7129],
  "UAE":          [23.4241, 53.8478],
  "United Arab Emirates": [23.4241, 53.8478],
  "Germany":      [51.1657, 10.4515],
  "Brazil":       [14.2350, -51.9253],
  "UK":           [55.3781, -3.4360],
  "Japan":        [36.2048, 138.2529],
  "Singapore":    [1.3521,  103.8198],
  "Philippines":  [12.8797, 121.7740],
  "South Korea":  [35.9078, 127.7669],
  "France":       [46.2276, 2.2137],
  "Australia":    [-25.2744, 133.7751],
  "Canada":       [56.1304, -106.3468],
  "Italy":        [41.8719, 12.5674],
  "Spain":        [40.4637, -3.7492],
  "Netherlands":  [52.1326, 5.2913],
  "Switzerland":  [46.8182, 8.2275],
  "Sweden":       [60.1282, 18.6435],
  "Norway":       [60.4720, 8.4689],
  "Mexico":       [23.6345, -102.5528],
  "Indonesia":    [-0.7893, 113.9213],
  "Russia":       [61.5240, 105.3188],
  "South Africa": [-30.5595, 22.9375],
  "Saudi Arabia": [23.8859, 45.0792],
  "Turkey":       [38.9637, 35.2433],
  "Poland":       [51.9194, 19.1451],
  "Thailand":     [15.8700, 100.9925],
  "Malaysia":     [4.2105, 101.9758],
  "Vietnam":      [14.0583, 108.2772],
  "Argentina":    [-38.4161, -63.6167],
  "Colombia":     [4.5709, -74.2973],
  "Chile":        [-35.6751, -71.5430],
  "Nigeria":      [9.0820, 7.4951],
  "Egypt":        [26.8206, 30.8025],
  "Pakistan":     [30.3753, 69.3451],
  "Bangladesh":   [23.6850, 90.3563],
  "Kenya":        [-0.0236, 37.9062],
};

export default function mountGlobePoints(app, sql) {
  app.get('/api/globe/companies', async (req, res) => {
    const start = Date.now();

    // Check cache first
    const cached = cache.get(CACHE_KEY);
    if (cached) {
      console.log(`[globe-points] Cache HIT · ${cached.data.length} companies · ${Date.now() - start}ms`);
      return res.json({ ...cached, stale: false });
    }

    try {
      const rows = await sql`
        SELECT
          name, sector, country, co2, esg, s1, s2, s3, report_year,
          url, products, methodology
        FROM companies
      `;

      const data = rows.map((r, i) => {
        const centroid = COUNTRY_CENTROIDS[r.country] || [0, 0];
        // Jitter to prevent overlap from same-country companies
        const jitter = () => (Math.random() - 0.5) * 2;
        const s1 = parseFloat(r.s1) || 0;
        const s2 = parseFloat(r.s2) || 0;
        const s3 = parseFloat(r.s3) || 0;
        const scopeTotal = s1 + s2;
        const co2 = parseFloat(r.co2) || scopeTotal;

        // Derive greendex from ESG grade (A=90, B=70, C=50, D=30, F=10)
        const gradeMap = { 'A+': 95, 'A': 90, 'A-': 85, 'B+': 75, 'B': 70, 'B-': 65, 'C+': 55, 'C': 50, 'C-': 45, 'D+': 35, 'D': 30, 'D-': 25, 'F': 10, 'N/A': 50 };
        const greendex = gradeMap[r.esg] || 50;

        return {
          id: `company-${i}`,
          name: r.name,
          lat: centroid[0] + jitter(),
          lng: centroid[1] + jitter(),
          country: r.country || 'Unknown',
          sector: r.sector || 'Unknown',
          scope_1: s1,
          scope_2: s2,
          scope_3: s3,
          scope_total: scopeTotal || co2,
          greendex,
          esg_grade: r.esg || 'N/A',
          audit_status: co2 > 0 ? 'COMPLETED' : 'PENDING',
          report_year: r.report_year || null,
          has_discrepancy: false,
          absence_signals_count: 0,
        };
      });

      const response = {
        data,
        cached_at: new Date().toISOString(),
        stale: false,
        source: 'neon_db',
        ttl: 300,
        total: data.length,
      };

      cache.set(CACHE_KEY, response);
      console.log(`[globe-points] Cache MISS · ${data.length} companies · ${Date.now() - start}ms`);
      res.json(response);
    } catch (err) {
      console.error('[globe-points] DB error:', err.message);
      // Return stale cache if available
      const staleData = cache.get(CACHE_KEY);
      if (staleData) {
        return res.json({ ...staleData, stale: true });
      }
      res.json({
        data: [],
        cached_at: new Date().toISOString(),
        stale: true,
        source: 'neon_db',
        ttl: 300,
        total: 0,
        error: err.message,
      });
    }
  });
}
