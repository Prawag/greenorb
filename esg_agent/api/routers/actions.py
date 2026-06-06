from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional
import uuid

from core.database import get_db
from core.models import SustainabilityAction, Company

router = APIRouter()

@router.get("/")
def get_actions(
    query: Optional[str] = Query(None, description="Search by category or description"),
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """Get sustainability actions, with optional NLP-like ILIKE search."""
    q = db.query(SustainabilityAction, Company.name.label("company_name")).join(Company)
    
    if query:
        search = f"%{query}%"
        q = q.filter(
            (SustainabilityAction.action_category.ilike(search)) |
            (SustainabilityAction.description.ilike(search))
        )
        
    results = q.limit(limit).all()
    
    return [
        {
            "id": str(r.SustainabilityAction.id),
            "company_name": r.company_name,
            "company_id": str(r.SustainabilityAction.company_id),
            "category": r.SustainabilityAction.action_category,
            "description": r.SustainabilityAction.description
        }
        for r in results
    ]
