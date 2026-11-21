"""Metric catalogue and row-label recognition.

Keep the keys in sync with Backend/src/metrics.js and the CHECK constraint on esg.metrics.
"""
from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class MetricDef:
    key: str
    label: str
    family: str      # ghg | energy | water | waste | pct
    unit: str


METRICS: dict[str, MetricDef] = {
    m.key: m
    for m in [
        MetricDef("ghg_scope1", "Scope 1 emissions", "ghg", "tCO2e"),
        MetricDef("ghg_scope2_location", "Scope 2 emissions (location-based)", "ghg", "tCO2e"),
        MetricDef("ghg_scope2_market", "Scope 2 emissions (market-based)", "ghg", "tCO2e"),
        MetricDef("ghg_scope2", "Scope 2 emissions", "ghg", "tCO2e"),
        MetricDef("ghg_scope3", "Scope 3 emissions", "ghg", "tCO2e"),
        MetricDef("ghg_scope12_total", "Scope 1 + 2 emissions (reported total)", "ghg", "tCO2e"),
        MetricDef("energy_total", "Total energy consumption", "energy", "MWh"),
        MetricDef("energy_renewable_pct", "Renewable energy share", "pct", "%"),
        MetricDef("water_withdrawal", "Water withdrawal", "water", "m3"),
        MetricDef("water_consumption", "Water consumption", "water", "m3"),
        MetricDef("waste_generated", "Waste generated", "waste", "t"),
    ]
}

# Labels that describe ratios, targets, changes or sub-categories, never an absolute total.
_NOT_ABSOLUTE = re.compile(
    r"intensity|\bper\b|/\s*(?:employee|unit|revenue|turnover|tonne|ton|crore|million|mn|usd|inr|₹|m2|sq)|"
    r"\breduction|\btarget|\bgoal|\bbaseline|\bavoided|\bsaved|\bsavings|\boffset|% ?change|\bchange\b|"
    r"\bbiogenic|\bremovals?\b|\bratio\b|\bshare of\b|\bpercentage\b",
    re.I,
)
# Sub-categories of Scope 3 (we only want the total).
_SCOPE3_CATEGORY = re.compile(
    r"category\s*\d|\bcat\.?\s*\d|purchased goods|capital goods|fuel[- ]and[- ]energy|transportation and distribution|"
    r"waste generated in operations|business travel|commut|leased assets|processing of sold|use of sold|end[- ]of[- ]life|franchis|investments",
    re.I,
)

_S1 = re.compile(r"scope\s*[-–]?\s*(?:1|i|one)\b(?!\s*(?:and|&|\+|,|/)\s*(?:scope\s*)?(?:2|ii|two)\b)|\bdirect\s+(?:ghg\s+)?emissions", re.I)
_S2 = re.compile(r"scope\s*[-–]?\s*(?:2|ii|two)\b(?!\s*(?:and|&|\+|,|/)\s*(?:scope\s*)?(?:3|iii|three)\b)|indirect\s+(?:ghg\s+)?emissions\s+from\s+(?:purchased\s+)?(?:energy|electricity)|emissions\s+from\s+purchased\s+electricity", re.I)
_S3 = re.compile(r"scope\s*[-–]?\s*(?:3|iii|three)\b|other\s+indirect\s+\(?(?:scope\s*3\)?\s*)?ghg\s+emissions|value[- ]chain\s+emissions|emissions\s+from\s+indirect\s+sources", re.I)
_S12 = re.compile(r"scope\s*[-–]?\s*(?:1|i)\s*(?:and|&|\+|,|/)\s*(?:scope\s*)?[-–]?\s*(?:2|ii)\b", re.I)
_S123 = re.compile(r"scope\s*(?:1|i)\s*(?:,|and|&|\+)\s*(?:scope\s*)?(?:2|ii)\s*(?:,|and|&|\+)\s*(?:scope\s*)?(?:3|iii)", re.I)
_LOCATION = re.compile(r"location[- ]?based", re.I)
_MARKET = re.compile(r"market[- ]?based", re.I)
_ENERGY_TOTAL = re.compile(
    r"total\s+energy\s+(?:consumption|consumed|use|usage)|energy\s+consumption\s*\(?\s*total|"
    r"total\s+energy\s+consumption\s*\(\s*a\s*\+|^\s*total\s+energy\b|total\s+(?:primary\s+)?energy\s+(?:consumed|used)",
    re.I,
)
_ENERGY_EXCL = re.compile(r"from\s+(?:non[- ]?)?renewable|non[- ]renewable\s+sources|renewable\s+sources\s*\(|electricity\s+consumption\s*\(", re.I)
_RENEWABLE_PCT = re.compile(
    r"(?:renewable|re)\s+(?:energy|electricity)\s+(?:share|percentage|%)|%\s+(?:of\s+)?renewable|share\s+of\s+renewable|"
    r"renewable\s+energy\s*\(\s*%|percentage\s+of\s+renewable|%\s*of\s+(?:total\s+)?energy\s+(?:consumed\s+|consumption\s+)?from\s+renewable",
    re.I,
)
_WATER_WITHDRAWAL = re.compile(r"total\s+(?:volume\s+of\s+)?water\s+withdrawa?l|water\s+withdrawa?l\s*\(?\s*total|total\s+water\s+withdrawn|water\s+withdrawn\s*\(\s*total", re.I)
_WATER_CONSUMPTION = re.compile(r"total\s+(?:volume\s+of\s+)?water\s+consumption|water\s+consumption\s*\(?\s*total|total\s+water\s+consumed", re.I)
_WATER_EXCL = re.compile(r"\bsurface\b|\bground\s*water\b|third[- ]party|\bseawater\b|desalinated|\bothers?\b\s*\(", re.I)
_WASTE_TOTAL = re.compile(r"total\s+waste\s+generated|waste\s+generated\s*\(?\s*total|total\s+(?:amount\s+of\s+)?waste\b(?!\s+(?:recovered|disposed|recycled|diverted))", re.I)
_BRSR_WASTE_TOTAL = re.compile(r"^\s*total\s*\(\s*a\s*\+\s*b\s*\+\s*c", re.I)


def match_metric(label: str, page_context: str = "") -> str | None:
    """Map a row label (possibly spanning wrapped lines) to a metric key, or None."""
    t = re.sub(r"\s+", " ", label).strip()
    if not t or len(t) > 400:
        return None
    if _S123.search(t):
        return None  # Scope 1+2+3 combined totals are not stored
    if _S12.search(t):
        return None if _NOT_ABSOLUTE.search(t) else "ghg_scope12_total"
    if _NOT_ABSOLUTE.search(t) and not _RENEWABLE_PCT.search(t):
        return None
    if _S1.search(t) and not _S2.search(t) and not _S3.search(t):
        return "ghg_scope1"
    if _S2.search(t) and not _S3.search(t):
        if _LOCATION.search(t):
            return "ghg_scope2_location"
        if _MARKET.search(t):
            return "ghg_scope2_market"
        return "ghg_scope2"
    if _S3.search(t) and not _SCOPE3_CATEGORY.search(t):
        return "ghg_scope3"
    if _RENEWABLE_PCT.search(t):
        return "energy_renewable_pct"
    if _ENERGY_TOTAL.search(t) and not _ENERGY_EXCL.search(t):
        return "energy_total"
    if _WATER_WITHDRAWAL.search(t) and not _WATER_EXCL.search(t):
        return "water_withdrawal"
    if _WATER_CONSUMPTION.search(t) and not _WATER_EXCL.search(t):
        return "water_consumption"
    if _WASTE_TOTAL.search(t):
        return "waste_generated"
    if _BRSR_WASTE_TOTAL.search(t) and re.search(r"waste\s+generated", page_context, re.I):
        return "waste_generated"
    return None


# Keywords used to rank pages before LLM extraction.
PAGE_KEYWORDS = {
    "ghg": [r"scope\s*1", r"scope\s*2", r"scope\s*3", r"tco2", r"co2e", r"ghg", r"greenhouse", r"emissions"],
    "energy": [r"energy consumption", r"\bgj\b", r"\bmwh\b", r"\bgwh\b", r"joule", r"renewable"],
    "water": [r"water withdrawal", r"water consumption", r"\bkl\b", r"kilolit", r"\bm3\b", r"megalit"],
    "waste": [r"waste generated", r"hazardous waste", r"tonnes", r"metric tons"],
}
