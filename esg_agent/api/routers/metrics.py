"""Metrics endpoints: query extracted ESG metrics and semantic search."""
import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from core.models import Company, EsgValue, Metric
from schemas.api_schemas import (
    EsgValueResponse, MetricResponse, SemanticSearchRequest, SemanticSearchResult, GlobeDataResponse
)
from modules.storage import semantic_search as db_semantic_search, get_company_metrics
import random

router = APIRouter()


@router.get("/definitions", response_model=List[MetricResponse])
def list_metric_definitions(db: Session = Depends(get_db)):
    """List all master metric definitions."""
    metrics = db.query(Metric).order_by(Metric.category, Metric.metric_name).all()
    return metrics


@router.get("/globe-data", response_model=List[GlobeDataResponse])
def get_globe_data(db: Session = Depends(get_db)):
    """Get aggregated Scope 1+2 emissions for all companies with mock coordinates for 3D Globe."""
    # This is a highly optimized query for the frontend
    companies = db.query(Company).all()
    
    # Fetch all ESG values for Scope 1 OR Scope 2
    metric_ids = [m.id for m in db.query(Metric).filter(
        Metric.metric_name.ilike("%Scope 1%") | Metric.metric_name.ilike("%Scope 2%")
    ).all()]

    all_values = db.query(EsgValue).filter(EsgValue.metric_id.in_(metric_ids)).all()
    
    # Group by company
    emissions_by_company = {}
    for val in all_values:
        if val.value is not None:
            emissions_by_company[val.company_id] = emissions_by_company.get(val.company_id, 0) + float(val.value)
            
    # Mock coordinates for S&P 500 (mostly USA, but we scatter them a bit for visual effect)
    # New York roughly (40.71, -74.00), SF roughly (37.77, -122.41)
    
    globe_data = []
    for comp in companies:
        total_emissions = emissions_by_company.get(comp.id, 0.0)
        
        # If a company hasn't been parsed yet, give it a baseline or skip it.
        # For visual effect while scraping runs, let's include all companies but size 0 if unparsed.
        
        # Deterministic coordinates seeded by company name (consistent across refreshes)
        import hashlib
        name_hash = int(hashlib.md5(comp.name.encode()).hexdigest(), 16)
        lat = -40.0 + (name_hash % 10000) / 10000.0 * 100.0  # -40 to 60
        lng = -130.0 + ((name_hash >> 16) % 10000) / 10000.0 * 270.0  # -130 to 140
        
        globe_data.append(
            GlobeDataResponse(
                id=comp.id,
                name=comp.name,
                industry=comp.industry,
                country=comp.country or "USA",
                lat=lat,
                lng=lng,
                total_emissions=total_emissions
            )
        )
        
    return globe_data


@router.get("/{company_id}", response_model=List[EsgValueResponse])
def get_metrics_for_company(company_id: uuid.UUID, db: Session = Depends(get_db)):
    """Get all extracted ESG metrics for a company."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    values = (
        db.query(EsgValue)
        .filter(EsgValue.company_id == company_id)
        .order_by(EsgValue.year_reported.desc())
        .all()
    )
    return values


@router.get("/{company_id}/summary")
def get_metrics_summary(company_id: uuid.UUID, db: Session = Depends(get_db)):
    """Get a rich summary of ESG metrics grouped by category."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    metrics = get_company_metrics(db, company_id)
    summary = {"company": company.name, "domain": company.domain, "Environmental": [], "Social": [], "Governance": []}
    for m in metrics:
        cat = m.get("category", "Environmental")
        if cat in summary:
            summary[cat].append(m)
    return summary


@router.post("/search", response_model=List[SemanticSearchResult])
def semantic_search(payload: SemanticSearchRequest, db: Session = Depends(get_db)):
    """Semantic search across all document chunks."""
    results = db_semantic_search(db, payload.query, payload.limit)
    return [
        SemanticSearchResult(
            chunk_text=r["chunk_text"],
            page_number=r["page_number"],
            document_id=r["document_id"],
            similarity=r["similarity"]
        )
        for r in results
    ]
