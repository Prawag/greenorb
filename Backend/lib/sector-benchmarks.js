export const SECTOR_BENCHMARKS = {
  steel: {
    emission_intensity_tco2_per_tonne: { bfbof: 2.1, eaf: 0.4, sector_avg: 1.9 },
    water_intensity_kl_per_tonne: 28.0,
    energy_intensity_gj_per_tonne: 19.8,
    recycling_rate_pct: 85,
    sources: ["JRC141817", "worldsteel.org", "IEA 2024"]
  },
  cement: {
    emission_intensity_tco2_per_tonne: { opc: 0.82, blended: 0.65, sector_avg: 0.75 },
    water_intensity_kl_per_tonne: 0.35,
    sources: ["IEA", "GCCA 2024"]
  },
  oil_gas: {
    methane_intensity_pct: 0.2, // (sector avg, well-to-export)
    scope3_cat11_ratio: 0.85, // (use of sold products as % of total)
    sources: ["IPIECA 2024"]
  },
  technology: {
    scope3_cat1_ratio: 0.75, // (purchased goods as % of total)
    data_center_pue: 1.38, // (industry avg PUE)
    sources: ["Uptime Institute 2024"]
  },
  consumer_goods: {
    packaging_recycled_pct: 45,
    scope3_flag_emissions_pct: 30, // (FLAG as % of total Scope 3)
    sources: ["UNEP 2024", "Eurostat cei_wm020"]
  }
};
