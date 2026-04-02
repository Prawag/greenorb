import db from '../db.js';

export default async (req, res) => {
  try {
    const { city } = req.query;
    if (!city) return res.status(400).json({ error: 'city param required' });

    // Step 1: Nominatim boundary
    const nominatimUrl =
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)},+India&format=jsonv2&polygon_geojson=1`;
    const nomRes = await fetch(nominatimUrl, {
      headers: { 'User-Agent': 'GreenOrb-ESG-Platform/1.0 (contact@greenorb.in)' }
    });
    const nomData = await nomRes.json();
    if (!nomData || nomData.length === 0)
      return res.status(404).json({ error: `City not found: ${city}` });

    const boundary_geojson = nomData[0].geojson;

    // Step 2: AQI from data.gov.in
    const API_KEY = process.env.DATA_GOV_API_KEY || 'DEMO_KEY';
    const resourceId = '3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69';
    const aqiUrl =
      `https://api.data.gov.in/resource/${resourceId}?api-key=${API_KEY}&format=json&filters[city]=${encodeURIComponent(city)}&limit=50`;

    let aqi = null, pm2_5 = null, last_updated = null;
    try {
      const aqiRes  = await fetch(aqiUrl);
      const aqiData = await aqiRes.json();
      if (aqiData?.records?.length > 0) {
        const records = aqiData.records;
        last_updated  = records[0]?.last_update || null;
        const validAqis = records.map(r => parseFloat(r.pollutant_avg)).filter(v => !isNaN(v));
        if (validAqis.length) aqi = Math.max(...validAqis);
        const pm25rec = records.find(r => r.pollutant_id === 'PM2.5');
        if (pm25rec) pm2_5 = parseFloat(pm25rec.pollutant_avg);
      }
    } catch (aqiErr) {
      console.warn('[city-sdk] AQI fetch failed:', aqiErr.message);
    }

    // Save to DB
    await db.query(
      `INSERT INTO city_metrics (city_name, state_name, boundary_geojson, aqi_level, pm2_5, last_updated)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT DO NOTHING`,
      [city, nomData[0].display_name?.split(',').slice(-2, -1)[0]?.trim() || '',
       JSON.stringify(boundary_geojson), aqi, pm2_5]
    );

    res.json({
      data: { city_name: city, boundary_geojson, aqi, pm2_5, last_updated },
      cached_at: new Date().toISOString(), stale: false, source: 'Nominatim + CPCB', ttl: 3600
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
