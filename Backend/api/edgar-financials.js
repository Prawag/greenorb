import fetch from 'node-fetch';

export default function mountEdgarFinancials(app, sql) {
  // GET financial facts from SEC EDGAR
  app.get('/api/company/:name/edgar', async (req, res) => {
    const { name } = req.params;
    const cik = req.query.cik;

    if (!cik) {
      return res.status(400).json({ error: "CIK number required for EDGAR lookup" });
    }

    // Standardize CIK to 10 digits with leading zeros
    const paddedCik = cik.toString().padStart(10, '0');

    try {
      console.log(`[EDGAR] Fetching facts for CIK ${paddedCik} (${name})...`);
      
      // Note: SEC requires a User-Agent with contact info
      const response = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${paddedCik}.json`, {
        headers: {
          'User-Agent': 'GreenOrb Intelligence/1.0 (admin@greenorb.ai)',
          'Accept-Encoding': 'gzip, deflate'
        }
      });

      if (!response.ok) throw new Error(`SEC EDGAR responded with ${response.status}`);
      const facts = await response.json();

      const gaap = facts.facts['us-gaap'];
      if (!gaap) throw new Error("No us-gaap facts found in filing");

      // Helper to extract 10-K (annual) series for a concept
      const getSeries = (conceptName) => {
        const concept = gaap[conceptName];
        if (!concept || !concept.units || !concept.units.USD) return [];
        
        return concept.units.USD
          .filter(entry => entry.form === '10-K' && entry.fp === 'FY')
          .sort((a, b) => b.fy - a.fy) // Latest first
          .reduce((acc, current) => {
            // Take only one entry per fiscal year
            if (!acc.find(item => item.fy === current.fy)) acc.push(current);
            return acc;
          }, [])
          .slice(0, 5) // Last 5 unique fiscal years
          .map(entry => ({ year: entry.fy, value: entry.val, end: entry.end }));
      };

      // Extract key metrics
      const revenue = getSeries('Revenues') || getSeries('RevenueFromContractWithCustomerExcludingAssessedTax');
      const grossProfit = getSeries('GrossProfit');
      const ebit = getSeries('OperatingIncomeLoss');
      const netIncome = getSeries('NetIncomeLoss');
      const capex = getSeries('PaymentsToAcquirePropertyPlantAndEquipment') || getSeries('CapitalExpendituresIncurredButNotYetPaid');
      const rd = getSeries('ResearchAndDevelopmentExpense');

      // Merge into a year-by-year structure
      const years = [...new Set(revenue.map(r => r.year))].sort((a, b) => b - a);
      const results = years.map(y => {
        const findVal = (series) => series.find(s => s.year === y)?.value || 0;
        return {
          fiscal_year: y,
          revenue_usd: findVal(revenue),
          gross_profit_usd: findVal(grossProfit),
          ebit_usd: findVal(ebit),
          net_income_usd: findVal(netIncome),
          capex_usd: findVal(capex),
          rd_expense_usd: findVal(rd)
        };
      });

      // Cache results in DB
      for (const row of results) {
        await sql`
          INSERT INTO company_financials (
            company_name, fiscal_year, fiscal_period, 
            revenue_usd, gross_profit_usd, ebit_usd, net_income_usd, capex_usd, rd_expense_usd, 
            source
          ) VALUES (
            ${name}, ${row.fiscal_year}, 'FY', 
            ${row.revenue_usd}, ${row.gross_profit_usd}, ${row.ebit_usd}, ${row.net_income_usd}, ${row.capex_usd}, ${row.rd_expense_usd}, 
            'edgar'
          )
          ON CONFLICT (company_name, fiscal_year, fiscal_period) DO UPDATE SET
            revenue_usd = EXCLUDED.revenue_usd,
            fetched_at = CURRENT_TIMESTAMP
        `;
      }

      res.json({
        company: name,
        cik: paddedCik,
        series: results,
        source: 'SEC EDGAR XBRL'
      });

    } catch (err) {
      console.error("[EDGAR API Error]:", err.message);
      res.status(500).json({ error: err.message });
    }
  });
}
