import express from 'express';
import NodeCache from 'node-cache';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();
const cache = new NodeCache({ stdTTL: 86400 }); // 24 hours

let tickersMap = [];
try {
  const tickerData = fs.readFileSync(path.join(__dirname, '..', 'data', 'company-tickers.json'), 'utf8');
  tickersMap = JSON.parse(tickerData);
} catch (e) {
  console.warn("Could not load company-tickers.json for trade intelligence");
}

router.get('/:name/trade', async (req, res) => {
  const { name } = req.params;
  const year = req.query.year || 2024;
  const cacheKey = `trade_${name}_${year}`;

  if (cache.has(cacheKey)) {
    return res.json({ data: cache.get(cacheKey) });
  }

  try {
    const tickerInfo = tickersMap.find(t => t.name.toLowerCase() === name.toLowerCase());
    if (!tickerInfo || !tickerInfo.hs_codes || tickerInfo.hs_codes.length === 0) {
      return res.json({ data: null, message: "No trade data available for this company" });
    }

    // Simulate UN Comtrade Response
    const export_destinations = [
      { country: "Netherlands", value_usd: 450000000, weight_tonnes: 520000, pct_total: 25 },
      { country: "United States", value_usd: 310000000, weight_tonnes: 350000, pct_total: 18 },
      { country: "Italy", value_usd: 280000000, weight_tonnes: 315000, pct_total: 15 },
      { country: "Germany", value_usd: 210000000, weight_tonnes: 240000, pct_total: 12 },
      { country: "UAE", value_usd: 150000000, weight_tonnes: 180000, pct_total: 9 },
    ];

    const eu_countries = ["Netherlands", "Italy", "Germany"];
    const eu_export_volume_mt = export_destinations
      .filter(d => eu_countries.includes(d.country))
      .reduce((sum, d) => sum + d.weight_tonnes, 0);

    const cbam_rate_used = 74.80;
    // Simulated carbon intensity for steel ~1.9 tCO2/tonne
    const embedded_carbon_mt = eu_export_volume_mt * 1.9;
    const cbam_liability_eur = embedded_carbon_mt * cbam_rate_used;

    // Simulate shipping emissions (approx 0.0092 kg/t-km)
    // Avg distance ~7500km
    const total_export_tonnes = export_destinations.reduce((sum, d) => sum + d.weight_tonnes, 0);
    const shipping_emissions_mt = (7500 * total_export_tonnes * 0.0092) / 1000;

    const tradeData = {
      export_destinations,
      eu_export_volume_mt,
      cbam_liability_eur,
      cbam_rate_used,
      shipping_emissions_mt,
      hs_codes_queried: tickerInfo.hs_codes,
      year: parseInt(year)
    };

    cache.set(cacheKey, tradeData);
    res.json({ data: tradeData });
  } catch (error) {
    console.error(`Error fetching trade data for ${name}:`, error);
    res.json({ data: null, error: error.message });
  }
});

export default router;
