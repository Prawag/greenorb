"""Deterministic unit recognition and normalisation.

Canonical units: tCO2e (GHG), MWh (energy), m3 (water), t (waste), % (shares).
Every rule is explicit and unit-tested. In particular, "MT" in Indian BRSR filings means
*metric tonnes* and is NOT read as megatonnes; only "Mt", "MMT" or "million tonnes" scale by 10^6.
"""
from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class UnitMatch:
    factor: float
    canonical: str
    label: str          # what we recognised, e.g. "million tonnes"
    ambiguous: bool = False


def _norm(s: str) -> str:
    s = s.replace("₂", "2").replace("³", "3").replace("’", "'").replace("‘", "'")
    return re.sub(r"\s+", " ", s).strip()


# Order matters: most specific first. Patterns run on the original-case text with re.I unless noted.
_GHG = [
    (r"\b(?:billion|bn)\s*(?:metric\s*)?(?:tonnes?|tons?|t)\b", 1e9, "billion tonnes"),
    (r"\bmillion\s*(?:metric\s*)?(?:tonnes?|tons?|t)\b|\bmn\s*(?:tonnes?|t)\b|\bmmt\b|\bmmtco2e?\b|\bmt\s*mn\b|\bmillion\s+tco2", 1e6, "million tonnes"),
    (r"(?:^|[^A-Za-z])Mt\s*(?:CO2|CO|of\s+CO2|e\b|\b)", 1e6, "Mt (megatonnes)"),  # case-sensitive below
    (r"\bthousand\s*(?:metric\s*)?(?:tonnes?|tons?|t)\b|\bkilo\s*-?\s*tonnes?\b|\bkt\s*co2|\bkt\b|\bktco2e?\b|\bgg\b|['’]\s*000\s*(?:metric\s*)?(?:tonnes?|tons?|t\b|tco2)|\(\s*['’]?000s?\s*\)|\b000\s*t(?:co2e?)?\b|in\s+thousands", 1e3, "thousand tonnes"),
    (r"\bshort\s*tons?\b", 0.907185, "short tons"),
    (r"\bkg\s*co2|\bkilograms?\b|\bkgco2e?\b", 1e-3, "kilograms"),
    (r"\bmetric\s*tonnes?|\bmetric\s*tons?|\btonnes?|\btons?\b|\btco2e?\b|\bt\s*co2|\bmtco2e?\b|\bmt\s*co2|\bmt\b", 1.0, "tonnes"),
]

_ENERGY = [
    (r"\bpj\b|peta\s*-?\s*joules?", 277_777.778, "PJ"),
    (r"\btj\b|tera\s*-?\s*joules?", 277.777778, "TJ"),
    (r"\bgj\b|giga\s*-?\s*joules?", 0.277777778, "GJ"),
    (r"\bmj\b|mega\s*-?\s*joules?", 0.000277777778, "MJ"),
    (r"\btwh\b|terawatt[\s-]*hours?", 1e6, "TWh"),
    (r"\bgwh\b|gigawatt[\s-]*hours?", 1e3, "GWh"),
    (r"\bmwh\b|megawatt[\s-]*hours?", 1.0, "MWh"),
    (r"\bkwh\b|kilowatt[\s-]*hours?", 1e-3, "kWh"),
    (r"\bmmbtu\b", 0.293071, "MMBtu"),
    (r"\bktoe\b", 11_630.0, "ktoe"),
    (r"\btoe\b|tonnes?\s+of\s+oil\s+equivalent", 11.63, "toe"),
    (r"\bjoules?\b(?!\s+or\s+multiples)", 2.77777778e-10, "J"),
]

_WATER = [
    (r"\bbillion\s*lit(?:re|er)s?\b", 1e6, "billion litres"),
    (r"\bmillion\s*(?:m3|cubic\s*met(?:re|er)s?)\b|\bmcm\b|\bmn\s*m3\b", 1e6, "million m3"),
    (r"\bmillion\s*gallons?\b", 3785.41, "million gallons"),
    (r"\bmegalit(?:re|er)s?\b|\bmega\s*lit(?:re|er)s?\b|\bmillion\s*lit(?:re|er)s?\b|\bML\b", 1e3, "megalitres"),  # ML case-sensitive
    (r"\bthousand\s*(?:m3|cubic\s*met(?:re|er)s?)\b|['’]\s*000\s*m3|\b000\s*m3\b|\bthousand\s*kl\b", 1e3, "thousand m3"),
    (r"\bkilo\s*-?\s*lit(?:re|er)s?\b|\bkl\b|\bm3\b|\bcubic\s*met(?:re|er)s?\b|\bcbm\b", 1.0, "m3"),
    (r"\bgallons?\b", 0.00378541, "gallons"),
    (r"\blit(?:re|er)s?\b", 1e-3, "litres"),
]

_WASTE = [
    (r"\bmillion\s*(?:metric\s*)?(?:tonnes?|tons?)\b", 1e6, "million tonnes"),
    (r"\bthousand\s*(?:metric\s*)?(?:tonnes?|tons?)\b|\bkilo\s*-?\s*tonnes?\b|\bkt\b|['’]\s*000\s*t", 1e3, "thousand tonnes"),
    (r"\bshort\s*tons?\b", 0.907185, "short tons"),
    (r"\bkg\b|\bkilograms?\b", 1e-3, "kilograms"),
    (r"\bmetric\s*tonnes?|\bmetric\s*tons?|\btonnes?|\btons?\b|\bmt\b|\bt\b", 1.0, "tonnes"),
]

FAMILIES = {
    "ghg": (_GHG, "tCO2e"),
    "energy": (_ENERGY, "MWh"),
    "water": (_WATER, "m3"),
    "waste": (_WASTE, "t"),
}

_CASE_SENSITIVE = {"Mt (megatonnes)", "megalitres"}


def match_unit(text: str | None, family: str) -> UnitMatch | None:
    """Recognise the unit for a metric family in free text (a unit cell, a label or a caption)."""
    if not text:
        return None
    if family == "pct":
        return UnitMatch(1.0, "%", "%") if "%" in text or re.search(r"percent|percentage|share", text, re.I) else None
    rules, canonical = FAMILIES[family]
    t = _norm(text)
    for pattern, factor, label in rules:
        if label in _CASE_SENSITIVE:
            # "Mt" = megatonnes but "MT" = metric tonnes; "ML" = megalitres but "ml" = millilitres.
            if label == "megalitres":
                if re.search(r"megalit|mega\s*lit|million\s*lit", t, re.I) or re.search(r"\bML\b", t):
                    return UnitMatch(factor, canonical, label)
                continue
            if re.search(pattern, t):
                return UnitMatch(factor, canonical, label)
            continue
        if re.search(pattern, t, re.I):
            ambiguous = family == "ghg" and label == "tonnes" and re.search(r"\bMT\b", t) is not None and not re.search(r"metric", t, re.I)
            return UnitMatch(factor, canonical, label, ambiguous=ambiguous)
    return None


def scale_words(text: str | None) -> float:
    """Multiplier implied by scale words attached to a value or caption ("in millions", "lakh")."""
    if not text:
        return 1.0
    t = text.lower()
    if re.search(r"\bin\s+millions?\b|\(\s*millions?\s*\)", t):
        return 1e6
    if re.search(r"\bin\s+thousands?\b|\(\s*thousands?\s*\)", t):
        return 1e3
    return 1.0


# Plausibility bounds on normalised values (largest emitters are ~10^9 tCO2e incl. Scope 3).
BOUNDS = {
    "tCO2e": (0.0, 5e9),
    "MWh": (0.0, 5e9),
    "m3": (0.0, 5e11),
    "t": (0.0, 5e9),
    "%": (0.0, 100.0),
}


def plausible(value: float, canonical: str) -> bool:
    lo, hi = BOUNDS.get(canonical, (float("-inf"), float("inf")))
    return lo <= value <= hi
