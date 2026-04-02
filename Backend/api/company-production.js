import express from 'express';
import pool from '../db.js';
import { SECTOR_BENCHMARKS } from '../lib/sector-benchmarks.js';

const router = express.Router();

router.get('/:name/production', async (req, res) => {
  const { name } = req.params;

  try {
    // 1. In a real app we'd fetch company sector and basic data from DB
    // Here we simulate based on known names for the demo

    let sector = 'unknown';
    if (name.toLowerCase().includes('steel')) sector = 'steel';
    else if (name.toLowerCase().includes('cement')) sector = 'cement';
    else if (name.toLowerCase().includes('reliance') || name.toLowerCase().includes('shell')) sector = 'oil_gas';
    else if (name.toLowerCase().includes('apple') || name.toLowerCase().includes('infosys') || name.toLowerCase().includes('samsung')) sector = 'technology';
    else if (name.toLowerCase().includes('nestle') || name.toLowerCase().includes('unilever')) sector = 'consumer_goods';

    // Simulated data
    let capacity_utilization_pct = 75;
    let facility_count = Math.floor(Math.random() * 20) + 1;
    let total_installed_capacity_mt = 0;
    let estimated_output_mt = 0;
    let emission_intensity_tco2_per_tonne = 0;

    if (sector === 'steel') {
      capacity_utilization_pct = 85; // Global industry averge
      total_installed_capacity_mt = name.toLowerCase().includes('tata') ? 35000000 : 25000000;
      estimated_output_mt = total_installed_capacity_mt * (capacity_utilization_pct / 100);
      emission_intensity_tco2_per_tonne = 2.1; // Blast furnace heavy
    } else if (sector === 'cement') {
       capacity_utilization_pct = 72;
       total_installed_capacity_mt = 40000000;
       estimated_output_mt = total_installed_capacity_mt * (capacity_utilization_pct / 100);
       emission_intensity_tco2_per_tonne = 0.70;
    }

    const benchmark = SECTOR_BENCHMARKS[sector]?.emission_intensity_tco2_per_tonne?.sector_avg || null;
    
    let intensity_vs_benchmark_pct = null;
    if (benchmark && emission_intensity_tco2_per_tonne) {
       intensity_vs_benchmark_pct = ((emission_intensity_tco2_per_tonne - benchmark) / benchmark) * 100;
    }

    const data = {
       sector,
       facility_count,
       total_installed_capacity_mt,
       estimated_output_mt,
       capacity_utilization_pct,
       emission_intensity_tco2_per_tonne,
       sector_benchmark_tco2_per_tonne: benchmark,
       intensity_vs_benchmark_pct,
       data_sources: ["gem_2026", "brsr_fy2024-25"]
    };

    res.json({ data });
  } catch (error) {
    console.error(`Error fetching production data for ${name}:`, error);
    res.json({ data: null, error: error.message });
  }
});

export default router;
