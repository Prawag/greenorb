import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 3600 });

export default function mountFishingWatch(sql) {
  return async (req, res) => {
    const cached = cache.get('fishing-watch');
    if (cached) return res.json(cached);

    try {
      const apiKey = process.env.GFW_API_KEY;
      if (!apiKey) {
        return res.json({
          data: [],
          cached_at: new Date().toISOString(),
          stale: true,
          source: 'Global Fishing Watch',
          ttl: 3600,
          error: 'GFW_API_KEY not set. Get free key at ' +
                 'globalfishingwatch.org/our-apis',
        });
      }

      const liveRes = await fetch(
        'https://gateway.api.globalfishingwatch.org/v3/events?' +
        'datasets=public-global-encounters-events' +
        '&limit=100',
        {
          method: 'GET',
          headers: { 
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!liveRes.ok) throw new Error(`GFW API: ${liveRes.status}`);
      
      const json = await liveRes.json();
      const entries = json.entries || json.data || [];
      
      const data = entries.map(e => ({
        lat: e.lat || (e.position ? e.position.lat : null),
        lng: e.lon || (e.position ? e.position.lon : null),
        vessel_id: e.vessel?.id || 'Unknown',
        flag_country: e.vessel?.flag || 'Unknown',
        fishing_hours: e.duration || 0,
        is_suspected_illegal: e.event_type === 'loitering' || e.event_type === 'gap'
      })).filter(d => d.lat !== null && d.lng !== null);

      const payload = {
        data,
        cached_at: new Date().toISOString(),
        stale: false,
        source: 'Global Fishing Watch (v3)',
        ttl: 3600
      };
      cache.set('fishing-watch', payload);
      res.json(payload);
    } catch (error) {
      res.json({
        data: [],
        cached_at: new Date().toISOString(),
        stale: true,
        source: 'Global Fishing Watch',
        ttl: 3600,
        error: error.message,
      });
    }
  };
}
