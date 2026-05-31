"""Storage Module: Write/read companies, documents, chunks, embeddings, and ESG values."""
import uuid
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import text
from loguru import logger

from core.database import SessionLocal
from core.models import Company, Document, Metric, EsgValue, DocumentChunk
from schemas.esg_metrics import ESGExtractionResult, ESGMetricValue
from modules.embedder import embed_texts, embed_query


def get_or_create_company(db: Session, name: str, domain: str,
                          industry: str = None, country: str = None) -> Company:
    company = db.query(Company).filter(Company.domain == domain).first()
    if not company:
        company = Company(
            id=uuid.uuid4(),
            name=name,
            domain=domain,
            industry=industry,
            country=country
        )
        db.add(company)
        db.commit()
        db.refresh(company)
        logger.info(f"Created company: {name}")
    return company


def create_document(db: Session, company_id: uuid.UUID, url: str,
                    title: str, report_type: str, local_path: str,
                    content_hash: str, date_published=None) -> Optional[Document]:
    existing = db.query(Document).filter(
        Document.company_id == company_id,
        Document.content_hash == content_hash
    ).first()
    if existing:
        logger.info(f"Document already exists (hash match): {title}")
        return existing
    doc = Document(
        id=uuid.uuid4(),
        company_id=company_id,
        url=url,
        title=title,
        report_type=report_type,
        local_path=local_path,
        content_hash=content_hash,
        date_published=date_published
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


def save_chunks_with_embeddings(db: Session, document_id: uuid.UUID,
                                chunks: List[dict]) -> int:
    if not chunks:
        return 0
    texts = [c["chunk_text"] for c in chunks]
    embeddings = embed_texts(texts)
    records = []
    for chunk, embedding in zip(chunks, embeddings):
        record = DocumentChunk(
            id=uuid.uuid4(),
            document_id=document_id,
            chunk_index=chunk["chunk_index"],
            chunk_text=chunk["chunk_text"],
            page_number=chunk.get("page_number", 0),
            embedding=embedding
        )
        records.append(record)
    db.bulk_save_objects(records)
    db.commit()
    logger.info(f"Saved {len(records)} chunks with embeddings for document {document_id}")
    return len(records)


def get_metric_by_name(db: Session, metric_name: str) -> Optional[Metric]:
    metric = db.query(Metric).filter(
        Metric.metric_name.ilike(f"%{metric_name}%")
    ).first()
    return metric


def save_esg_values(db: Session, document_id: uuid.UUID,
                    company_id: uuid.UUID,
                    extraction_results: List[ESGExtractionResult]) -> int:
    saved = 0
    for result in extraction_results:
        for mv in result.metrics:
            if mv.confidence < 0.5:
                continue
            metric = get_metric_by_name(db, mv.metric_name)
            if not metric:
                metric = Metric(
                    id=uuid.uuid4(),
                    category=mv.category.value,
                    framework="custom",
                    metric_name=mv.metric_name,
                    unit=mv.unit,
                    description="Auto-created from LLM extraction"
                )
                db.add(metric)
                db.flush()
            value = EsgValue(
                id=uuid.uuid4(),
                document_id=document_id,
                metric_id=metric.id,
                company_id=company_id,
                value=mv.value,
                value_text=mv.value_text,
                unit=mv.unit,
                year_reported=mv.year_reported,
                confidence=mv.confidence,
                source_text=mv.source_text,
                page_number=mv.page_hint
            )
            db.add(value)
            saved += 1
    db.commit()
    logger.info(f"Saved {saved} ESG values for document {document_id}")
    return saved


def semantic_search(db: Session, query: str, limit: int = 5) -> List[dict]:
    query_embedding = embed_query(query)
    embedding_str = "[" + ",".join(str(v) for v in query_embedding) + "]"
    sql = text("""
        SELECT
            dc.chunk_text,
            dc.page_number,
            dc.document_id,
            1 - (dc.embedding <=> :embedding::vector) AS similarity
        FROM esg_document_chunks dc
        ORDER BY dc.embedding <=> :embedding::vector
        LIMIT :limit
    """)
    rows = db.execute(sql, {"embedding": embedding_str, "limit": limit}).fetchall()
    return [
        {
            "chunk_text": r[0],
            "page_number": r[1],
            "document_id": str(r[2]),
            "similarity": float(r[3])
        }
        for r in rows
    ]


def get_company_metrics(db: Session, company_id: uuid.UUID) -> List[dict]:
    """Get all ESG values for a company with metric details."""
    results = (
        db.query(EsgValue, Metric)
        .join(Metric, EsgValue.metric_id == Metric.id)
        .filter(EsgValue.company_id == company_id)
        .order_by(Metric.category, Metric.metric_name, EsgValue.year_reported)
        .all()
    )
    return [
        {
            "id": str(ev.id),
            "category": m.category,
            "framework": m.framework,
            "metric_name": m.metric_name,
            "value": float(ev.value) if ev.value else None,
            "value_text": ev.value_text,
            "unit": ev.unit or m.unit,
            "year_reported": ev.year_reported,
            "confidence": float(ev.confidence) if ev.confidence else None,
            "source_text": ev.source_text,
            "page_number": ev.page_number,
        }
        for ev, m in results
    ]
