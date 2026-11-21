-- Launch: public numbers come only from figures read from a report page.
-- v3 imports (no page, possibly 1000x unit errors) are kept but no longer drive the directory,
-- disclosure scores, the map or the overview. Their "legacy data" notes are closed so the review
-- queue shows real findings.

DROP VIEW IF EXISTS esg.company_summary;
CREATE VIEW esg.company_summary AS
WITH latest_year AS (
  -- Only figures read from a report page count. v3 imports without sources stay on their report
  -- page (marked unverified) but no longer feed directory values, scores or the map.
  SELECT company_id, max(fiscal_year) AS fiscal_year
  FROM esg.metrics
  WHERE status <> 'rejected' AND method <> 'legacy' AND value IS NOT NULL AND metric LIKE 'ghg_%'
  GROUP BY company_id
),
latest AS (
  -- Best sourced value per metric for that year (the primary one unless the primary is a v3 import).
  SELECT DISTINCT ON (m.company_id, m.metric) m.company_id, m.metric, m.value, m.confidence, m.method
  FROM esg.metrics m
  JOIN latest_year ly ON ly.company_id = m.company_id AND ly.fiscal_year = m.fiscal_year
  WHERE m.status <> 'rejected' AND m.method <> 'legacy' AND m.value IS NOT NULL
  ORDER BY m.company_id, m.metric, m.is_primary DESC, (m.status = 'verified') DESC, m.confidence DESC, m.id DESC
),
pivot AS (
  SELECT company_id,
    max(value) FILTER (WHERE metric = 'ghg_scope1')          AS scope1,
    max(value) FILTER (WHERE metric = 'ghg_scope2_location') AS scope2_location,
    max(value) FILTER (WHERE metric = 'ghg_scope2_market')   AS scope2_market,
    max(value) FILTER (WHERE metric = 'ghg_scope2')          AS scope2_unspecified,
    max(value) FILTER (WHERE metric = 'ghg_scope3')          AS scope3,
    max(value) FILTER (WHERE metric = 'ghg_scope12_total')   AS scope12_total,
    max(value) FILTER (WHERE metric = 'energy_total')        AS energy_mwh,
    max(value) FILTER (WHERE metric IN ('water_withdrawal', 'water_consumption')) AS water_m3,
    max(value) FILTER (WHERE metric = 'waste_generated')     AS waste_t,
    avg(confidence)                                          AS avg_confidence,
    bool_or(method = 'legacy')                               AS has_legacy
  FROM latest
  GROUP BY company_id
),
latest_report AS (
  SELECT DISTINCT ON (company_id) company_id, id AS report_id, assurance_level, fiscal_year, status
  FROM esg.reports
  WHERE status = 'processed'
  ORDER BY company_id, fiscal_year DESC NULLS LAST, processed_at DESC NULLS LAST, id DESC
),
open_flags AS (
  SELECT company_id,
    count(*) FILTER (WHERE status = 'open')                                AS open_flags,
    count(*) FILTER (WHERE status = 'open' AND severity IN ('high','medium')) AS open_material_flags,
    count(*) FILTER (WHERE status = 'confirmed')                           AS confirmed_flags
  FROM esg.flags GROUP BY company_id
),
report_counts AS (
  SELECT company_id, count(*) AS report_count FROM esg.reports GROUP BY company_id
)
SELECT
  c.id AS company_id,
  ly.fiscal_year AS latest_year,
  p.scope1,
  coalesce(p.scope2_market, p.scope2_location, p.scope2_unspecified) AS scope2,
  p.scope2_location,
  p.scope2_market,
  p.scope3,
  coalesce(p.scope12_total, CASE WHEN p.scope1 IS NOT NULL AND coalesce(p.scope2_market, p.scope2_location, p.scope2_unspecified) IS NOT NULL
    THEN p.scope1 + coalesce(p.scope2_market, p.scope2_location, p.scope2_unspecified) END) AS scope12,
  p.energy_mwh,
  p.water_m3,
  p.waste_t,
  round(p.avg_confidence::numeric, 2)::double precision AS data_confidence,
  EXISTS (SELECT 1 FROM esg.metrics lm WHERE lm.company_id = c.id AND lm.method = 'legacy') AS has_legacy_data,
  lr.report_id AS latest_report_id,
  coalesce(lr.assurance_level, 'unknown') AS assurance_level,
  coalesce(rc.report_count, 0) AS report_count,
  coalesce(f.open_flags, 0) AS open_flags,
  coalesce(f.open_material_flags, 0) AS open_material_flags,
  coalesce(f.confirmed_flags, 0) AS confirmed_flags,
  CASE WHEN ly.fiscal_year IS NULL THEN NULL ELSE (
      (CASE WHEN p.scope1 IS NOT NULL THEN 20 ELSE 0 END)
    + (CASE WHEN coalesce(p.scope2_market, p.scope2_location, p.scope2_unspecified) IS NOT NULL THEN 20 ELSE 0 END)
    + (CASE WHEN p.scope1 IS NULL AND coalesce(p.scope2_market, p.scope2_location, p.scope2_unspecified) IS NULL
             AND p.scope12_total IS NOT NULL THEN 20 ELSE 0 END)
    + (CASE WHEN p.scope3 IS NOT NULL THEN 15 ELSE 0 END)
    + (CASE WHEN p.energy_mwh IS NOT NULL THEN 10 ELSE 0 END)
    + (CASE WHEN p.water_m3 IS NOT NULL THEN 10 ELSE 0 END)
    + (CASE WHEN p.waste_t IS NOT NULL THEN 10 ELSE 0 END)
    + (CASE lr.assurance_level WHEN 'reasonable' THEN 15 WHEN 'limited' THEN 10 ELSE 0 END)
  ) END AS disclosure_score
FROM esg.companies c
LEFT JOIN latest_year ly ON ly.company_id = c.id
LEFT JOIN pivot p ON p.company_id = c.id
LEFT JOIN latest_report lr ON lr.company_id = c.id
LEFT JOIN open_flags f ON f.company_id = c.id
LEFT JOIN report_counts rc ON rc.company_id = c.id;


UPDATE esg.flags
   SET status = 'dismissed', reviewed_at = now(),
       review_note = 'Closed at launch: v3 import without sources is no longer shown. Read the original report to replace it.'
 WHERE code = 'LEGACY_UNVERIFIED' AND status = 'open';
