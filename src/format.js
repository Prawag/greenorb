export const METRIC_LABELS = {
  ghg_scope1: 'Scope 1',
  ghg_scope2_location: 'Scope 2 (location)',
  ghg_scope2_market: 'Scope 2 (market)',
  ghg_scope2: 'Scope 2',
  ghg_scope3: 'Scope 3',
  ghg_scope12_total: 'Scope 1+2 total',
  energy_total: 'Energy use',
  energy_renewable_pct: 'Renewable share',
  water_withdrawal: 'Water withdrawal',
  water_consumption: 'Water consumption',
  waste_generated: 'Waste generated',
};

export const FLAG_LABELS = {
  NO_GHG_DATA: 'No GHG data',
  NO_ASSURANCE: 'Not assured',
  ASSURANCE_NOT_FOUND: 'No assurance found',
  SCOPE1_MISSING: 'Scope 1 missing',
  SCOPE3_NOT_REPORTED: 'No Scope 3',
  SCOPE_SUM_MISMATCH: 'Totals mismatch',
  YOY_SWING: 'Large swing',
  RESTATEMENT: 'Restated',
  MARKET_SCOPE2_ZERO: 'Market Scope 2 = 0',
  NET_ZERO_NO_INTERIM: 'Net zero, no interim',
  NEUTRALITY_VIA_OFFSETS: 'Neutrality via offsets',
  UNIT_AMBIGUOUS: 'Ambiguous unit',
  EXTRACTION_CONFLICT: 'Readings disagree',
  LEGACY_UNVERIFIED: 'Legacy data',
};

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });
const full = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/** "1.23M" style for tables/tiles; null-safe (renders an en dash). */
export function fmtCompact(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '–';
  const n = Number(v);
  return Math.abs(n) < 10000 ? full.format(n) : compact.format(n);
}
export function fmtFull(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '–';
  return full.format(Number(v));
}
export function fmtUnit(unit) {
  return { tCO2e: 'tCO₂e', m3: 'm³' }[unit] || unit || '';
}
export function fmtDate(iso) {
  if (!iso) return '–';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
export function timeAgo(iso) {
  if (!iso) return 'never';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
export const METHOD_LABELS = {
  table: 'Table parser',
  llm: 'LLM (grounded)',
  'table+llm': 'Table + LLM agree',
  manual: 'Manual',
  legacy: 'Legacy import',
};
