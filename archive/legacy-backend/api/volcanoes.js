import NodeCache from 'node-cache';
import { parseStringPromise, processors } from 'xml2js';

const cache = new NodeCache({ stdTTL: 1800 });
let lastGoodData = null;

export default async function volcanoesHandler(req, res) {
  const cached = cache.get('volcanoes');
  if (cached) return res.json({ ...cached, stale: false });

  try {
    const rssRes = await fetch('https://volcano.si.edu/news/WeeklyVolcanoRSS.xml', { 
      signal: AbortSignal.timeout(10000) 
    });
    const xml = await rssRes.text();
    const sanitizedXml = xml.replace(/&(?!(amp|lt|gt|quot|apos);)/g, '&amp;');
    
    let items = [];
    try {
      const parsed = await parseStringPromise(sanitizedXml, {
        tagNameProcessors: [processors.stripPrefix],
        explicitArray: false
      });
      const raw = parsed?.rss?.channel?.item;
      items = Array.isArray(raw) ? raw : raw ? [raw] : [];
    } catch (parseErr) {
      items = xml.split('<item>').slice(1).map(b => ({
        title: [b.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i)?.[1]],
        point: [b.match(/<georss:point>(.*?)<\/georss:point>/i)?.[1] || b.match(/<georss:Point>(.*?)<\/georss:Point>/i)?.[1]]
      }));
    }

    const data = items.map(p => {
      const title = (Array.isArray(p.title) ? p.title[0] : p.title) || 'Volcano';
      const point = (Array.isArray(p.point) ? p.point[0] : p.point) || p['georss:point'] || p['georss:Point'];
      
      if (!point) return null;
      const pointStr = typeof point === 'string' ? point : point._;
      if (!pointStr) return null;

      const [lat, lng] = pointStr.trim().split(/\s+/).map(parseFloat);
      if (isNaN(lat) || isNaN(lng)) return null;

      return {
        id: title,
        name: title,
        title,
        lat,
        lng,
        severity: 2,
        color: '#ef4444',
        type: 'disaster',
        disaster_type: 'volcano'
      };
    }).filter(d => d !== null);

    const result = { data, cached_at: new Date().toISOString(), stale: false, source: 'Smithsonian GVP', ttl: 1800, total: data.length };
    lastGoodData = result;
    cache.set('volcanoes', result);
    res.json(result);
  } catch (err) {
    res.json({ data: lastGoodData?.data || [], stale: true, source: 'Smithsonian GVP (Error)' });
  }
}
