export default function mountEsgCompare(app, sql) {
  app.post('/api/esg/compare', async (req, res) => {
    const { companyA, companyB } = req.body;
    if (!companyA || !companyB) {
      return res.status(400).json({ error: "companyA and companyB are required" });
    }

    try {
      // Assuming 'companies' table or seed data representation.
      // Since esg-companies.json contains complex nested logic like 'methodology',
      // we need to query db and parse methodology (JSONB).
      const rows = await sql`
        SELECT * FROM companies WHERE name IN (${companyA}, ${companyB})
      `;
      
      const compA = rows.find(r => r.name === companyA);
      const compB = rows.find(r => r.name === companyB);

      if (!compA || !compB) {
         return res.status(404).json({ error: "One or both companies not found" });
      }

      // Delta Calculations
      const emissionA = (parseFloat(compA.co2) || 0) + (parseFloat(compA.s1) || 0) + (Math.max(parseFloat(compA.s2) || 0, parseFloat(compA.scope2_location) || 0));
      const emissionB = (parseFloat(compB.co2) || 0) + (parseFloat(compB.s1) || 0) + (Math.max(parseFloat(compB.s2) || 0, parseFloat(compB.scope2_location) || 0));
      const emission_gap_mt = Math.abs(emissionA - emissionB);

      const s3A = parseFloat(compA.s3) || 0;
      const s3B = parseFloat(compB.s3) || 0;
      const scope3_gap_mt = Math.abs(s3A - s3B);

      // Simple mock logic for CBAM context: If exposed, apply a 80eur/ton baseline on S1+S2.
      const cbamPrice = 80; // EUR per tonne
      const cbamA = compA.cbam_exposed ? (emissionA * cbamPrice) : 0;
      const cbamB = compB.cbam_exposed ? (emissionB * cbamPrice) : 0;
      const cbam_liability_gap = Math.abs(cbamA - cbamB);

      const waterA = parseFloat(compA.water_withdrawal_kl) || 0;
      const waterB = parseFloat(compB.water_withdrawal_kl) || 0;
      const water_intensity_gap = Math.abs(waterA - waterB);

      const methA = typeof compA.methodology === 'string' ? JSON.parse(compA.methodology || '{}') : (compA.methodology || {});
      const methB = typeof compB.methodology === 'string' ? JSON.parse(compB.methodology || '{}') : (compB.methodology || {});

      let methodology_compatibility_flag = false;
      let methodology_note = "Valid comparability.";
      if (methA.gwp_version && methB.gwp_version && (methA.gwp_version !== methB.gwp_version)) {
        methodology_compatibility_flag = true;
        methodology_note = `GWP Version mismatch: ${methA.gwp_version} vs ${methB.gwp_version}. Direct comparison is scientifically flawed.`;
      }

      const greenwash_signals = [];
      const checkGreenwash = (comp, meth) => {
        const s2Loc = parseFloat(comp.scope2_location) || 0;
        const s2Mar = parseFloat(comp.scope2_market) || 0;
        if (s2Loc > 0 && s2Mar > 0 && (s2Loc - s2Mar) / s2Loc > 0.2) {
          greenwash_signals.push({
            company: comp.name,
            signal: "REC Reliance > 20%",
            description: "Market-based Scope 2 is significantly lower than physical grid emissions. Decarbonization relies on certificates, not direct transition."
          });
        }
      };

      checkGreenwash(compA, methA);
      checkGreenwash(compB, methB);

      res.json({
        data: {
          emission_gap_mt,
          scope3_gap_mt,
          cbam_liability_gap,
          water_intensity_gap,
          methodology_compatibility_flag,
          methodology_note,
          greenwash_signals,
          rawA: compA,
          rawB: compB
        },
        cached_at: new Date().toISOString(),
        stale: false,
        source: 'GreenOrb Dynamic Engine',
        ttl: 0
      });

    } catch (e) {
      console.error("[ESG Compare API Error]:", e);
      res.status(500).json({ error: e.message });
    }
  });
}
