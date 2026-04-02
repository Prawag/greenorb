import NodeCache from 'node-cache';
import fetch from 'node-fetch';

const cache = new NodeCache({ stdTTL: 3600, checkperiod: 600 }); // 1 hour

const GRID_ZONES = [
  { zone: 'IN-MH', name: 'Maharashtra (India)', lat: 19.75, lng: 75.71 },
  { zone: 'IN-KA', name: 'Karnataka (India)', lat: 15.31, lng: 75.71 },
  { zone: 'IN-GJ', name: 'Gujarat (India)', lat: 22.25, lng: 71.19 },
  { zone: 'IN-TN', name: 'Tamil Nadu (India)', lat: 11.12, lng: 78.65 },
  { zone: 'IN-UP', name: 'Uttar Pradesh (India)', lat: 26.84, lng: 80.94 },
  { zone: 'GB', name: 'Great Britain', lat: 55.37, lng: -3.43 },
  { zone: 'FR', name: 'France', lat: 46.22, lng: 2.21 },
  { zone: 'DE', name: 'Germany', lat: 51.16, lng: 10.45 },
  { zone: 'ES', name: 'Spain', lat: 40.46, lng: -3.74 },
  { zone: 'IT-NO', name: 'Italy (North)', lat: 45.46, lng: 9.19 },
  { zone: 'NL', name: 'Netherlands', lat: 52.13, lng: 5.29 },
  { zone: 'SE-SE1', name: 'Sweden (SE1)', lat: 67.85, lng: 20.22 },
  { zone: 'US-CAL-CISO', name: 'California (CAISO)', lat: 36.77, lng: -119.41 },
  { zone: 'US-TEX-ERCO', name: 'Texas (ERCOT)', lat: 31.96, lng: -99.90 },
  { zone: 'US-FLA-FPL', name: 'Florida (FPL)', lat: 27.66, lng: -81.51 },
  { zone: 'AU-NSW', name: 'New South Wales (Aus)', lat: -31.25, lng: 146.92 },
  { zone: 'AU-SA', name: 'South Australia', lat: -30.00, lng: 136.20 },
  { zone: 'JP-TK', name: 'Tokyo (Japan)', lat: 35.67, lng: 139.65 }
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export default async function (req, res) {
    const cached = cache.get('grid_carbon_live');
    if (cached) {
      return res.json({
        data: cached,
        cached_at: new Date().toISOString(),
        stale: false,
        source: 'ELECTRICITY_MAPS_GRID_AWARE_FREE',
        ttl: 3600
      });
    }

    try {
      const results = [];
      const timestamp = new Date().toISOString();

      for (const zoneInfo of GRID_ZONES) {
        try {
          const res = await fetch(`https://api-access.electricitymaps.com/free-tier/carbon-intensity/relative?zone=${zoneInfo.zone}`, {
              signal: AbortSignal.timeout(5000)
          });
          
          if (!res.ok) {
              console.warn(`[grid] EM HTTP ${res.status} for ${zoneInfo.zone}`);
              continue; // skip silently
          }

          const relativeData = await res.json();
          let synthetic_carbon_intensity = 400; // default moderate
          if (relativeData.level === 'low') synthetic_carbon_intensity = 150;
          if (relativeData.level === 'high') synthetic_carbon_intensity = 700;

          results.push({
            zone: zoneInfo.zone,
            name: zoneInfo.name,
            lat: zoneInfo.lat,
            lng: zoneInfo.lng,
            carbon_intensity: synthetic_carbon_intensity,
            fossil_free_pct: null,
            renewable_pct: null,
            datetime: timestamp
          });

          await sleep(100);

        } catch (e) {
            console.warn(`[grid] Fetch failed for ${zoneInfo.zone}: ${e.message}`);
        }
      }

      cache.set('grid_carbon_live', results);

      res.json({
        data: results,
        cached_at: new Date().toISOString(),
        stale: false,
        source: 'ELECTRICITY_MAPS_GRID_AWARE_FREE',
        ttl: 3600
      });

    } catch (err) {
      console.error('[grid-carbon] API Error:', err.message);
      res.json({
        data: cache.get('grid_carbon_live') || [],
        cached_at: new Date().toISOString(),
        stale: true,
        source: 'ELECTRICITY_MAPS_GRID_AWARE_FREE',
        ttl: 0,
        error: err.message
      });
    }
}
