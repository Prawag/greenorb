
import NodeCache from 'node-cache';
const cache = new NodeCache({ stdTTL: 900 }); // 15min

// Static zone-to-coordinates mapping for major grids
// (Electricity Maps uses zone codes like "IN-NO", "DE", "US-CAL-CISO")
const GRID_ZONES = [
  { zone: 'IN-NO', name: 'India North Grid', lat: 28.7, lng: 77.1 },
  { zone: 'IN-SO', name: 'India South Grid', lat: 13.1, lng: 80.3 },
  { zone: 'IN-WE', name: 'India West Grid',  lat: 19.1, lng: 72.9 },
  { zone: 'IN-EA', name: 'India East Grid',  lat: 22.6, lng: 88.4 },
  { zone: 'DE',    name: 'Germany',          lat: 51.2, lng: 10.4 },
  { zone: 'GB',    name: 'Great Britain',    lat: 52.5, lng: -1.8 },
  { zone: 'US-CAL-CISO', name: 'California', lat: 36.7, lng: -119.4 },
  { zone: 'SG',    name: 'Singapore',        lat: 1.35, lng: 103.8 },
  { zone: 'JP-TK', name: 'Japan Tokyo',      lat: 35.7, lng: 139.7 },
  { zone: 'CN-SO', name: 'China South',      lat: 23.1, lng: 113.3 },
  { zone: 'AE',    name: 'UAE',              lat: 24.5, lng: 54.4 },
  { zone: 'BR-CS', name: 'Brazil Central',   lat: -15.8, lng: -47.9 },
];

export default async function gridHandler(req, res) {
  const cached = cache.get('grid_data');
  if (cached) return res.json({ ...cached, stale: false });

  const key = process.env.ELECTRICITY_MAPS_KEY;
  if (!key) {
    return res.json({
      data: [], cached_at: null, stale: true,
      source: 'electricity_maps', ttl: 900,
      error: 'ELECTRICITY_MAPS_KEY not set'
    });
  }

  try {
    const results = await Promise.allSettled(
      GRID_ZONES.map(async zone => {
        const r = await fetch(
          `https://api.electricitymap.org/v3/carbon-intensity/latest?zone=${zone.zone}`,
          { headers: { 'auth-token': key }, signal: AbortSignal.timeout(8000) }
        );
        const json = await r.json();
        return {
          ...zone,
          carbon_intensity: json.carbonIntensity,  // gCO2eq/kWh
          fossil_free_pct: json.fossilFreePercentage,
          renewable_pct:   json.renewablePercentage,
          datetime:        json.datetime,
        };
      })
    );

    const data = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value)
      .filter(d => d.carbon_intensity != null);

    const result = {
      data,
      cached_at: new Date().toISOString(),
      stale: false, source: 'electricity_maps', ttl: 900,
    };
    cache.set('grid_data', result);
    res.json(result);

  } catch (err) {
    const stale = cache.get('grid_data');
    if (stale) return res.json({ ...stale, stale: true });
    res.json({ data: [], stale: true, source: 'electricity_maps',
               ttl: 900, error: err.message });
  }
}
