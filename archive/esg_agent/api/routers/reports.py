"""Report endpoints: trigger pipeline and list reports."""
import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session

from core.database import get_db
from core.models import Document, Company
from schemas.api_schemas import DocumentResponse, PipelineRequest, PipelineStatusResponse

router = APIRouter()

# In-memory pipeline status tracker
_pipeline_status = {}


def _run_pipeline_background(company_name: str, company_domain: str = None, task_id: str = None):
    """Background task to run the pipeline."""
    from loguru import logger
    from agent.orchestrator import run_direct_pipeline
    try:
        if task_id:
            _pipeline_status[task_id] = {"status": "running", "message": f"Processing {company_name}..."}
        result = run_direct_pipeline(company_name, company_domain)
        if task_id:
            _pipeline_status[task_id] = {
                "status": "completed",
                "message": f"Done. {result.get('documents_processed', 0)} docs, {result.get('metrics_extracted', 0)} metrics.",
                "result": result
            }
    except Exception as e:
        logger.error(f"Background pipeline failed: {e}")
        if task_id:
            _pipeline_status[task_id] = {"status": "failed", "message": str(e)}


@router.post("/pipeline", response_model=PipelineStatusResponse)
def trigger_pipeline(
    payload: PipelineRequest,
    background_tasks: BackgroundTasks
):
    """Trigger the full ESG pipeline for a company (runs in background)."""
    task_id = str(uuid.uuid4())
    _pipeline_status[task_id] = {"status": "queued", "message": f"Pipeline queued for {payload.company_name}"}
    background_tasks.add_task(
        _run_pipeline_background,
        payload.company_name,
        payload.company_domain,
        task_id
    )
    return PipelineStatusResponse(
        status="queued",
        message=f"Pipeline started for {payload.company_name}. Task ID: {task_id}",
        company_name=payload.company_name
    )


@router.post("/pipeline/sync", response_model=PipelineStatusResponse)
def trigger_pipeline_sync(payload: PipelineRequest):
    """Trigger the full ESG pipeline synchronously (blocks until done)."""
    from agent.orchestrator import run_direct_pipeline
    result = run_direct_pipeline(payload.company_name, payload.company_domain)
    return PipelineStatusResponse(
        status="completed",
        message="Pipeline completed",
        company_name=payload.company_name,
        documents_processed=result.get("documents_processed", 0),
        metrics_extracted=result.get("metrics_extracted", 0)
    )


@router.get("/status/{task_id}")
def get_pipeline_status(task_id: str):
    """Check the status of a background pipeline task."""
    status = _pipeline_status.get(task_id)
    if not status:
        raise HTTPException(status_code=404, detail="Task not found")
    return status


@router.get("/{company_id}", response_model=List[DocumentResponse])
def list_reports(company_id: uuid.UUID, db: Session = Depends(get_db)):
    """List all reports for a company."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    docs = db.query(Document).filter(Document.company_id == company_id).all()
    return docs
