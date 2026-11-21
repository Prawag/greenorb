import NodeCache from 'node-cache';
const cache = new NodeCache({ stdTTL: 1800 });
let lastGoodData = null;

export default async function eonetHandler(req, res) {
  const cached = cache.get('eonet');
  if (cached) return res.json({ ...cached, stale: false });

  try {
    const response = await fetch('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30', { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`NASA EONET API: ${response.status}`);
    const json = await response.json();
    
    const data = json.events.map(event => {
      const cat = event.categories[0]?.id;
      let color = '#a855f7'; // default purple
      if (cat === 'severeStorms') color = '#ec4899'; // pink
      else if (cat === 'volcanoes') color = '#ef4444'; // red
      else if (cat === 'floods') color = '#3b82f6'; // blue
      else if (cat === 'wildfires') color = '#f97316'; // orange

      const geom = event.geometry[event.geometry.length - 1]; // latest position
      if (!geom || geom.type !== 'Point') return null;

      return {
        id: event.id,
        name: event.title,
        title: event.title,
        category: cat,
        lat: geom.coordinates[1],
        lng: geom.coordinates[0],
        date: geom.date,
        color,
        type: 'disaster',
        disaster_type: cat
      };
    }).filter(d => d !== null);

    const result = { data, cached_at: new Date().toISOString(), stale: false, source: 'NASA EONET', ttl: 1800, total: data.length };
    lastGoodData = result;
    cache.set('eonet', result);
    res.json(result);
  } catch (err) {
    if (lastGoodData) return res.json({ ...lastGoodData, stale: true, source: 'NASA EONET (cached)', ttl: 600 });
    res.json({ data: [], cached_at: null, stale: true, source: 'NASA EONET (unavailable)', ttl: 60, error: err.message });
  }
}
