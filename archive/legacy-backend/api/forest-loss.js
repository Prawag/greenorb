const fetch = (...args) => import('node-fetch').then(m => m.default(...args));

export default async (req, res) => {
  try {
    const url = 'https://eonet.gsfc.nasa.gov/api/v3/events/geojson?category=wildfires&status=open&limit=100';
    const response = await fetch(url);
    if (!response.ok) throw new Error(`EONET HTTP ${response.status}`);
    const geojson = await response.json();

    const data = (geojson.features || []).map(f => ({
      id: f.id,
      title: f.properties?.title || 'Wildfire',
      lat: f.geometry?.coordinates?.[1] ?? null,
      lng: f.geometry?.coordinates?.[0] ?? null,
      date: f.properties?.date || null,
      source: f.properties?.sources?.[0]?.url || null,
    })).filter(d => d.lat !== null && d.lng !== null);

    res.json({ data, cached_at: new Date().toISOString(), stale: false, source: 'NASA EONET v3 (wildfires)', ttl: 3600 });
  } catch (err) {
    res.status(500).json({ error: err.message, data: [], stale: true, source: 'NASA EONET v3', ttl: 0 });
  }
};
