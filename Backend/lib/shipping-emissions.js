import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load static seed data
const PORT_DISTANCES = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/port-distances.json'), 'utf8'));
const EMISSION_FACTORS = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/emission-factors.json'), 'utf8'));

/**
 * Calculates shipping emissions based on GLEC Framework v3.
 * 
 * @param {Object} params 
 * @param {string} params.from_port - Origin port (e.g., "JNPT")
 * @param {string} params.to_port - Destination port (e.g., "Rotterdam")
 * @param {number} params.cargo_tonnes - Weight of cargo in tonnes
 * @param {string} params.vessel_type - Type of vessel from EMISSION_FACTORS keys
 */
export function calculateShippingEmissions({ from_port, to_port, cargo_tonnes, vessel_type }) {
  const route_key = `${from_port}_to_${to_port}`;
  const route = PORT_DISTANCES[route_key];
  
  if (!route) {
    console.warn(`[GLEC] No distance data for route: ${route_key}`);
    return null;
  }
  
  const distance = route.distance_km;
  const efData = EMISSION_FACTORS[vessel_type] || EMISSION_FACTORS['bulk_carrier_panamax'];
  const ef = efData.ef_wtw; // Use Well-to-Wake (WTW) factor as per GLEC/ISO14083
  
  const emissions_kg = distance * cargo_tonnes * ef;
  const emissions_mt = emissions_kg / 1000;
  
  return {
    distance_km: distance,
    via: route.via,
    cargo_tonnes,
    vessel_type,
    vessel_description: efData.description,
    ef_kgco2_per_tkm: ef,
    emissions_kg: Math.round(emissions_kg),
    emissions_mt: Math.round(emissions_mt * 100) / 100,
    methodology: 'GLEC_Framework_v3_ISO14083',
    scope: 'Scope_3_Category_4_WTW'
  };
}
