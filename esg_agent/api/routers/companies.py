"""Company management endpoints."""
import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from core.models import Company
from schemas.api_schemas import CompanyCreate, CompanyResponse

router = APIRouter()


@router.get("/", response_model=List[CompanyResponse])
def list_companies(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """List all companies."""
    companies = db.query(Company).offset(skip).limit(limit).all()
    return companies


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
    return company


@router.delete("/{company_id}", status_code=204)
def delete_company(company_id: uuid.UUID, db: Session = Depends(get_db)):
    """Delete a company and all related data."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    db.delete(company)
    db.commit()
