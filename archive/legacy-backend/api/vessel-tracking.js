export default function mountVesselTracking(app, sql) {
  // GET live vessel positions for a company's trade routes
  app.get('/api/vessels/active', async (req, res) => {
    const { company } = req.query;

    try {
      let data;
      if (company) {
        // Find vessels linked to this company via company_name or trade routes
        // For this sprint, we filter by company_name if available in vessel_positions
        data = await sql`
          SELECT * FROM vessel_positions 
          WHERE company_name ILIKE ${'%' + company + '%'} 
          OR vessel_name IN (SELECT supplier_name FROM company_suppliers WHERE buyer_company = ${company})
          ORDER BY last_seen DESC
        `;
      } else {
        // Sample all active vessels for the global globe view
        data = await sql`
          SELECT * FROM vessel_positions 
          ORDER BY last_seen DESC 
          LIMIT 500
        `;
      }

      res.json({
        success: true,
        data,
        source: 'AISstream.io WebSocket Feed',
        ts: new Date().toISOString()
      });
    } catch (err) {
      console.error("[Vessel API Error]:", err.message);
      res.status(500).json({ error: err.message });
    }
  });
}
