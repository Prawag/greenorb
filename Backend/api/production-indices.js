import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory cache for JODI data
let jodiCache = [];

function loadJodiData() {
  try {
    const csvPath = path.join(__dirname, '../data/jodi-oil.csv');
    const content = fs.readFileSync(csvPath, 'utf8');
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    const headers = lines[0].split(',');
    
    jodiCache = lines.slice(1).map(line => {
      const parts = line.split(',');
      return {
        country: parts[0],
        product: parts[1],
        month: parts[2],
        value: parseFloat(parts[3])
      };
    });
    console.log(`[JODI] Loaded ${jodiCache.length} records into memory.`);
  } catch (err) {
    console.error("[JODI] Failed to load CSV:", err.message);
  }
}

// Initial load
loadJodiData();

export default function mountProductionIndices(app) {
  // GET JODI oil/gas production
  app.get('/api/macro/oil-production', async (req, res) => {
    const { country, months } = req.query;
    const limit = parseInt(months) || 12;

    const results = jodiCache
      .filter(r => !country || r.country === country)
      .sort((a, b) => b.month.localeCompare(a.month)) // Latest first
      .slice(0, limit);

    res.json({
      success: true,
      data: results,
      source: 'JODI Oil World Database',
      unit: 'kbpd (thousand barrels per day)'
    });
  });

  // GET India IIP from data.gov.in
  app.get('/api/macro/india-iip', async (req, res) => {
    const { sector, months } = req.query;
    const apiKey = process.env.DATAGOVIN_KEY;

    if (!apiKey) {
      // Mock fallback if no API key
      return res.json({
        success: true,
        data: [
          { month: '2026-02', value: 145.3, growth_yoy: 8.2 },
          { month: '2026-01', value: 142.1, growth_yoy: 7.9 },
          { month: '2025-12', value: 139.8, growth_yoy: 6.5 }
        ],
        source: 'data.gov.in (mock — missing key)',
        sector: sector || 'Eight Core Industries'
      });
    }

    // Dataset IDs (Approximate placeholders for current sprint)
    const datasetMap = {
      'steel': '34d9a6c4-6447-4958-8671-5589fe78021c', // Example ID
      'cement': '2f782c5f-4614-41d3-a4f6-8c0cdec1d5f2'
    };

    try {
      const id = datasetMap[sector?.toLowerCase()] || datasetMap['steel'];
      const url = `https://api.data.gov.in/resource/${id}?api-key=${apiKey}&format=json&limit=${months || 12}`;
      
      const response = await fetch(url);
      const data = await response.json();

      res.json({
        success: true,
        data: data.records || [],
        total: data.total,
        source: 'data.gov.in'
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
