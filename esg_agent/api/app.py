"""FastAPI application definition."""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from api.routers import companies, reports, metrics


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("ESG Intelligence Agent API starting up...")
    yield
    logger.info("ESG Intelligence Agent API shutting down...")


app = FastAPI(
    title="ESG Intelligence Agent API",
    description="REST API for ESG report discovery, extraction, and analysis.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(companies.router, prefix="/api/companies", tags=["Companies"])
app.include_router(reports.router, prefix="/api/reports", tags=["Reports"])
app.include_router(metrics.router, prefix="/api/metrics", tags=["Metrics"])


@app.get("/", tags=["Health"])
def health_check():
    return {"status": "healthy", "service": "ESG Intelligence Agent"}


@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok"}
