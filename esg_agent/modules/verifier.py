"""Verification Module: Acts as the Diligence Agent to audit extracted metrics."""
from typing import List
from loguru import logger
import instructor
from anthropic import Anthropic
from pydantic import BaseModel, Field

from core.config import settings
from schemas.esg_metrics import ESGMetricValue

raw_client = Anthropic(api_key=settings.anthropic_api_key)
client = instructor.from_anthropic(raw_client)

class VerificationResult(BaseModel):
    is_accurate: bool = Field(description="True if the metric mathematically and logically matches the source text.")
    reasoning: str = Field(description="Step-by-step reasoning for the verification decision.")

VERIFIER_PROMPT = """You are a strict, uncompromising ESG Data Auditor. 
Your job is to review a piece of extracted data against its raw source text.

You must answer ONE question:
Does the source text explicitly and unambiguously support the extracted value for the specific metric and year?

RULES:
1. If the extracted value is an inference, calculation, or hallucination, return is_accurate=False.
2. If the year does not match or is ambiguous, return is_accurate=False.
3. If the unit does not match, return is_accurate=False.
4. If it is a perfect match, return is_accurate=True.
"""

def verify_metric(metric: ESGMetricValue) -> bool:
    """Run a single metric through the Diligence Agent LLM."""
    try:
        user_msg = (
            f"Extracted Metric: {metric.metric_name}\n"
            f"Extracted Value: {metric.value} {metric.unit}\n"
            f"Extracted Year: {metric.year_reported}\n\n"
            f"Raw Source Text:\n{metric.source_text}"
        )
        
        result = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=300,
            system=VERIFIER_PROMPT,
            messages=[{"role": "user", "content": user_msg}],
            response_model=VerificationResult,
        )
        
        if not result.is_accurate:
            logger.warning(f"Verification failed for {metric.metric_name}: {result.reasoning}")
        else:
            logger.debug(f"Verification passed for {metric.metric_name}.")
            
        return result.is_accurate
    except Exception as e:
        logger.error(f"Verification LLM failed: {e}")
        return False

def verify_extraction_results(metrics: List[ESGMetricValue]) -> List[ESGMetricValue]:
    """Audit all extracted metrics and return only the ones that pass."""
    if not metrics:
        return []
        
    logger.info(f"Auditing {len(metrics)} extracted metrics through the Diligence Agent...")
    verified_metrics = []
    
    for metric in metrics:
        if verify_metric(metric):
            verified_metrics.append(metric)
            
    logger.info(f"Audit complete: {len(verified_metrics)}/{len(metrics)} metrics passed verification.")
    return verified_metrics
