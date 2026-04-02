import fetch from 'node-fetch';
import NodeCache from 'node-cache';

// Overpass API restricts rate heavily, 24h caching
const cache = new NodeCache({ stdTTL: 86400 });

export default function mountOsmFacilities(app) {
  app.post('/api/facilities/osm', async (req, res) => {
    const { lat, lng, radius_km, company_name } = req.body;
    
    if (!lat || !lng || !radius_km) {
      return res.status(400).json({ error: "lat, lng, and radius_km required" });
    }

    const radius_m = parseFloat(radius_km) * 1000;
    const cacheKey = `osm_${lat.toFixed(2)}_${lng.toFixed(2)}_${radius_m}`;

    let data;
    const cached = cache.get(cacheKey);
    if (cached) {
      data = cached;
    } else {
      try {
        const query = `
          [out:json][timeout:25];
          (
            node(around:${radius_m},${lat},${lng})["industrial"~"^(factory|plant)$"];
            way(around:${radius_m},${lat},${lng})["industrial"~"^(factory|plant)$"];
            relation(around:${radius_m},${lat},${lng})["industrial"~"^(factory|plant)$"];
            node(around:${radius_m},${lat},${lng})["man_made"="works"];
            way(around:${radius_m},${lat},${lng})["man_made"="works"];
            node(around:${radius_m},${lat},${lng})["landuse"="industrial"];
            way(around:${radius_m},${lat},${lng})["landuse"="industrial"];
          );
          out center;
        `;
        
        const response = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: `data=${encodeURIComponent(query)}`
        });

        if (!response.ok) {
           throw new Error(`Overpass API responded with ${response.status}`);
        }

        data = await response.json();
        cache.set(cacheKey, data);
      } catch (err) {
        console.error("OSM Overpass error:", err);
        return res.status(500).json({ error: err.message });
      }
    }

    // Convert Overpass JSON format to standardized GeoJSON FeatureCollection
    let features = (data.elements || []).map(el => {
      const elLat = el.type === 'node' ? el.lat : el.center?.lat;
      const elLng = el.type === 'node' ? el.lon : el.center?.lon;
      const tags = el.tags || {};
      
      return {
        type: "Feature",
        properties: {
          id: el.id,
          name: tags.name || tags.operator || "Unknown Industrial Site",
          landuse: tags.landuse || tags.industrial || "industrial",
          source: "osm"
        },
        geometry: {
          type: "Point",
          coordinates: [elLng, elLat]
        }
      };
    }).filter(f => f.geometry.coordinates[0] !== undefined);

    // Apply exact string inclusion match if company profile filter applied
    if (company_name) {
       const matcher = company_name.toLowerCase();
       features = features.filter(f => f.properties.name.toLowerCase().includes(matcher));
    }

    res.json({
      type: "FeatureCollection",
      features
    });
  });
}
