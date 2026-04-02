import fetch from 'node-fetch';

export default function mountOsiIngest(app, sql) {
  app.get('/api/osi/sync', async (req, res) => {
    try {
      // 1. Fetch all companies in DB
      const companies = await sql`SELECT * FROM companies`;
      let updatedCount = 0;
      let insertedSourcesCount = 0;

      for (const company of companies) {
        try {
          // Attempt to fetch from OSI for this specific company
          const osiResponse = await fetch(`https://opensustainabilityindex.org/api/companies?name=${encodeURIComponent(company.name)}`);
          
          // Note: In real life this might 404. We'll catch and gracefully handle it.
          if (!osiResponse.ok) {
              console.log(`[OSI Sync] No match or error for ${company.name}: ${osiResponse.status}`);
              continue; // Skip silently if company not found on index
          }
          
          const osiDataList = await osiResponse.json();
          // Assuming the API returns a list, take the first robust match
          const osiData = Array.isArray(osiDataList) ? osiDataList[0] : osiDataList;
          if (!osiData || !osiData.report_year) continue;

          const scope1 = osiData.scope1_mt || null;
          const scope2 = osiData.scope2_mt || null; // Simplified scope 2 for OSI
          const scope3 = osiData.scope3_mt || null;
          const report_year = osiData.report_year || 0;
          const report_url = osiData.source_url || null;

          // Always store raw provenance in esg_sources
          await sql`
            INSERT INTO esg_sources (
              company_name, source, scope1_mt, scope2_location_mt, scope3_mt, report_year, report_url
            ) VALUES (
              ${company.name}, 'osi_api', ${scope1}, ${scope2}, ${scope3}, ${report_year}, ${report_url}
            )
          `;
          insertedSourcesCount++;

          // Check if we need to overwrite the primary records
          const currentYear = company.report_year || 0;
          
          // Overwrite if newer report year OR if there's no data and we now have info
          if (report_year > currentYear || (currentYear === 0 && report_year > 0)) {
            await sql`
              UPDATE companies
              SET 
                s1 = ${scope1},
                s2 = ${scope2},
                s3 = ${scope3},
                report_year = ${report_year},
                report_url = ${report_url},
                ts = CURRENT_TIMESTAMP
              WHERE name = ${company.name}
            `;
            updatedCount++;
          }
        } catch (innerErr) {
          console.error(`[OSI Sync] Failed processing ${company.name}:`, innerErr.message);
        }
      }

      res.json({
        success: true,
        message: 'OSI sync completed',
        companies_checked: companies.length,
        companies_updated: updatedCount,
        sources_logged: insertedSourcesCount
      });
    } catch (err) {
      console.error("[OSI Sync Error]:", err);
      res.status(500).json({ error: err.message });
    }
  });
}
