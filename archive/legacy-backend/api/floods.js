import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 3600 });

export default async function floodsHandler(req, res) {
  const cached = cache.get('floods');
  if (cached) return res.json({ ...cached, stale: false });

  try {
    const today = new Date().toISOString().split('T')[0];
    const from = new Date();
    from.setDate(from.getDate() - 30);
    const fromStr = from.toISOString().split('T')[0];
    
    const url = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=FL' +
      '&fromdate=' + fromStr + '&todate=' + today + '&pagenumber=1';

    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`GDACS API: ${response.status}`);
    
    const json = await response.json();
    const features = json.features || [];

    const data = features.map(f => ({
      id: f.properties.eventid,
      name: f.properties.name,
      title: f.properties.name,
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
      severity: f.properties.alertlevel,
      country: f.properties.country,
      disaster_type: 'flood',
      source: 'GDACS REST API v2'
    }));

    const result = { 
      data, 
      cached_at: new Date().toISOString(), 
      stale: false, 
      source: 'GDACS REST API v2', 
      ttl: 3600, 
      total: data.length 
    };
    
    cache.set('floods', result);
    res.json(result);
  } catch (err) {
    console.error('[FLOODS] Error:', err.message);
    res.json({ 
      data: [], 
      stale: true, 
      source: 'GDACS REST API v2 (Error)',
      error: err.message
    });
  }
}
