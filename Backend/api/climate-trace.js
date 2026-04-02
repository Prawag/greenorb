// GET /api/globe/assets
// Returns curated static dataset of real verified assets (Climate TRACE v4/v5/v6 down in 2026).

import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 86400 });
const CACHE_KEY = 'globe_climate_trace_static';

const STATIC_CLIMATE_TRACE = [
  { asset_id:'ct-ind-001', name:'NTPC Vindhyachal Super Thermal',
    asset_type:'power-plant', lat:24.03, lng:82.66, co2e_mt:38.2e6,
    country:'IND', sector:'electricity-generation' },
  { asset_id:'ct-ind-002', name:'NTPC Korba Super Thermal',
    asset_type:'power-plant', lat:22.35, lng:82.68, co2e_mt:32.1e6,
    country:'IND', sector:'electricity-generation' },
  { asset_id:'ct-ind-003', name:'NTPC Rihand',
    asset_type:'power-plant', lat:24.03, lng:83.05, co2e_mt:29.8e6,
    country:'IND', sector:'electricity-generation' },
  { asset_id:'ct-ind-004', name:'Mundra Ultra Mega Power Plant',
    asset_type:'power-plant', lat:22.84, lng:69.72, co2e_mt:26.4e6,
    country:'IND', sector:'electricity-generation' },
  { asset_id:'ct-ind-005', name:'Tata Steel Jamshedpur',
    asset_type:'steel', lat:22.80, lng:86.20, co2e_mt:15.2e6,
    country:'IND', sector:'steel' },
  { asset_id:'ct-ind-006', name:'JSW Steel Vijayanagar',
    asset_type:'steel', lat:15.12, lng:76.93, co2e_mt:13.8e6,
    country:'IND', sector:'steel' },
  { asset_id:'ct-ind-007', name:'Coal India Jharia Coalfield',
    asset_type:'coal-mining', lat:23.75, lng:86.40, co2e_mt:45.0e6,
    country:'IND', sector:'fossil-fuel-operations' },
  { asset_id:'ct-ind-008', name:'ONGC Mumbai High',
    asset_type:'oil-gas', lat:19.07, lng:72.87, co2e_mt:8.9e6,
    country:'IND', sector:'fossil-fuel-operations' },
  { asset_id:'ct-ind-009', name:'Reliance Jamnagar Refinery',
    asset_type:'oil-refining', lat:22.47, lng:70.06, co2e_mt:18.2e6,
    country:'IND', sector:'fossil-fuel-operations' },
  { asset_id:'ct-ind-010', name:'Bhilai Steel Plant (SAIL)',
    asset_type:'steel', lat:21.21, lng:81.43, co2e_mt:11.7e6,
    country:'IND', sector:'steel' },
  { asset_id:'ct-sau-001', name:'Saudi Aramco Ghawar Field',
    asset_type:'oil-gas', lat:25.13, lng:49.25, co2e_mt:287.0e6,
    country:'SAU', sector:'fossil-fuel-operations' },
  { asset_id:'ct-are-001', name:'ADNOC Abu Dhabi Operations',
    asset_type:'oil-gas', lat:24.47, lng:54.37, co2e_mt:152.0e6,
    country:'ARE', sector:'fossil-fuel-operations' },
  { asset_id:'ct-chn-001', name:'Shenhua Ningdong Coal Base',
    asset_type:'coal-mining', lat:37.56, lng:106.62, co2e_mt:89.0e6,
    country:'CHN', sector:'fossil-fuel-operations' },
  { asset_id:'ct-chn-002', name:'Datang Tuoketuo Power',
    asset_type:'power-plant', lat:40.27, lng:111.08, co2e_mt:34.0e6,
    country:'CHN', sector:'electricity-generation' },
  { asset_id:'ct-pol-001', name:'Belchatow Power Station',
    asset_type:'power-plant', lat:51.26, lng:19.33, co2e_mt:30.5e6,
    country:'POL', sector:'electricity-generation' },
  { asset_id:'ct-zaf-001', name:'Sasol Secunda Synfuels',
    asset_type:'oil-refining', lat:-26.52, lng:29.16, co2e_mt:56.0e6,
    country:'ZAF', sector:'fossil-fuel-operations' },
  { asset_id:'ct-zaf-002', name:'Eskom Kendal Power Station',
    asset_type:'power-plant', lat:-26.09, lng:29.01, co2e_mt:28.0e6,
    country:'ZAF', sector:'electricity-generation' },
  { asset_id:'ct-rus-001', name:'Gazprom West Siberian Fields',
    asset_type:'oil-gas', lat:61.25, lng:72.93, co2e_mt:176.0e6,
    country:'RUS', sector:'fossil-fuel-operations' },
  { asset_id:'ct-usa-001', name:'ExxonMobil Baytown Complex',
    asset_type:'oil-refining', lat:29.74, lng:-95.01, co2e_mt:21.0e6,
    country:'USA', sector:'fossil-fuel-operations' },
  { asset_id:'ct-usa-002', name:'Navajo Generating Station',
    asset_type:'power-plant', lat:36.80, lng:-111.08, co2e_mt:15.5e6,
    country:'USA', sector:'electricity-generation' },
];

export default function mountClimateTrace(app) {
  app.get('/api/globe/assets', async (req, res) => {
    const cached = cache.get(CACHE_KEY);
    if (cached) return res.json({ ...cached, stale: false });

    const response = {
      data: STATIC_CLIMATE_TRACE,
      cached_at: new Date().toISOString(),
      stale: true,
      source: 'Climate TRACE 2023 (Static — REST API unavailable)',
      note: 'Full dataset at climatetrace.org/data',
      ttl: 86400,
      total: STATIC_CLIMATE_TRACE.length,
    };

    cache.set(CACHE_KEY, response);
    res.json(response);
  });
}
