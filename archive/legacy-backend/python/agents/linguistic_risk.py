"""
ClimateBERT linguistic greenwashing detector.
Model: climatebert/distilroberta-base-climate-detector
Classifies ESG text sentences as factual climate statements vs vague/evasive language.
Runs locally — no API calls, no cost, no quota.
"""

import re
import logging
from functools import lru_cache

logger = logging.getLogger("linguistic_risk")
MODEL_ID = "climatebert/distilroberta-base-climate-detector"


@lru_cache(maxsize=1)
def _load_classifier():
    """Load model once, cache in memory. Downloads ~250MB on first run."""
    try:
        from transformers import pipeline
        logger.info(f"Loading ClimateBERT model: {MODEL_ID}")
        return pipeline(
            "text-classification",
            model=MODEL_ID,
            device=-1  # CPU — change to 0 for GPU if available
        )
    except ImportError:
        logger.warning("transformers/torch not installed — ClimateBERT disabled")
        return None
    except Exception as e:
        logger.error(f"Failed to load ClimateBERT: {e}")
        return None


def split_into_sentences(text: str, max_sentences: int = 50) -> list[str]:
    """Simple sentence splitter. Limits to first N sentences for performance."""
    sentences = re.split(r'(?<=[.!?])\s+', text)
    # Filter: only sentences likely to contain ESG claims (20–200 chars)
    filtered = [s.strip() for s in sentences if 20 < len(s.strip()) < 200]
    return filtered[:max_sentences]


def analyze_claims(sentences: list[str]) -> list[dict]:
    """
    Run ClimateBERT on a list of sentences.
    Returns list of {sentence, label, confidence, greenwashing_risk}
    label: "climate" = factual statement, "not_climate" = vague/evasive
    """
    if not sentences:
        return []

    classifier = _load_classifier()
    if classifier is None:
        logger.warning("ClimateBERT not available — returning empty results")
        return []

    results = []
    try:
        outputs = classifier(sentences, truncation=True, max_length=128)
    except Exception as e:
        logger.error(f"ClimateBERT inference failed: {e}")
        return []

    for sentence, output in zip(sentences, outputs):
        label      = output["label"].lower()
        confidence = round(output["score"], 3)

        # Flag as greenwashing risk if the model is confident it's NOT a factual claim
        if label == "not_climate" and confidence > 0.75:
            risk = "HIGH"
        elif label == "not_climate" and confidence > 0.60:
            risk = "MEDIUM"
        else:
            risk = "LOW"

        results.append({
            "sentence":         sentence,
            "label":            label,
            "confidence":       confidence,
            "greenwashing_risk": risk
        })

    return results


def extract_high_risk_claims(text: str) -> list[dict]:
    """
    Convenience function: split text → classify → return only HIGH/MEDIUM risks.
    Use this in the risk_agent pipeline.
    """
    sentences = split_into_sentences(text)
    all_results = analyze_claims(sentences)
    return [r for r in all_results if r["greenwashing_risk"] in ("HIGH", "MEDIUM")]
