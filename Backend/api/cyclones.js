import NodeCache from 'node-cache';
const cache = new NodeCache({ stdTTL: 1800 });
let lastGoodData = null;

export default async function cyclonesHandler(req, res) {
  const cached = cache.get('cyclones');
  if (cached) return res.json({ ...cached, stale: false });

  try {
    const response = await fetch('https://www.gdacs.org/xml/rss_tc_14d.xml', { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`GDACS API: ${response.status}`);
    const xml = await response.text();
    
    // Parse using regex
    const items = xml.split('<item>').slice(1);
    const data = items.map(item => {
      const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/))?.[1] || 'Cyclone';
      const latMatch = item.match(/<geo:lat>([\d.-]+)<\/geo:lat>/);
      const lngMatch = item.match(/<geo:long>([\d.-]+)<\/geo:long>/);
      const severityMatch = item.match(/<gdacs:severity>(.*?)<\/gdacs:severity>/);
      
      if (!latMatch || !lngMatch) return null;

      const severity = severityMatch ? parseFloat(severityMatch[1]) : 1;
      let color = '#c084fc'; // default violet
      if (severity >= 1.5) color = '#a855f7'; // darker
      if (severity >= 2.5) color = '#7e22ce'; // intense

      return {
        id: title,
        name: title,
        title: title,
        lat: parseFloat(latMatch[1]),
        lng: parseFloat(lngMatch[1]),
        severity,
        color,
        type: 'disaster',
        disaster_type: 'cyclone'
      };
    }).filter(d => d !== null);

    const result = { data, cached_at: new Date().toISOString(), stale: false, source: 'GDACS Cyclones', ttl: 1800, total: data.length };
    lastGoodData = result;
    cache.set('cyclones', result);
    res.json(result);
  } catch (err) {
    if (lastGoodData) return res.json({ ...lastGoodData, stale: true, source: 'GDACS Cyclones (cached)', ttl: 600 });
    res.json({ data: [], cached_at: null, stale: true, source: 'GDACS Cyclones (unavailable)', ttl: 60, error: err.message });
  }
}
