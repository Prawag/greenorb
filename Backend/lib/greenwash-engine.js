export const calculateGreenwashSignals = (companyData) => {
  const {
    scope1_mt = null,
    scope2_location_mt = null,
    scope2_market_mt = null,
    scope3_mt = null,
    has_scope3_net_zero_target = false,
    target_type = 'ABSOLUTE',
    absolute_emissions_trend = 'FLAT',
    verification_body = null,
    facilities = [],
    sector_median_scope1 = 1000000 // default fallback
  } = companyData;

  // Signal 1: Scope 2 Dual Reporting Gap
  const scope2_gap_pct = scope2_market_mt !== null && scope2_location_mt !== null && scope2_location_mt > 0
    ? ((scope2_location_mt - scope2_market_mt) / scope2_location_mt) * 100
    : null;
  
  const s1_rec_reliance = scope2_gap_pct > 10
    ? { level: 'ELEVATED', severity: scope2_gap_pct > 30 ? 'HIGH' : 'MEDIUM', gap_pct: scope2_gap_pct }
    : { level: 'ACCEPTABLE', severity: 'LOW', gap_pct: scope2_gap_pct };

  // Signal 2: Scope 3 Coverage Gap
  const total_emissions = (scope1_mt || 0) + (scope2_location_mt || 0) + (scope3_mt || 0);
  const scope3_ratio = total_emissions > 0 && scope3_mt !== null ? scope3_mt / total_emissions : 0;
  
  const s2_scope3_gap = scope3_ratio > 0.90 && !has_scope3_net_zero_target
    ? { level: 'OUTSOURCING_EMISSIONS_FLAG', ratio_pct: scope3_ratio * 100, severity: 'HIGH' }
    : { level: 'ACCEPTABLE', severity: 'LOW' };

  // Signal 3: Absolute vs Intensity Target
  const s3_intensity_only = target_type === 'INTENSITY' && absolute_emissions_trend === 'RISING'
    ? { level: 'WEAK_TARGETING', note: 'Intensity target masks absolute emission growth', severity: 'MEDIUM' }
    : { level: 'ACCEPTABLE', severity: 'LOW' };

  // Signal 4: Verification Gap
  const s4_no_assurance = !verification_body
    ? { level: 'UNVERIFIED', note: 'No third-party assurance declared', severity: 'MEDIUM' }
    : { level: 'VERIFIED', provider: verification_body, severity: 'LOW' };

  // Signal 5: Satellite Divergence
  const affected_facilities = facilities.filter(f =>
    f.no2_verdict === 'CRITICALLY_HIGH' && scope1_mt !== null && scope1_mt < sector_median_scope1
  );
  
  const s5_satellite = affected_facilities.length > 0
    ? { level: 'SATELLITE_DIVERGENCE', affected_facilities, severity: 'CRITICAL' }
    : { level: 'CONSISTENT', severity: 'LOW' };

  // Composite score
  const getWeight = (s) => {
    const sev = s.severity || s.level;
    return { HIGH: 3, MEDIUM: 2, LOW: 0, ACCEPTABLE: 0, CRITICAL: 4 }[sev] || 0;
  };
  
  const signal_weights = [s1_rec_reliance, s2_scope3_gap, s3_intensity_only, s4_no_assurance, s5_satellite].map(getWeight);
  const total_weight = signal_weights.reduce((a, b) => a + b, 0);
  
  const greenwash_risk = total_weight >= 8 ? 'CRITICAL'
    : total_weight >= 5 ? 'HIGH'
    : total_weight >= 2 ? 'MEDIUM'
    : 'LOW';

  return {
    greenwash_risk,
    signals: [
      { name: "Scope 2 RECs Reliance", ...s1_rec_reliance },
      { name: "Scope 3 Boundaries", ...s2_scope3_gap },
      { name: "Target Type Quality", ...s3_intensity_only },
      { name: "Verification Status", ...s4_no_assurance },
      { name: "Satellite Alignment", ...s5_satellite }
    ],
    composite_score: total_weight
  };
};
