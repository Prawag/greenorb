import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load static seed data
let alignmentData = [];
try {
  const jsonPath = path.join(__dirname, '../data/carbontracker.json');
  alignmentData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
} catch (err) {
  console.error("[CarbonTracker] Failed to load JSON:", err.message);
}

export default function mountClimateAlignment(app) {
  // GET CarbonTracker alignment score + risk rating
  app.get('/api/company/:name/climate-alignment', async (req, res) => {
    const { name } = req.params;

    // Search by name or ticker
    const entry = alignmentData.find(e => 
      e.name.toLowerCase().includes(name.toLowerCase()) || 
      e.ticker?.toLowerCase() === name.toLowerCase()
    );

    if (!entry) {
      return res.status(404).json({ error: "Climate alignment assessment not available for this company." });
    }

    res.json({
      success: true,
      data: entry,
      source: 'CarbonTracker CA100+ Benchmarking',
      methodology: 'IEA NZE 2050 Alignment @ $120/t Carbon'
    });
  });
}
