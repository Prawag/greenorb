import fetch from 'node-fetch';
import cron from 'node-cron';

/**
 * Fetches industrial facilities from Overpass API for a given bounding box.
 */
export async function indexOsmBbox(sql, lat, lng, radius_km) {
  const radius_m = parseFloat(radius_km) * 1000;
  const bbox_hash = `osm_${lat.toFixed(2)}_${lng.toFixed(2)}_${radius_m}`;

  console.log(`[OSM Indexer] Fetching data for ${bbox_hash}...`);

  const query = `
    [out:json][timeout:60];
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

  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`
    });

    if (!response.ok) throw new Error(`Overpass error: ${response.status}`);
    const data = await response.json();

    const elements = data.elements || [];
    console.log(`[OSM Indexer] Found ${elements.length} elements for ${bbox_hash}`);

    // Insert into facilities table
    for (const el of elements) {
      const elLat = el.type === 'node' ? el.lat : el.center?.lat;
      const elLng = el.type === 'node' ? el.lon : el.center?.lon;
      const tags = el.tags || {};
      const name = tags.name || tags.operator || "Unknown Industrial Site";
      
      if (!elLat || !elLng) continue;

      await sql`
        INSERT INTO facilities (company_name, facility_name, facility_type, lat, lng, source, bbox_hash, source_tier)
        VALUES ('OSM Industrial', ${name}, ${tags.landuse || 'industrial'}, ${elLat}, ${elLng}, 'osm', ${bbox_hash}, 'BRONZE')
        ON CONFLICT (company_name, facility_name) DO UPDATE SET
            bbox_hash = EXCLUDED.bbox_hash,
            source_tier = 'BRONZE'
      `.catch(e => console.error(`[OSM Indexer] DB error for ${name}:`, e.message));
    }

    console.log(`[OSM Indexer] Finished indexing ${bbox_hash}`);
    return true;
  } catch (err) {
    console.error(`[OSM Indexer] Failed indexing ${bbox_hash}:`, err.message);
    return false;
  }
}

/**
 * Monthly refresh for key industrial zones.
 */
export function startOsmCron(sql) {
  cron.schedule('0 3 1 * *', async () => {
    console.log('[OSM Indexer] Monthly OSM refresh triggered');
    
    // Example coordinates for key industrial zones
    const zones = [
        { lat: 22.5726, lng: 88.3639, r: 20 }, // Kolkata
        { lat: 19.0760, lng: 72.8777, r: 20 }, // Mumbai
        { lat: 28.6139, lng: 77.2090, r: 20 }, // Delhi/NCR
        { lat: 31.2304, lng: 121.4737, r: 30 }, // Shanghai
        { lat: 35.6762, lng: 139.6503, r: 30 }, // Tokyo
        { lat: 51.5074, lng: -0.1278, r: 20 },  // London
        { lat: 40.7128, lng: -74.0060, r: 20 }, // New York
    ];

    for (const zone of zones) {
        await indexOsmBbox(sql, zone.lat, zone.lng, zone.r);
        // Wait 10s between zones to avoid Overpass rate limiting
        await new Promise(r => setTimeout(r, 10000));
    }
    console.log('[OSM Indexer] Monthly OSM refresh completed');
  });
}
