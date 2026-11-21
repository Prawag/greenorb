import NodeCache from 'node-cache';
import fetch from 'node-fetch';

const cache = new NodeCache({ stdTTL: 10800, checkperiod: 1800 }); // 3 hours

const LOCATIONS = [
  // Vulnerable industrial basins
  { name: 'Amazon Basin', lat: -3.4, lng: -60.0 },
  { name: 'Yangtze River', lat: 30.6, lng: 114.3 },
  { name: 'Ganges Delta', lat: 22.5, lng: 89.2 },
  { name: 'Mississippi', lat: 30.0, lng: -90.1 },
  { name: 'Congo Basin', lat: -4.3, lng: 15.3 },
  { name: 'Niger Delta', lat: 5.2, lng: 6.8 },
  { name: 'Murray-Darling', lat: -34.0, lng: 142.0 },
  { name: 'Indus Plain', lat: 29.4, lng: 71.7 },
  { name: 'Mekong Delta', lat: 10.2, lng: 105.5 },
  { name: 'La Plata Basin', lat: -32.5, lng: -60.7 },
  // Major industrial cities
  { name: 'Mumbai', lat: 19.1, lng: 72.9 },
  { name: 'Shanghai', lat: 31.2, lng: 121.5 },
  { name: 'Jakarta', lat: -6.2, lng: 106.8 },
  { name: 'Dhaka', lat: 23.7, lng: 90.4 },
  { name: 'Lagos', lat: 6.5, lng: 3.4 },
  { name: 'São Paulo', lat: -23.5, lng: -46.6 },
  { name: 'Houston', lat: 29.8, lng: -95.4 },
  { name: 'Rotterdam', lat: 51.9, lng: 4.5 },
  { name: 'Dubai', lat: 25.2, lng: 55.3 },
  { name: 'Singapore', lat: 1.35, lng: 103.8 },
  { name: 'Delhi NCR', lat: 28.6, lng: 77.2 },
  { name: 'Jamshedpur', lat: 22.8, lng: 86.2 },
  { name: 'Rourkela', lat: 22.2, lng: 84.8 },
  { name: 'Jharsuguda', lat: 21.9, lng: 84.1 },
  { name: 'Angul', lat: 20.8, lng: 85.1 }
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function getIntensity(mm) {
  if (mm === 0) return 'NONE';
  if (mm > 0 && mm <= 2.5) return 'LIGHT';
  if (mm > 2.5 && mm <= 7.6) return 'MODERATE';
  if (mm > 7.6 && mm <= 50) return 'HEAVY';
  return 'VIOLENT';
}

export default async function (req, res) {
    const cached = cache.get('imerg_data');
    if (cached) {
      return res.json({
        data: cached,
        cached_at: new Date().toISOString(),
        stale: false,
        source: 'OPEN_METEO_ECMWF_9KM',
        ttl: 10800
      });
    }

    try {
      const results = [];
      
      for (const loc of LOCATIONS) {
        try {
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lng}&current=precipitation,rain&timezone=auto`;
          const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
          
          if (!response.ok) {
             console.warn(`[gpm] Open-Meteo HTTP ${response.status} for ${loc.name}`);
             continue;
          }
          
          const json = await response.json();
          const mm = parseFloat(json.current?.precipitation || 0);

          results.push({
             lat: loc.lat,
             lng: loc.lng,
             precipitation_mm: mm,
             intensity: getIntensity(mm),
             region_name: loc.name
          });

          await sleep(200); // rate logic
        } catch (e) {
          console.warn(`[gpm] Open-Meteo fetch failed for ${loc.name}: ${e.message}`);
        }
      }

      cache.set('imerg_data', results);

      res.json({
        data: results,
        cached_at: new Date().toISOString(),
        stale: false,
        source: 'OPEN_METEO_ECMWF_9KM',
        ttl: 10800
      });

    } catch (err) {
      console.error('[gpm-imerg] API Error:', err.message);
      
      res.json({
        data: cache.get('imerg_data') || [],
        cached_at: new Date().toISOString(),
        stale: true,
        source: 'OPEN_METEO_ECMWF_9KM',
        ttl: 0,
        error: err.message
      });
    }
}
