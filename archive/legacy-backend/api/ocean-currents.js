const fetch = (...args) => import('node-fetch').then(m => m.default(...args));

export default async (req, res) => {
  try {
    const liveRes = await fetch(
      'https://coastwatch.pfeg.noaa.gov/erddap/griddap/jplOscarv2.json?' +
      'u[(last)][(0.0)][(0.0):(5.0):(360.0)][(-80.0):(5.0):(80.0)],' +
      'v[(last)][(0.0)][(0.0):(5.0):(360.0)][(-80.0):(5.0):(80.0)]',
      { signal: AbortSignal.timeout(15000) }
    );
    if (!liveRes.ok) throw new Error(`ERDDAP HTTP ${liveRes.status}`);
    const json = await liveRes.json();
    const rows = json.table?.rows || [];
    const data = rows.map(row => ({
      lat: parseFloat(row[3]),
      lng: parseFloat(row[2]) > 180 ? parseFloat(row[2]) - 360 : parseFloat(row[2]),
      speed_ms: Math.sqrt(Math.pow(parseFloat(row[4]) || 0, 2) + Math.pow(parseFloat(row[5]) || 0, 2)),
      direction_deg: Math.atan2(parseFloat(row[5]) || 0, parseFloat(row[4]) || 0) * 180 / Math.PI
    })).filter(d => !isNaN(d.lat) && !isNaN(d.lng) && d.speed_ms > 0.05);

    res.json({ data, cached_at: new Date().toISOString(), stale: false, source: 'NOAA ERDDAP OSCAR (keyless)', ttl: 86400 });
  } catch (err) {
    res.status(500).json({ error: err.message, data: [], stale: true, source: 'NOAA ERDDAP', ttl: 0 });
  }
};
