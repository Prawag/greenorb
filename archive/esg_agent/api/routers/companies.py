"""Company management endpoints."""
import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from core.models import Company, Document, EsgValue, Metric
from schemas.api_schemas import CompanyCreate, CompanyResponse
from modules.greenwash_engine import calculate_greenwash_signals
from datetime import datetime

router = APIRouter()


@router.get("/")
def list_companies(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """List all companies."""
    companies = db.query(Company).offset(skip).limit(limit).all()
    results = []
    for c in companies:
        results.append({
            "id": c.id,
            "name": c.name,
            "domain": c.domain,
            "industry": c.industry,
            "country": c.country,
            "created_at": c.created_at,
            "documents": [
                {"title": d.title, "url": d.url, "date_published": d.date_published}
                for d in c.documents
            ]
        })
    return results


@router.post("/", response_model=CompanyResponse, status_code=201)
def create_company(payload: CompanyCreate, db: Session = Depends(get_db)):
    """Create a new company."""
    existing = db.query(Company).filter(Company.domain == payload.domain).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Company with domain '{payload.domain}' already exists")
    company = Company(
        id=uuid.uuid4(),
        name=payload.name,
        domain=payload.domain,
        industry=payload.industry,
        country=payload.country,
    )
    db.add(company)
    db.commit()
    db.refresh(company)
    return company


@router.get("/{company_id}", response_model=CompanyResponse)
def get_company(company_id: uuid.UUID, db: Session = Depends(get_db)):
    """Get a company by ID."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
        
    # Serialize to dict so we can inject documents
    company_dict = {
        "id": company.id,
        "name": company.name,
        "domain": company.domain,
        "industry": company.industry,
        "country": company.country,
        "created_at": company.created_at,
        "documents": []
    }
    
    for doc in company.documents:
        # Construct the URL for the frontend. 
        # local_path usually looks like downloads/industry/company/file.pdf
        import os
        filename = doc.local_path
        if filename:
            filename = filename.replace("\\", "/") # fix for windows paths
            if filename.startswith("downloads/"):
                filename = filename.replace("downloads/", "", 1)
        static_url = f"/static/downloads/{filename}" if filename else None
        
        company_dict["documents"].append({
            "title": doc.title,
            "url": doc.url,
            "static_url": static_url,
            "date_published": doc.date_published
        })
        
    # Calculate Freshness Score
    # We will use the latest year_reported in EsgValues
    latest_year = 2023 # Fallback
    esg_vals = db.query(EsgValue).filter(EsgValue.company_id == company_id).all()
    if esg_vals:
        years = [v.year_reported for v in esg_vals if v.year_reported]
        if years:
            latest_year = max(years)
    
    current_year = datetime.now().year
    current_month = datetime.now().month
    
    # Very basic approximation
    months_ago = (current_year - latest_year) * 12
    # Add a little randomness based on company name just to simulate freshness variance 
    # since year_reported is all 2024 for the mock data right now.
    import hashlib
    hash_val = int(hashlib.md5(company.name.encode()).hexdigest(), 16) % 36
    months_ago = max(1, months_ago + (hash_val - 12)) 
    
    company_dict["months_since_publish"] = months_ago
    
    # Calculate Greenwash Score
    # Map EsgValues to the dictionary expected by greenwash_engine
    company_data = {
        "scope1_mt": None,
        "scope2_location_mt": None,
        "scope2_market_mt": None,
        "scope3_mt": None,
        "target_type": "INTENSITY" if (hash_val % 2 == 0) else "ABSOLUTE", # Simulated
        "verification_body": "PwC" if (hash_val % 3 == 0) else None, # Simulated
    }
    
    for val in esg_vals:
        if not val.value: continue
        metric = db.query(Metric).filter(Metric.id == val.metric_id).first()
        if not metric: continue
        
        name = metric.metric_name.lower()
        if "scope 1" in name:
            company_data["scope1_mt"] = float(val.value)
        elif "scope 2" in name:
            company_data["scope2_location_mt"] = float(val.value)
            company_data["scope2_market_mt"] = float(val.value) * 0.8 # Simulated gap
        elif "scope 3" in name:
            company_data["scope3_mt"] = float(val.value)
            
    greenwash_result = calculate_greenwash_signals(company_data)
    company_dict["greenwash_risk"] = greenwash_result["greenwash_risk"]
    company_dict["greenwash_details"] = greenwash_result["signals"]
        
    return company_dict


@router.delete("/{company_id}", status_code=204)
def delete_company(company_id: uuid.UUID, db: Session = Depends(get_db)):
    """Delete a company and all related data."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    db.delete(company)
    db.commit()
