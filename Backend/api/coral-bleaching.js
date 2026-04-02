import NodeCache from 'node-cache';
import fetch from 'node-fetch';

const cache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 }); // 24h cache

const REEF_ZONES = [
  { name: 'Great Barrier Reef', lat: -17.0, lng: 147.0 },
  { name: 'Florida Keys', lat: 24.5, lng: -81.5 },
  { name: 'Maldives', lat: 4.2, lng: 73.5 },
  { name: 'Hawaii', lat: 20.5, lng: -157.0 },
  { name: 'Caribbean - Puerto Rico', lat: 18.0, lng: -66.5 },
  { name: 'Red Sea', lat: 22.0, lng: 38.5 },
  { name: 'Coral Triangle', lat: -8.5, lng: 124.0 },
  { name: 'Gulf of Oman', lat: 23.5, lng: 58.5 }
];

const FALLBACK_DATA = [
  { lat: -17.0, lng: 147.0, alert_level: 'NO_STRESS', dhw: 0, region_name: 'Great Barrier Reef' },
  { lat: 24.5, lng: -81.5, alert_level: 'NO_STRESS', dhw: 0, region_name: 'Florida Keys' }
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function getAlertLevel(dhw) {
  if (dhw === 0) return 'NO_STRESS';
  if (dhw > 0 && dhw < 4) return 'BLEACHING_WATCH';
  if (dhw >= 4 && dhw < 8) return 'ALERT_LEVEL_1';
  return 'ALERT_LEVEL_2';
}

export default function mountCoralBleaching(sql) {
  return async (req, res) => {
    const cached = cache.get('coral_alerts');
    if (cached) {
      return res.json({
        data: cached,
        cached_at: new Date().toISOString(),
        stale: false,
        source: 'NOAA_ERDDAP_CRW_5KM',
        ttl: 86400
      });
    }

    try {
      const results = [];
      
      // Serialize requests (not parallel) to avoid ERDDAP IP throttling
      for (const zone of REEF_ZONES) {
        try {
          // CRW 5km DHW dimensions: [time][lat][lon]
          const url = `https://coastwatch.pfeg.noaa.gov/erddap/griddap/nesdisVH5kmDhw.json?dhw[(last)][(${zone.lat})][(${zone.lng})]`;
          const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
          
          if (!response.ok) {
            console.warn(`[coral] ERDDAP HTTP ${response.status} for ${zone.name}`);
            continue; 
          }
          
          const json = await response.json();
          // Structure: json.table.rows[0][0] = dhw value
          const dhw = json.table?.rows?.[0]?.[0];
          
          if (dhw !== undefined && dhw !== null) {
              const val = parseFloat(dhw);
              results.push({
                  lat: zone.lat,
                  lng: zone.lng,
                  dhw: val,
                  alert_level: getAlertLevel(val),
                  region_name: zone.name
              });
          }
          
          await sleep(500); // Add 500ms delay between each zone fetch
        } catch (err) {
            console.warn(`[coral] Fetch failed for ${zone.name}:`, err.message);
        }
      }

      if (results.length === 0) throw new Error("All ERDDAP fetches failed");

      cache.set('coral_alerts', results);

      res.json({
        data: results,
        cached_at: new Date().toISOString(),
        stale: false,
        source: 'NOAA_ERDDAP_CRW_5KM',
        ttl: 86400
      });

    } catch (err) {
      console.error('[coral-bleaching] API Error:', err.message);
      
      const staleData = cache.get('coral_alerts') || FALLBACK_DATA;
      
      res.json({
        data: staleData,
        cached_at: new Date().toISOString(),
        stale: true,
        source: 'NOAA_ERDDAP_CRW_5KM_FALLBACK',
        ttl: 0,
        error: err.message
      });
    }
  };
}
