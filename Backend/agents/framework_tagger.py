import json
from pathlib import Path
from functools import lru_cache

"""
Regulatory framework tagger.
Maps extracted ESG metric keys to their compliance framework indicators.
Supports BRSR (India), CSRD (EU), GRI (Global), TCFD (Climate).
"""

FRAMEWORK_MAP_PATH = Path(__file__).parent.parent / "config" / "framework_map.json"


@lru_cache(maxsize=1)
def _load_map() -> dict:
    """Load the framework mapping JSON from disk (cached)."""
    return json.loads(FRAMEWORK_MAP_PATH.read_text())


def tag_metric(metric_key: str, frameworks: list[str] = None) -> dict:
    """
    Return the regulatory framework indicators satisfied by a given metric.
    Returns {} if metric is not in the map.
    """
    if frameworks is None:
        frameworks = ["BRSR", "CSRD", "GRI"]
    framework_map = _load_map()
    if metric_key not in framework_map:
        return {}
    entry = framework_map[metric_key]
    return {fw: entry[fw] for fw in frameworks if fw in entry}


def tag_all_metrics(extracted_data: dict) -> dict:
    """
    Tag every metric in an extracted data dict.
    Returns {metric: {framework_tags}} for non-null values only.
    """
    return {
        metric: tag_metric(metric)
        for metric in extracted_data
        if metric in _load_map() and extracted_data[metric] is not None
    }
