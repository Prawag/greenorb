export async function checkAnomaly(sql, company_id, metric_name, value) {
  try {
    const rows = await sql`
      SELECT observation_count, running_mean, m2_sum 
      FROM welford_baselines 
      WHERE company_id = ${company_id} AND metric_name = ${metric_name}
    `;
    
    let count = 0, mean = 0, m2 = 0;
    if (rows.length > 0) {
      count = parseFloat(rows[0].observation_count);
      mean = parseFloat(rows[0].running_mean);
      m2 = parseFloat(rows[0].m2_sum);
    }

    count += 1;
    const delta = value - mean;
    mean += delta / count;
    const delta2 = value - mean;
    m2 += delta * delta2;

    const stdDev = count > 1 ? Math.sqrt(m2 / (count - 1)) : 0;
    const zScore = stdDev > 0 ? Math.abs(value - mean) / stdDev : 0;

    const cold_start = count < 5;
    const is_anomaly = zScore > 2.0 && !cold_start;

    await sql`
      INSERT INTO welford_baselines (company_id, metric_name, observation_count, running_mean, m2_sum, last_updated)
      VALUES (${company_id}, ${metric_name}, ${count}, ${mean}, ${m2}, NOW())
      ON CONFLICT (company_id, metric_name) DO UPDATE SET
        observation_count = EXCLUDED.observation_count,
        running_mean = EXCLUDED.running_mean,
        m2_sum = EXCLUDED.m2_sum,
        last_updated = EXCLUDED.last_updated
    `;

    return {
      is_anomaly,
      z_score: zScore,
      observation_count: count,
      cold_start,
      mean,
      std_dev: stdDev
    };
  } catch (err) {
    console.error('[Welford Engine] Array math error:', err);
    throw err;
  }
}
