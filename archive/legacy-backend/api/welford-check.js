import { checkAnomaly } from '../lib/welford.js';

export default function mountWelfordCheck(sql) {
  return async (req, res) => {
    try {
      const { company_id, metric_name, value } = req.body;
      if (!company_id || !metric_name || value === undefined) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      const parsedValue = parseFloat(value);
      if (isNaN(parsedValue)) {
        return res.status(400).json({ error: 'Value must be numeric' });
      }

      const result = await checkAnomaly(sql, company_id, metric_name, parsedValue);

      res.json({
        data: result,
        cached_at: new Date().toISOString(),
        stale: false,
        source: 'welford_engine',
        ttl: 0
      });
    } catch (err) {
      console.error('[Welford API] Error:', err);
      res.status(500).json({ error: err.message });
    }
  };
}
