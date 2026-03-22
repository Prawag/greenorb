import NodeCache from 'node-cache';
const cache = new NodeCache({ stdTTL: 1800 });
let lastGoodData = null;

export default async function volcanoesHandler(req, res) {
  const cached = cache.get('volcanoes');
  if (cached) return res.json({ ...cached, stale: false });

  try {
    const response = await fetch('https://volcano.si.edu/news/WeeklyVolcanoRSS.xml', { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Smithsonian GVP API: ${response.status}`);
    const xml = await response.text();
    
    // Parse using regex
    const items = xml.split('<item>').slice(1);
    const data = items.map(item => {
      const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/))?.[1] || 'Volcano';
      const geoPointMatch = item.match(/<georss:Point>([\d.-]+)\s+([\d.-]+)<\/georss:Point>/);
      
      if (!geoPointMatch) return null;

      const color = '#ef4444'; // Red for volcanoes

      return {
        id: title,
        name: title,
        title: title,
        lat: parseFloat(geoPointMatch[1]),
        lng: parseFloat(geoPointMatch[2]),
        severity: 2, // GVP weekly means active/elevated
        color,
        type: 'disaster',
        disaster_type: 'volcano'
      };
    }).filter(d => d !== null);

    const result = { data, cached_at: new Date().toISOString(), stale: false, source: 'Smithsonian GVP', ttl: 1800, total: data.length };
    lastGoodData = result;
    cache.set('volcanoes', result);
    res.json(result);
  } catch (err) {
    if (lastGoodData) return res.json({ ...lastGoodData, stale: true, source: 'Smithsonian GVP (cached)', ttl: 600 });
    res.json({ data: [], cached_at: null, stale: true, source: 'Smithsonian GVP (unavailable)', ttl: 60, error: err.message });
  }
}
