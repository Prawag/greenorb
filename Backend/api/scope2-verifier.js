// Official Indian Grid Emission Factors — CEA v20.0, December 2024
const CEA_FACTOR = 0.758;      // tCO2e/MWh — standard grid
const CEA_FACTOR_RE = 0.861;   // tCO2e/MWh — solar/wind
const UCR_FACTOR = 0.736;      // tCO2e/MWh — conservative UCR

export default async (req, res) => {
  try {
    const { electricity_mwh, reported_scope2, method } = req.query;

    if (!electricity_mwh || !reported_scope2) {
      return res.status(400).json({ error: 'electricity_mwh and reported_scope2 are required query params' });
    }

    const consumed = parseFloat(electricity_mwh);
    const reported = parseFloat(reported_scope2);

    if (isNaN(consumed) || isNaN(reported) || consumed <= 0) {
      return res.status(400).json({ error: 'Invalid numeric values' });
    }

    const factor = method === 're' ? CEA_FACTOR_RE : method === 'ucr' ? UCR_FACTOR : CEA_FACTOR;
    const expected = parseFloat((consumed * factor).toFixed(2));
    const discrepancy = parseFloat(Math.abs(reported - expected).toFixed(2));
    const discrepancy_pct = parseFloat(((discrepancy / expected) * 100).toFixed(1));
    const flagged = discrepancy_pct > 5.0;

    res.json({
      data: {
        electricity_consumed_mwh: consumed,
        reported_scope2_tco2e: reported,
        expected_scope2_tco2e: expected,
        discrepancy_tco2e: discrepancy,
        discrepancy_pct,
        emission_factor_used: factor,
        factor_source: 'CEA CO2 Baseline Database v20.0 (December 2024)',
        flagged,
        verdict: flagged ? 'DISCREPANCY_DETECTED' : 'VERIFIED',
        warning: flagged ? 'Reported Scope 2 deviates >5% from CEA-calculated expected value. Check if RECs or offsets were incorrectly netted against gross emissions.' : null,
      },
      cached_at: new Date().toISOString(),
      stale: false,
      source: 'CEA v20.0',
      ttl: 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
