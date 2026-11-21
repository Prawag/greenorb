"""Use Claude with Instructor to extract structured ESG metrics."""
import instructor
from anthropic import Anthropic
from typing import List
from loguru import logger

from core.config import settings
from schemas.esg_metrics import ESGExtractionResult, DocumentClassification

raw_client = Anthropic(api_key=settings.anthropic_api_key)
client = instructor.from_anthropic(raw_client)

EXTRACTION_SYSTEM_PROMPT = """You are an elite Carbon and ESG Analyst specializing in GHG Protocol and Scope 1, 2, and 3 emissions.

Your task is to extract STRICTLY numeric carbon and emissions data from the provided text chunk.

EXTRACTION RULES:
1. Extract ONLY values that are explicitly stated. Do NOT infer or calculate.
2. If a number says "1.5 million", you must extract 1500000. Pay close attention to scale words (thousands, millions).
3. If the text says "Scope 1 emissions were 5,000", extract 5000. Do NOT hallucinate zeroes.
4. You MUST extract the exact year the metric applies to. If multiple years are shown, extract each as a separate metric.
5. Units: ALWAYS normalize to standard forms (e.g., tCO2e, Metric Tons CO2e, MTCO2e).
6. Provide the EXACT source sentence or table row text so the data can be audited.
7. Confidence: 1.0 = exact numeric value stated; 0.7 = inferred from table context; 0.5 = ambiguous unit or year.
8. NEVER HALLUCINATE. If there are no concrete Carbon/Emissions numbers on this page, return an empty list.

METRIC FOCUS:
- Scope 1 GHG Emissions
- Scope 2 GHG Emissions (Location-based or Market-based)
- Scope 3 GHG Emissions
- Total Carbon Footprint / Total Emissions
- Carbon Intensity / GHG Intensity"""

CLASSIFICATION_SYSTEM_PROMPT = """You are an expert at classifying corporate sustainability documents.
Classify the document excerpt into one of:
- sustainability_report: Dedicated ESG/sustainability/CSR report
- annual_report: Annual financial report with some ESG content
- csr_report: Corporate Social Responsibility report
- tcfd_report: Task Force on Climate-related Financial Disclosures report
- press_release: News release about sustainability initiatives
- other: Anything else
"""


def extract_esg_from_chunk(chunk_text: str, chunk_page: int = 0) -> ESGExtractionResult:
    """Send a chunk to Claude and get back structured ESGExtractionResult."""
    try:
        result = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            system=EXTRACTION_SYSTEM_PROMPT,
            messages=[{
                "role": "user",
                "content": f"Extract all ESG metrics from this text (from approximately page {chunk_page}):\n\n{chunk_text}"
            }],
            response_model=ESGExtractionResult,
        )
        logger.debug(f"Extracted {len(result.metrics)} metrics from page {chunk_page} chunk")
        return result
    except Exception as e:
        logger.warning(f"LLM extraction failed for page {chunk_page} chunk: {e}")
        return ESGExtractionResult(metrics=[])


def classify_document(text_sample: str) -> DocumentClassification:
    """Classify the document type using first ~2000 chars."""
    try:
        result = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=200,
            system=CLASSIFICATION_SYSTEM_PROMPT,
            messages=[{
                "role": "user",
                "content": f"Classify this document excerpt:\n\n{text_sample[:2000]}"
            }],
            response_model=DocumentClassification,
        )
        return result
    except Exception as e:
        logger.warning(f"Document classification failed: {e}")
        return DocumentClassification(
            report_type="other",
            confidence=0.0,
            reasoning="Classification failed due to API error."
        )


def extract_all_from_document(chunks: List[dict]) -> List[ESGExtractionResult]:
    """Run extraction on all chunks. Returns list of results (one per chunk)."""
    results = []
    for chunk in chunks:
        result = extract_esg_from_chunk(
            chunk_text=chunk["chunk_text"],
            chunk_page=chunk.get("page_number", 0)
        )
        results.append(result)
    return results
