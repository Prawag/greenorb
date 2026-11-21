
import NodeCache from 'node-cache';
const cache = new NodeCache({ stdTTL: 3600 }); // 1h

// Major industrial city coordinates to sample from
const SAMPLE_LOCATIONS = [
  { name: 'Delhi NCR',     lat: 28.6, lng: 77.2 },
  { name: 'Mumbai',        lat: 19.1, lng: 72.9 },
  { name: 'Ahmedabad',     lat: 23.0, lng: 72.6 },
  { name: 'Jamshedpur',    lat: 22.8, lng: 86.2 },  // steel belt
  { name: 'Angul',         lat: 20.8, lng: 85.1 },  // aluminium
  { name: 'Rourkela',      lat: 22.2, lng: 84.8 },  // steel
  { name: 'Shanghai',      lat: 31.2, lng: 121.5 },
  { name: 'Dubai',         lat: 25.2, lng: 55.3 },
  { name: 'Singapore',     lat: 1.35, lng: 103.8 },
  { name: 'São Paulo',     lat: -23.5, lng: -46.6 },
];

const WHO_PM25_THRESHOLD = 15;  // µg/m³ 24h mean (WHO 2021 guideline)

export default async function airQualityHandler(req, res) {
  const cached = cache.get('aq_data');
  if (cached) return res.json({ ...cached, stale: false });

  try {
    const results = await Promise.allSettled(
      SAMPLE_LOCATIONS.map(async loc => {
        const url = `https://api.openaq.org/v3/locations?` +
          `parameters_id=2` +
          `&coordinates=${loc.lat},${loc.lng}` +
          `&radius=30000&limit=5` +
          `&order_by=lastUpdated&sort_order=desc`;
          
        const r = await fetch(url, {
          headers: { 'X-API-Key': process.env.OPENAQ_API_KEY || '' },
          signal: AbortSignal.timeout(10000)
        });
        if (!r.ok) return null;
        
        const json = await r.json();
        const pm25_readings = (json.results || [])
          .flatMap(s => s.sensors || [])
          .filter(s => (s.parameter?.name === 'pm25' || s.parameter?.id === 2) && 
                       s.latest?.value != null)
          .map(s => s.latest.value);

        if (pm25_readings.length === 0) return null;
        
        const avg_pm25 = pm25_readings.reduce((a, b) => a + b, 0) / pm25_readings.length;

        return {
          name:     loc.name,
          lat:      loc.lat,
          lng:      loc.lng,
          avg_pm25: Math.round(avg_pm25 * 10) / 10,
          exceeds_who: avg_pm25 > WHO_PM25_THRESHOLD,
          sensor_count: pm25_readings.length,
          last_updated: new Date().toISOString(),
        };
      })
    );

    const data = results
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value)
      .filter(d => d.avg_pm25 !== null);

    const result = {
      data,
      cached_at: new Date().toISOString(),
      stale: false, source: 'openaq_v3', ttl: 3600,
      who_threshold: WHO_PM25_THRESHOLD,
    };
    cache.set('aq_data', result);
    res.json(result);

  } catch (err) {
    const stale = cache.get('aq_data');
    if (stale) return res.json({ ...stale, stale: true });
    res.json({ data: [], stale: true, source: 'openaq_v3',
               ttl: 3600, error: err.message });
  }
}
