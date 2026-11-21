// Canonical metric catalogue. Keep in sync with worker/greenorb_worker/metrics.py
// and the CHECK constraint on esg.metrics.metric.
export const METRICS = {
  ghg_scope1: { label: 'Scope 1 emissions', unit: 'tCO2e', group: 'ghg' },
  ghg_scope2_location: { label: 'Scope 2 emissions (location-based)', unit: 'tCO2e', group: 'ghg' },
  ghg_scope2_market: { label: 'Scope 2 emissions (market-based)', unit: 'tCO2e', group: 'ghg' },
  ghg_scope2: { label: 'Scope 2 emissions', unit: 'tCO2e', group: 'ghg' },
  ghg_scope3: { label: 'Scope 3 emissions', unit: 'tCO2e', group: 'ghg' },
  ghg_scope12_total: { label: 'Scope 1 + 2 emissions (reported total)', unit: 'tCO2e', group: 'ghg' },
  energy_total: { label: 'Total energy consumption', unit: 'MWh', group: 'energy' },
  energy_renewable_pct: { label: 'Renewable energy share', unit: '%', group: 'energy' },
  water_withdrawal: { label: 'Water withdrawal', unit: 'm3', group: 'water' },
  water_consumption: { label: 'Water consumption', unit: 'm3', group: 'water' },
  waste_generated: { label: 'Waste generated', unit: 't', group: 'waste' },
};

export const METRIC_KEYS = Object.keys(METRICS);
export const METRIC_LABELS = Object.fromEntries(Object.entries(METRICS).map(([k, v]) => [k, v.label]));
