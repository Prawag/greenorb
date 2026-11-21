import db from '../db.js';

export default async (req, res) => {
  try {
    const { companies } = req.query;
    // companies = comma-separated list of company names
    // e.g. ?companies=Tata Steel,Reliance Industries,Infosys

    if (!companies) {
      // Return top 10 companies by ESG score for default view
      const result = await db.query(`
        SELECT c.name, c.sector, c.co2, c.s1, c.s2, c.s3,
               a.score, a.e_score, a.s_score, a.g_score, a.trend
        FROM companies c
        LEFT JOIN analysis a ON a.company = c.name
        WHERE c.co2 IS NOT NULL
        ORDER BY a.score DESC NULLS LAST
        LIMIT 10
      `);
      return res.json({
        data: result.rows,
        cached_at: new Date().toISOString(),
        stale: false, source: 'Neon DB', ttl: 300
      });
    }

    const names = companies.split(',').map(n => n.trim()).slice(0, 5);
    const placeholders = names.map((_, i) => `$${i + 1}`).join(',');
    const result = await db.query(`
      SELECT c.name, c.sector, c.co2, c.s1, c.s2, c.s3,
             a.score, a.e_score, a.s_score, a.g_score, a.trend
      FROM companies c
      LEFT JOIN analysis a ON a.company = c.name
      WHERE c.name IN (${placeholders})
    `, names);

    res.json({
      data: result.rows,
      cached_at: new Date().toISOString(),
      stale: false, source: 'Neon DB', ttl: 300
    });
  } catch (err) {
    console.error('[api/compare] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
