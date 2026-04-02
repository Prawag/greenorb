import fetch from 'node-fetch';

export default function mountMacrotrends(app, sql) {
  // GET historical financial history from Macrotrends
  app.get('/api/company/:name/macrotrends', async (req, res) => {
    const { name } = req.params;
    const ticker = req.query.ticker;
    const slug = req.query.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    if (!ticker) {
      return res.status(400).json({ error: "Ticker symbol required for Macrotrends lookup" });
    }

    try {
      console.log(`[Macrotrends] Fetching history for ${ticker}/${slug}...`);
      const url = `https://www.macrotrends.net/stocks/charts/${ticker}/${slug}/revenue`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://www.macrotrends.net/'
        }
      });

      if (!response.ok) throw new Error(`Macrotrends responded with ${response.status}`);
      const html = await response.text();

      // Extract embedded JSON from JavaScript variable 'var originalData = [...]'
      const matches = html.match(/var\s+originalData\s*=\s*(\[.*?\]);/s);
      if (!matches) {
        return res.status(404).json({ error: "Could not locate financial data in Macrotrends page" });
      }

      const rawData = JSON.parse(matches[1]);
      
      // Clean and aggregate by fiscal year
      const annuals = rawData
        .filter(row => row.date && row.v)
        .map(row => ({
          date: row.date,
          year: parseInt(row.date.split('-')[0]),
          value: parseFloat(row.v) * 1e6 // Values are usually in millions
        }))
        .filter((row, i, self) => i === self.findIndex(r => r.year === row.year)) // Unique years
        .slice(0, 10); // Take last 10 years

      // Store in DB
      for (const row of annuals) {
        await sql`
          INSERT INTO company_financials (
            company_name, fiscal_year, fiscal_period, revenue_usd, source
          ) VALUES (
            ${name}, ${row.year}, 'FY', ${row.value}, 'macrotrends'
          )
          ON CONFLICT (company_name, fiscal_year, fiscal_period) DO UPDATE SET
            revenue_usd = EXCLUDED.revenue_usd,
            fetched_at = CURRENT_TIMESTAMP
        `;
      }

      res.json({
        company: name,
        ticker,
        history: annuals,
        source: 'Macrotrends.net'
      });

    } catch (err) {
      console.error("[Macrotrends API Error]:", err.message);
      res.status(500).json({ error: err.message });
    }
  });
}
