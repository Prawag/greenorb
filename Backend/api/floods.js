import NodeCache from 'node-cache';
const cache = new NodeCache({ stdTTL: 1800 });
let lastGoodData = null;

export default async function floodsHandler(req, res) {
  const cached = cache.get('floods');
  if (cached) return res.json({ ...cached, stale: false });

  try {
    const response = await fetch('https://www.gdacs.org/xml/rss_fl_14d.xml', { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`GDACS API: ${response.status}`);
    const xml = await response.text();
    
    // Parse using regex to avoid XML parser quirks
    const items = xml.split('<item>').slice(1);
    const data = items.map(item => {
      const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/))?.[1] || 'Flood';
      const latMatch = item.match(/<geo:lat>([\d.-]+)<\/geo:lat>/);
      const lngMatch = item.match(/<geo:long>([\d.-]+)<\/geo:long>/);
      const severityMatch = item.match(/<gdacs:severity>(.*?)<\/gdacs:severity>/);
      
      if (!latMatch || !lngMatch) return null;

      const severity = severityMatch ? parseFloat(severityMatch[1]) : 1;
      let color = '#60a5fa'; // default blue
      if (severity >= 2) color = '#2563eb'; // deeper blue
      if (severity >= 3) color = '#1e3a8a'; // extreme blue

      return {
        id: title,
        name: title,
        title: title,
        lat: parseFloat(latMatch[1]),
        lng: parseFloat(lngMatch[1]),
        severity,
        color,
        type: 'disaster',
        disaster_type: 'flood'
      };
    }).filter(d => d !== null);

    const result = { data, cached_at: new Date().toISOString(), stale: false, source: 'GDACS Floods', ttl: 1800, total: data.length };
    lastGoodData = result;
    cache.set('floods', result);
    res.json(result);
  } catch (err) {
    if (lastGoodData) return res.json({ ...lastGoodData, stale: true, source: 'GDACS Floods (cached)', ttl: 600 });
    res.json({ data: [], cached_at: null, stale: true, source: 'GDACS Floods (unavailable)', ttl: 60, error: err.message });
  }
}
