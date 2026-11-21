import NodeCache from 'node-cache';
const cache = new NodeCache({ stdTTL: 300 }); // 5m cache
let lastGoodData = null;

export default async function earthquakesHandler(req, res) {
  const cached = cache.get('earthquakes_data');
  if (cached) {
    return res.json({ ...cached, stale: false });
  }

  try {
    // Fetch global earthquake data, last 2.5 days, M2.5+
    const url = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!response.ok) throw new Error(`USGS API: ${response.status}`);

    const geojson = await response.json();

    const data = geojson.features.map(f => {
      const mag = f.properties.mag;
      let color = '#fcd34d'; // yellow
      if (mag >= 7.0) color = '#ef4444'; // red
      else if (mag >= 6.0) color = '#f97316'; // orange
      else if (mag >= 5.0) color = '#fbbf24'; // amber

      return {
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        mag: mag,
        place: f.properties.place,
        depth: f.geometry.coordinates[2],
        time: f.properties.time,
        color: color,
        type: 'earthquake'
      };
    });

    const result = {
      data,
      cached_at: new Date().toISOString(),
      stale: false,
      source: 'USGS Earthquake Hazards',
      ttl: 300,
      total: data.length,
    };

    lastGoodData = result;
    cache.set('earthquakes_data', result);
    res.json(result);

  } catch (err) {
    if (lastGoodData) {
      return res.json({ 
        ...lastGoodData, 
        stale: true, 
        source: 'USGS Earthquake Hazards (cached — source unavailable)', 
        ttl: 600
      });
    }
    res.json({ 
      data: [], 
      cached_at: null, 
      stale: true,
      source: 'USGS Earthquake Hazards (unavailable)', 
      ttl: 60, 
      error: err.message 
    });
  }
}
