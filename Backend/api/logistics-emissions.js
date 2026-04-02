import { calculateShippingEmissions } from '../lib/shipping-emissions.js';

export default function mountLogisticsEmissions(app) {
  // POST calculate emissions for a custom shipping route
  app.post('/api/logistics/shipping-emissions', async (req, res) => {
    const { from_port, to_port, cargo_tonnes, vessel_type } = req.body;

    if (!from_port || !to_port || !cargo_tonnes) {
      return res.status(400).json({ error: "Missing required fields: from_port, to_port, cargo_tonnes" });
    }

    try {
      const result = calculateShippingEmissions({ from_port, to_port, cargo_tonnes, vessel_type });
      
      if (!result) {
        return res.status(404).json({ 
          error: "Route distance not found in Dataloy cache",
          available_routes_prefix: "JNPT_to_*, Mundra_to_*, Shanghai_to_*, Singapore_to_*"
        });
      }

      res.json({
        success: true,
        ...result,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
