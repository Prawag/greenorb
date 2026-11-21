"""LangChain tool wrapper for PDF processing + LLM extraction."""
import json
from langchain.tools import tool
from loguru import logger
from modules.pdf_parser import parse_pdf_full
from modules.chunker import create_chunks
from modules.llm_extractor import extract_all_from_document, classify_document


@tool
def process_esg_pdf(pdf_local_path: str) -> str:
    """Parse an ESG PDF, extract text and tables, chunk it, and run LLM extraction.
    Input: local file path to the downloaded PDF.
    Returns: JSON summary of extracted ESG metrics."""
    logger.info(f"[TOOL] process_esg_pdf called for: {pdf_local_path}")

    # Step 1: Parse PDF
    text_blocks = parse_pdf_full(pdf_local_path)
    if not text_blocks:
        return f"No text extracted from {pdf_local_path}"

    # Step 2: Classify document
    first_text = " ".join([b["text"] for b in text_blocks[:3]])
    classification = classify_document(first_text)

    # Step 3: Chunk
    chunks = create_chunks(text_blocks)
    logger.info(f"Created {len(chunks)} chunks from {len(text_blocks)} text blocks")

    # Step 4: LLM extraction
    extraction_results = extract_all_from_document(chunks)

    # Collect all metrics
    all_metrics = []
    for result in extraction_results:
        for m in result.metrics:
            all_metrics.append({
                "metric_name": m.metric_name,
                "category": m.category.value,
                "value": m.value,
                "value_text": m.value_text,
                "unit": m.unit,
                "year_reported": m.year_reported,
                "confidence": m.confidence
            })

    summary = {
        "pdf_path": pdf_local_path,
        "classification": classification.report_type,
        "classification_confidence": classification.confidence,
        "total_pages": len(text_blocks),
        "total_chunks": len(chunks),
        "total_metrics_extracted": len(all_metrics),
        "metrics": all_metrics
    }

    return json.dumps(summary, indent=2, default=str)
