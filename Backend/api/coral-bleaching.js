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

// Comprehensive fallback data so the UI always has something to render
const FALLBACK_DATA = [
  { lat: -17.0, lng: 147.0, alert_level: 'NO_STRESS', dhw: 0, region_name: 'Great Barrier Reef' },
  { lat: 24.5, lng: -81.5, alert_level: 'NO_STRESS', dhw: 0, region_name: 'Florida Keys' },
  { lat: 4.2, lng: 73.5, alert_level: 'NO_STRESS', dhw: 0, region_name: 'Maldives' },
  { lat: 20.5, lng: -157.0, alert_level: 'NO_STRESS', dhw: 0, region_name: 'Hawaii' },
  { lat: 18.0, lng: -66.5, alert_level: 'NO_STRESS', dhw: 0, region_name: 'Caribbean - Puerto Rico' },
  { lat: 22.0, lng: 38.5, alert_level: 'NO_STRESS', dhw: 0, region_name: 'Red Sea' },
  { lat: -8.5, lng: 124.0, alert_level: 'NO_STRESS', dhw: 0, region_name: 'Coral Triangle' },
  { lat: 23.5, lng: 58.5, alert_level: 'NO_STRESS', dhw: 0, region_name: 'Gulf of Oman' }
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function getAlertLevel(dhw) {
  if (dhw === 0) return 'NO_STRESS';
  if (dhw > 0 && dhw < 4) return 'BLEACHING_WATCH';
  if (dhw >= 4 && dhw < 8) return 'ALERT_LEVEL_1';
  return 'ALERT_LEVEL_2';
}

/**
 * Fetch a single reef zone with retry logic.
 * Retries once on timeout/failure before giving up on that zone.
 */
async function fetchZoneWithRetry(zone, maxRetries = 1) {
  const url = `https://coastwatch.pfeg.noaa.gov/erddap/griddap/nesdisVH5kmDhw.json?dhw[(last)][(${zone.lat})][(${zone.lng})]`;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) }); // 30s timeout
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const json = await response.json();
      const dhw = json.table?.rows?.[0]?.[0];
      
      if (dhw !== undefined && dhw !== null) {
        const val = parseFloat(dhw);
        return {
          lat: zone.lat,
          lng: zone.lng,
          dhw: val,
          alert_level: getAlertLevel(val),
          region_name: zone.name
        };
      }
      return null;
    } catch (err) {
      if (attempt < maxRetries) {
        // Wait before retry (exponential backoff: 2s, 4s, ...)
        await sleep(2000 * (attempt + 1));
        continue;
      }
      console.warn(`[coral] Fetch failed for ${zone.name} after ${maxRetries + 1} attempts: ${err.message}`);
      return null;
    }
  }
  return null;
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
      
      // Fetch zones in parallel batches of 3 to balance speed vs throttling
      for (let i = 0; i < REEF_ZONES.length; i += 3) {
        const batch = REEF_ZONES.slice(i, i + 3);
        const batchResults = await Promise.all(
          batch.map(zone => fetchZoneWithRetry(zone))
        );
        
        for (const result of batchResults) {
          if (result) results.push(result);
        }
        
        // Small delay between batches to avoid throttling
        if (i + 3 < REEF_ZONES.length) {
          await sleep(1000);
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
