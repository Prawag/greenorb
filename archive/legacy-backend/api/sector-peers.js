export default function mountSectorPeers(app, sql) {
  // GET similar companies in same sector/region for radar chart comparison
  app.get('/api/company/:name/peers', async (req, res) => {
    const { name } = req.params;
    const limit = parseInt(req.query.limit) || 5;

    try {
      // 1. Get base company details
      const companyResult = await sql`
        SELECT sector, country, co2, s1 
        FROM companies WHERE name = ${name}
      `;

      if (companyResult.length === 0) {
        return res.status(404).json({ error: "Company not found" });
      }

      const { sector, country, co2, s1 } = companyResult[0];
      const baselineCo2 = parseFloat(co2 || s1 || 0);

      // 2. Query for similar companies
      // Search first in same sector + same country
      let peers = await sql`
        SELECT name, sector, country, co2, s1, s2, s3, report_year, data_tier 
        FROM companies 
        WHERE sector = ${sector} 
        AND country = ${country}
        AND name != ${name}
        ORDER BY ABS(COALESCE(co2, s1, 0) - ${baselineCo2}) ASC 
        LIMIT ${limit}
      `;

      // 3. Fallback to same sector globally if too few found
      if (peers.length < 3) {
          const globalPeers = await sql`
            SELECT name, sector, country, co2, s1, s2, s3, report_year, data_tier 
            FROM companies 
            WHERE sector = ${sector} 
            AND name != ${name}
            AND name NOT IN (${peers.length > 0 ? peers.map(p => p.name) : ['NONE']})
            ORDER BY ABS(COALESCE(co2, s1, 0) - ${baselineCo2}) ASC 
            LIMIT ${limit - peers.length}
          `;
          peers = [...peers, ...globalPeers];
      }

      // Add simple Greendex simulation for each if not present
      // In a real system, computeGreendex is called. Here we return what we have.
      res.json({
        success: true,
        data: peers,
        count: peers.length,
        comparison_baseline: baselineCo2,
        ts: new Date().toISOString()
      });

    } catch (err) {
      console.error("[Peer API Error]:", err.message);
      res.status(500).json({ error: err.message });
    }
  });
}
