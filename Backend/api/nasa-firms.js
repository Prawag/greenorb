
import NodeCache from 'node-cache';
const cache = new NodeCache({ stdTTL: 3600 }); // 1h cache

const FIRMS_KEY = process.env.NASA_FIRMS_KEY || 'DEMO_KEY';
// DEMO_KEY works for testing (rate-limited to 30 requests/day)
// Real key is free, get from firms.modaps.eosdis.nasa.gov/api/area/

let lastGoodData = null;

export default async function firmsHandler(req, res) {
  const cached = cache.get('firms_data');
  if (cached) {
    return res.json({ ...cached, stale: false });
  }

  try {
    // Fetch global fire data, last 24h, VIIRS 375m resolution
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${FIRMS_KEY}/VIIRS_SNPP_NRT/world/1`;
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });

    if (!response.ok) throw new Error(`FIRMS API: ${response.status}`);

    const csv = await response.text();
    const lines = csv.trim().split('\n').slice(1); // skip header

    const fires = lines
      .map(line => {
        const [lat, lng, brightness, scan, track, acq_date, acq_time,
               satellite, instrument, confidence, version, bright_t31,
               frp, daynight] = line.split(',');
        return {
          lat: parseFloat(lat),
          lng: parseFloat(lng),
          brightness: parseFloat(brightness),
          confidence: confidence?.trim(),
          frp: parseFloat(frp),         // Fire Radiative Power (MW)
          daynight: daynight?.trim(),
          acq_date: acq_date?.trim(),
        };
      })
      .filter(f =>
        !isNaN(f.lat) &&
        !isNaN(f.brightness) &&
        f.brightness > 320 &&           // filter noise
        ['nominal', 'high'].includes(f.confidence?.toLowerCase())
      );

    const result = {
      data: fires,
      cached_at: new Date().toISOString(),
      stale: false,
      source: 'nasa_firms_viirs',
      ttl: 3600,
      total: fires.length,
    };

    lastGoodData = result;
    cache.set('firms_data', result);
    res.json(result);

  } catch (err) {
    if (lastGoodData) {
      return res.json({ 
        ...lastGoodData, 
        stale: true, 
        source: 'NASA FIRMS (cached — source unavailable)', 
        ttl: 600
      });
    }
    res.json({ 
      data: [], 
      cached_at: null, 
      stale: true,
      source: 'NASA FIRMS (unavailable)', 
      ttl: 60, 
      error: err.message 
    });
  }
}
