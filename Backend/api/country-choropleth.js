// GET /api/globe/countries
// Aggregates companies by country with GeoJSON geometry for choropleth.

import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });
const CACHE_KEY = 'globe_countries';
let geoJsonCache = null;

// ISO3 lookup for common countries
const COUNTRY_ISO3 = {
  "India": "IND", "China": "CHN", "USA": "USA", "UAE": "ARE",
  "United Arab Emirates": "ARE", "Germany": "DEU", "Brazil": "BRA",
  "UK": "GBR", "Japan": "JPN", "Singapore": "SGP", "Philippines": "PHL",
  "South Korea": "KOR", "France": "FRA", "Australia": "AUS", "Canada": "CAN",
  "Italy": "ITA", "Spain": "ESP", "Netherlands": "NLD", "Switzerland": "CHE",
  "Sweden": "SWE", "Norway": "NOR", "Mexico": "MEX", "Indonesia": "IDN",
  "Russia": "RUS", "South Africa": "ZAF", "Saudi Arabia": "SAU",
  "Turkey": "TUR", "Poland": "POL", "Thailand": "THA", "Malaysia": "MYS",
  "Vietnam": "VNM", "Argentina": "ARG", "Colombia": "COL", "Chile": "CHL",
  "Nigeria": "NGA", "Egypt": "EGY", "Pakistan": "PAK", "Bangladesh": "BGD",
  "Kenya": "KEN",
};

async function fetchGeoJson() {
  if (geoJsonCache) return geoJsonCache;
  try {
    const res = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
    const topo = await res.json();
    geoJsonCache = topo;
    console.log('[country-choropleth] GeoJSON loaded and cached permanently');
    return topo;
  } catch (e) {
    console.error('[country-choropleth] Failed to fetch GeoJSON:', e.message);
    return null;
  }
}

export default function mountCountryChoropleth(app, sql) {
  // Pre-fetch GeoJSON on startup
  fetchGeoJson();

  app.get('/api/globe/countries', async (req, res) => {
    const cached = cache.get(CACHE_KEY);
    if (cached) return res.json({ ...cached, stale: false });

    try {
      const rows = await sql`
        SELECT country, co2, esg, s1, s2
        FROM companies
        WHERE country IS NOT NULL
      `;

      // Aggregate by country
      const countryMap = {};
      for (const r of rows) {
        const c = r.country;
        if (!countryMap[c]) {
          countryMap[c] = { total_co2: 0, grades: [], count: 0, disclosed: 0 };
        }
        const s1 = parseFloat(r.s1) || 0;
        const co2 = parseFloat(r.co2) || s1;
        countryMap[c].total_co2 += co2;
        countryMap[c].count += 1;
        if (s1 > 0) countryMap[c].disclosed += 1;
        // Convert grade to numeric
        const gradeMap = { 'A+': 95, 'A': 90, 'A-': 85, 'B+': 75, 'B': 70, 'B-': 65, 'C+': 55, 'C': 50, 'C-': 45, 'D+': 35, 'D': 30, 'D-': 25, 'F': 10 };
        countryMap[c].grades.push(gradeMap[r.esg] || 50);
      }

      const data = Object.entries(countryMap).map(([country, agg]) => ({
        country,
        iso3: COUNTRY_ISO3[country] || country.substring(0, 3).toUpperCase(),
        avg_greendex: agg.grades.length > 0
          ? parseFloat((agg.grades.reduce((a, b) => a + b, 0) / agg.grades.length).toFixed(1))
          : 50,
        total_emissions_mt: parseFloat(agg.total_co2.toFixed(1)),
        company_count: agg.count,
        disclosure_rate: agg.count > 0
          ? parseFloat((agg.disclosed / agg.count).toFixed(2))
          : 0,
      }));

      const response = {
        data,
        cached_at: new Date().toISOString(),
        stale: false,
        source: 'neon_db_aggregated',
        ttl: 3600,
        total: data.length,
      };

      cache.set(CACHE_KEY, response);
      res.json(response);
    } catch (err) {
      console.error('[country-choropleth] Error:', err.message);
      const staleData = cache.get(CACHE_KEY);
      if (staleData) return res.json({ ...staleData, stale: true });
      res.json({
        data: [],
        cached_at: new Date().toISOString(),
        stale: true,
        source: 'neon_db_aggregated',
        ttl: 3600,
        total: 0,
        error: err.message,
      });
    }
  });
}
