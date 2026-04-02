import fs from 'fs';
import path from 'path';

let lcaData = [];

export default function mountProductLca(app) {
  // Load data once into memory
  try {
    const dataPath = path.join(process.cwd(), 'data', 'product-lca.json');
    if (fs.existsSync(dataPath)) {
      lcaData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    }
  } catch (e) {
    console.error("Failed to load product-lca.json:", e.message);
  }

  app.get('/api/products/lca', (req, res) => {
    const { category } = req.query; // e.g., 'steel', 'phone'

    let filtered = lcaData;
    if (category) {
       const catLower = category.toLowerCase();
       filtered = lcaData.filter(p => p.product.toLowerCase().includes(catLower) || p.manufacturer.toLowerCase().includes(catLower));
    }

    res.json({
       data: filtered,
       total: filtered.length,
       source: "GreenOrb Local Seed LCA"
    });
  });

  app.get('/api/products/lca/compare', (req, res) => {
    const { p1, p2 } = req.query;
    if (!p1 || !p2) {
      return res.status(400).json({ error: "p1 and p2 required" });
    }

    const prod1 = lcaData.find(p => p.product === p1);
    const prod2 = lcaData.find(p => p.product === p2);

    if (!prod1 || !prod2) {
      return res.status(404).json({ error: "One or both products not found in library" });
    }

    const carbon_delta = Math.abs(prod1.carbon_kgco2e - prod2.carbon_kgco2e);

    res.json({
      data: {
        product1: prod1,
        product2: prod2,
        carbon_delta_kgco2e: carbon_delta
      }
    });
  });
}
