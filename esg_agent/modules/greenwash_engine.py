"""Port of legacy Node.js greenwash-engine.js to Python."""

def calculate_greenwash_signals(company_data: dict) -> dict:
    scope1_mt = company_data.get('scope1_mt')
    scope2_location_mt = company_data.get('scope2_location_mt')
    scope2_market_mt = company_data.get('scope2_market_mt')
    scope3_mt = company_data.get('scope3_mt')
    has_scope3_net_zero_target = company_data.get('has_scope3_net_zero_target', False)
    target_type = company_data.get('target_type', 'ABSOLUTE')
    absolute_emissions_trend = company_data.get('absolute_emissions_trend', 'FLAT')
    verification_body = company_data.get('verification_body')
    facilities = company_data.get('facilities', [])
    sector_median_scope1 = company_data.get('sector_median_scope1', 1000000)

    # Signal 1: Scope 2 Dual Reporting Gap
    scope2_gap_pct = None
    if scope2_market_mt is not None and scope2_location_mt is not None and scope2_location_mt > 0:
        scope2_gap_pct = ((scope2_location_mt - scope2_market_mt) / scope2_location_mt) * 100

    s1_rec_reliance = {
        'level': 'ACCEPTABLE', 'severity': 'LOW', 'gap_pct': scope2_gap_pct
    }
    if scope2_gap_pct is not None and scope2_gap_pct > 10:
        s1_rec_reliance['level'] = 'ELEVATED'
        s1_rec_reliance['severity'] = 'HIGH' if scope2_gap_pct > 30 else 'MEDIUM'

    # Signal 2: Scope 3 Coverage Gap
    total_emissions = (scope1_mt or 0) + (scope2_location_mt or 0) + (scope3_mt or 0)
    scope3_ratio = (scope3_mt / total_emissions) if total_emissions > 0 and scope3_mt is not None else 0
    
    s2_scope3_gap = { 'level': 'ACCEPTABLE', 'severity': 'LOW' }
    if scope3_ratio > 0.90 and not has_scope3_net_zero_target:
        s2_scope3_gap = { 'level': 'OUTSOURCING_EMISSIONS_FLAG', 'ratio_pct': scope3_ratio * 100, 'severity': 'HIGH' }

    # Signal 3: Absolute vs Intensity Target
    s3_intensity_only = { 'level': 'ACCEPTABLE', 'severity': 'LOW' }
    if target_type == 'INTENSITY' and absolute_emissions_trend == 'RISING':
        s3_intensity_only = { 'level': 'WEAK_TARGETING', 'note': 'Intensity target masks absolute emission growth', 'severity': 'MEDIUM' }

    # Signal 4: Verification Gap
    s4_no_assurance = { 'level': 'VERIFIED', 'provider': verification_body, 'severity': 'LOW' }
    if not verification_body:
        s4_no_assurance = { 'level': 'UNVERIFIED', 'note': 'No third-party assurance declared', 'severity': 'MEDIUM' }

    # Signal 5: Satellite Divergence
    affected_facilities = [
        f for f in facilities 
        if f.get('no2_verdict') == 'CRITICALLY_HIGH' and scope1_mt is not None and scope1_mt < sector_median_scope1
    ]
    
    s5_satellite = { 'level': 'CONSISTENT', 'severity': 'LOW' }
    if len(affected_facilities) > 0:
        s5_satellite = { 'level': 'SATELLITE_DIVERGENCE', 'affected_facilities': affected_facilities, 'severity': 'CRITICAL' }

    def get_weight(s):
        sev = s.get('severity') or s.get('level')
        weights = {'HIGH': 3, 'MEDIUM': 2, 'LOW': 0, 'ACCEPTABLE': 0, 'CRITICAL': 4}
        return weights.get(sev, 0)

    signals = [s1_rec_reliance, s2_scope3_gap, s3_intensity_only, s4_no_assurance, s5_satellite]
    total_weight = sum(get_weight(s) for s in signals)

    greenwash_risk = 'LOW'
    if total_weight >= 8:
        greenwash_risk = 'CRITICAL'
    elif total_weight >= 5:
        greenwash_risk = 'HIGH'
    elif total_weight >= 2:
        greenwash_risk = 'MEDIUM'

    return {
        'greenwash_risk': greenwash_risk,
        'signals': [
            { 'name': "Scope 2 RECs Reliance", **s1_rec_reliance },
            { 'name': "Scope 3 Boundaries", **s2_scope3_gap },
            { 'name': "Target Type Quality", **s3_intensity_only },
            { 'name': "Verification Status", **s4_no_assurance },
            { 'name': "Satellite Alignment", **s5_satellite }
        ],
        'composite_score': total_weight
    }
