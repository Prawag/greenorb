import express from 'express';

const router = express.Router();

// Mock mapping of GreenOrb sectors to Climatiq EXIOBASE activity IDs
const CLIMATIQ_ACTIVITY_MAP = {
  steel: "manufacturing-iron_and_steel_products-manufacturing",
  cement: "manufacturing-cement_lime_plaster-manufacturing",
  technology: "manufacturing-computer_electronic_optical-manufacturing",
  services: "services-other_professional_scientific-services"
};

router.get('/scope3/activity-map', (req, res) => {
  res.json({ data: CLIMATIQ_ACTIVITY_MAP });
});

router.post('/:name/scope3/estimate', async (req, res) => {
  const { name } = req.params;
  const { annual_spend_by_sector } = req.body;

  if (!annual_spend_by_sector || !Array.isArray(annual_spend_by_sector)) {
    return res.status(400).json({ error: "Invalid payload. Expected annual_spend_by_sector array." });
  }

  try {
    let total_co2e_kg = 0;
    const breakdown = [];

    for (const item of annual_spend_by_sector) {
      const activity_id = CLIMATIQ_ACTIVITY_MAP[item.sector] || "services-other_professional_scientific-services";
      
      // Simulate Climatiq API EXIOBASE emission factor calculation
      // Roughly 0.2 to 0.8 kg CO2e per USD depending on sector
      let factor = 0.5;
      if (item.sector === 'steel') factor = 0.8;
      if (item.sector === 'services') factor = 0.1;
      
      const co2e_kg = item.spend_usd * factor;
      total_co2e_kg += co2e_kg;
      
      breakdown.push({
        sector: item.sector,
        activity_id,
        spend_usd: item.spend_usd,
        estimated_co2e_kg: co2e_kg
      });
    }

    res.json({
      data: {
        total_scope3_cat1_tco2e: total_co2e_kg / 1000,
        breakdown,
        source: "EXIOBASE via Climatiq Simulation"
      }
    });

  } catch (error) {
    console.error(`Error calculating Scope 3 for ${name}:`, error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
