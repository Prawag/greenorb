"""
Sector baseline greenwashing detector.
Principle: What a company DOESN'T say is as informative as what it does say.
If 70%+ of sector peers disclose a metric but this company omits it, that IS a signal.
No LLM required — pure statistical comparison against the sector DB.
"""

import logging

logger = logging.getLogger("absence_detector")

ABSENCE_THRESHOLD = 0.70  # Flag if 70%+ of peers report it but this company doesn't
HIGH_SEVERITY_THRESHOLD = 0.85

METRIC_LABELS = {
    "scope_1":            "Scope 1 (direct) emissions",
    "scope_2":            "Scope 2 (energy indirect) emissions",
    "scope_3":            "Scope 3 (value chain) emissions",
    "energy_consumption": "Total energy consumption",
    "water_withdrawal":   "Water withdrawal volume",
    "waste_generated":    "Total waste generated",
    "renewable_energy_pct": "Renewable energy percentage",
}


def build_sector_baseline(sector: str, db_conn) -> dict:
    """Calculate disclosure rates for each metric across all companies in this sector."""
    cursor = db_conn.cursor()
    cursor.execute("""
        SELECT
            COUNT(*)                                                      AS total,
            SUM(CASE WHEN scope_1             IS NOT NULL THEN 1 ELSE 0 END) AS s1,
            SUM(CASE WHEN scope_2             IS NOT NULL THEN 1 ELSE 0 END) AS s2,
            SUM(CASE WHEN scope_3             IS NOT NULL THEN 1 ELSE 0 END) AS s3,
            SUM(CASE WHEN energy_consumption  IS NOT NULL THEN 1 ELSE 0 END) AS en,
            SUM(CASE WHEN water_withdrawal    IS NOT NULL THEN 1 ELSE 0 END) AS ww,
            SUM(CASE WHEN waste_generated     IS NOT NULL THEN 1 ELSE 0 END) AS wg,
            SUM(CASE WHEN renewable_energy_pct IS NOT NULL THEN 1 ELSE 0 END) AS re
        FROM companies WHERE sector = %s
    """, (sector,))
    row = cursor.fetchone()
    total = max(row[0], 1)
    return {
        "scope_1":             row[1] / total,
        "scope_2":             row[2] / total,
        "scope_3":             row[3] / total,
        "energy_consumption":  row[4] / total,
        "water_withdrawal":    row[5] / total,
        "waste_generated":     row[6] / total,
        "renewable_energy_pct": row[7] / total,
    }


def detect_absence_signals(company_data: dict, sector: str, db_conn) -> list[dict]:
    """
    Compare a company's disclosures to sector baseline.
    Returns list of absence signals — each is a greenwashing risk flag.
    """
    if not sector:
        return []

    try:
        baseline = build_sector_baseline(sector, db_conn)
    except Exception as e:
        logger.error(f"Baseline query failed for sector {sector}: {e}")
        return []

    signals = []
    for metric, peer_rate in baseline.items():
        if peer_rate < ABSENCE_THRESHOLD:
            continue  # Most peers don't report this either — not suspicious
        if company_data.get(metric) is not None:
            continue  # Company does report this — no signal

        severity = "HIGH" if peer_rate >= HIGH_SEVERITY_THRESHOLD else "MEDIUM"
        signals.append({
            "signal_type": "ABSENT_DISCLOSURE",
            "metric":      metric,
            "metric_label": METRIC_LABELS.get(metric, metric),
            "peer_rate":   round(peer_rate * 100, 1),
            "severity":    severity,
            "brsr_flag":   metric in ("scope_1", "scope_2", "energy_consumption"),
            "message": (
                f"{round(peer_rate * 100)}% of {sector} companies disclose "
                f"{METRIC_LABELS.get(metric, metric)}, but this report omits it. "
                f"Undisclosed metrics in majority-reporting sectors are a "
                f"{'high' if severity == 'HIGH' else 'medium'}-risk greenwashing indicator."
            )
        })

    return sorted(signals, key=lambda s: s["peer_rate"], reverse=True)
