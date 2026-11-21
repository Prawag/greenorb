"""LangChain tool wrapper for database storage operations."""
import json
from langchain.tools import tool
from loguru import logger
from urllib.parse import urlparse

from core.database import SessionLocal
from modules.pdf_parser import parse_pdf_full
from modules.chunker import create_chunks
from modules.llm_extractor import extract_all_from_document, classify_document
from modules.storage import (
    get_or_create_company, create_document,
    save_chunks_with_embeddings, save_esg_values
)


@tool
def process_and_store_report(
    company_name: str,
    company_domain: str,
    pdf_local_path: str,
    pdf_source_url: str,
    pdf_title: str,
    content_hash: str
) -> str:
    """Parse a downloaded ESG PDF, extract metrics with LLM, embed chunks,
    and store everything in the database.
    All inputs are required strings."""
    logger.info(f"[TOOL] process_and_store_report called for: {company_name} — {pdf_title}")
    db = SessionLocal()
    try:
        # 1. Get or create company
        company = get_or_create_company(db, name=company_name, domain=company_domain)

        # 2. Parse PDF
        text_blocks = parse_pdf_full(pdf_local_path)
        if not text_blocks:
            return f"No text extracted from {pdf_local_path}"

        # 3. Classify document
        first_text = " ".join([b["text"] for b in text_blocks[:3]])
        classification = classify_document(first_text)

        # 4. Create document record
        doc = create_document(
            db=db,
            company_id=company.id,
            url=pdf_source_url,
            title=pdf_title,
            report_type=classification.report_type,
            local_path=pdf_local_path,
            content_hash=content_hash
        )
        if not doc:
            return f"Failed to create document record for {pdf_title}"

        # 5. Chunk and embed
        chunks = create_chunks(text_blocks)
        chunks_saved = save_chunks_with_embeddings(db, doc.id, chunks)

        # 6. LLM extraction
        extraction_results = extract_all_from_document(chunks)

        # 7. Save ESG values
        values_saved = save_esg_values(db, doc.id, company.id, extraction_results)

        total_metrics = sum(len(r.metrics) for r in extraction_results)

        return (
            f"Successfully processed '{pdf_title}' for {company_name}:\n"
            f"- Document type: {classification.report_type} (confidence: {classification.confidence:.2f})\n"
            f"- Text blocks: {len(text_blocks)}\n"
            f"- Chunks embedded: {chunks_saved}\n"
            f"- Metrics extracted: {total_metrics}\n"
            f"- Metrics saved (confidence >= 0.5): {values_saved}"
        )
    except Exception as e:
        logger.error(f"process_and_store_report failed: {e}")
        db.rollback()
        return f"Error processing report: {str(e)}"
    finally:
        db.close()
