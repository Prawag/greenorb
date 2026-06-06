"""FastAPI request/response schemas."""
import uuid
from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel, Field


# ── Company ──────────────────────────────────────────
class CompanyCreate(BaseModel):
    name: str = Field(..., description="Company name")
    domain: str = Field(..., description="Company primary domain, e.g. 'microsoft.com'")
    industry: Optional[str] = None
    country: Optional[str] = None


class CompanyResponse(BaseModel):
    id: uuid.UUID
    name: str
    domain: str
    industry: Optional[str] = None
    country: Optional[str] = None
    created_at: Optional[datetime] = None
    documents: Optional[List[dict]] = Field(default_factory=list)

    class Config:
        from_attributes = True


# ── Document ─────────────────────────────────────────
class DocumentResponse(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    url: str
    title: Optional[str] = None
    report_type: Optional[str] = None
    date_published: Optional[date] = None
    local_path: Optional[str] = None
    content_hash: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── ESG Value ────────────────────────────────────────
class EsgValueResponse(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    metric_id: uuid.UUID
    company_id: uuid.UUID
    value: Optional[float] = None
    value_text: Optional[str] = None
    unit: Optional[str] = None
    year_reported: Optional[int] = None
    confidence: Optional[float] = None
    source_text: Optional[str] = None
    page_number: Optional[int] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class MetricResponse(BaseModel):
    id: uuid.UUID
    category: str
    framework: Optional[str] = None
    metric_name: str
    unit: Optional[str] = None
    description: Optional[str] = None

    class Config:
        from_attributes = True


# ── Semantic Search ──────────────────────────────────
class SemanticSearchRequest(BaseModel):
    query: str = Field(..., description="Natural language query")
    limit: int = Field(5, ge=1, le=50)


class SemanticSearchResult(BaseModel):
    chunk_text: str
    page_number: Optional[int] = None
    document_id: str
    similarity: float


# ── Pipeline Trigger ─────────────────────────────────
class PipelineRequest(BaseModel):
    company_name: str = Field(..., description="Company to analyse")
    company_domain: Optional[str] = Field(None, description="Optional domain override")


class PipelineStatusResponse(BaseModel):
    status: str
    message: str
    company_name: str
    documents_processed: int = 0
    metrics_extracted: int = 0

# ── 3D Globe Visualization ───────────────────────────
class GlobeDataResponse(BaseModel):
    id: uuid.UUID
    name: str
    industry: Optional[str] = None
    country: Optional[str] = None
    lat: float
    lng: float
    total_emissions: float

