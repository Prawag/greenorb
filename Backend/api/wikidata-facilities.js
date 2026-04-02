import fetch from 'node-fetch';
import NodeCache from 'node-cache';

// Data from Wikidata rarely changes rapidly, caching for 7 days
const cache = new NodeCache({ stdTTL: 604800 });
const CACHE_KEY = "wikidata_india_facilities";

export default function mountWikidataFacilities(app, sql) {
  app.get('/api/facilities/wikidata', async (req, res) => {
    // We expect country=India for now, but could expand.
    const { country } = req.query;

    const cached = cache.get(CACHE_KEY);
    if (cached) {
      return res.json({ ...cached, stale: false });
    }

    try {
      // SPARQL query defined by ChatGPT research for Indian manufacturers
      const sparql = `
        SELECT ?company ?companyLabel ?coord ?industryLabel WHERE {
          ?company wdt:P31/wdt:P279* wd:Q4830453;
                   wdt:P131 wd:Q668;
                   wdt:P452 ?industry;
                   wdt:P625 ?coord.
          ?industry wdt:P279* wd:Q1143653.
          SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
        }
      `;

      const response = await fetch('https://query.wikidata.org/sparql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/sparql-results+json',
          'User-Agent': 'GreenOrb/1.0 (Contact: pravag@greenorb.xyz)'
        },
        body: `query=${encodeURIComponent(sparql)}`
      });

      if (!response.ok) {
        throw new Error(`Wikidata SPARQL returned ${response.status}`);
      }

      const json = await response.json();
      const bindings = json.results?.bindings || [];

      const parsedFacilities = [];
      const dbPromises = [];

      for (const b of bindings) {
        // ?coord is in WKT strictly: "Point(lng lat)"
        const ptStr = b.coord?.value || "";
        const m = ptStr.match(/Point\(([\-\d\.]+)\s+([\-\d\.]+)\)/);
        if (m) {
           const lng = parseFloat(m[1]);
           const lat = parseFloat(m[2]);
           const comp = b.companyLabel?.value || "Unknown Company";
           const ind = b.industryLabel?.value || "manufacturing";

           const payload = {
             company: comp,
             industry: ind,
             lat,
             lng,
             source: 'wikidata'
           };

           parsedFacilities.push(payload);

           // Seed DB if possible
           if (sql) {
              const facName = `${comp} - Wikidata Node`;
              const dbP = sql`
                 INSERT INTO facilities (company_name, facility_name, facility_type, lat, lng, source)
                 VALUES (${comp}, ${facName}, ${ind}, ${lat}, ${lng}, 'wikidata')
                 ON CONFLICT (company_name, facility_name) DO NOTHING
              `.catch(e => console.error("Wikidata DB ingest error:", e.message));
              
              dbPromises.push(dbP);
           }
        }
      }

      if (dbPromises.length > 0) {
        await Promise.all(dbPromises);
      }

      const resultPayload = {
        data: parsedFacilities,
        total: parsedFacilities.length,
        cached_at: new Date().toISOString(),
        ttl: 604800,
        source: "Wikidata SPARQL",
        stale: false
      };

      cache.set(CACHE_KEY, resultPayload);
      res.json(resultPayload);

    } catch (e) {
      console.error("[Wikidata Fetch Error]:", e);
      res.status(500).json({ error: e.message });
    }
  });
}
