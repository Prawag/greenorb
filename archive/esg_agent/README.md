# ESG Intelligence Agent

A production-grade ESG (Environmental, Social, Governance) Report Intelligence Agent that automates the discovery, extraction, and analysis of corporate sustainability data.

## Features

- **Discovery**: Finds ESG/sustainability report pages for any company using LLM-powered search
- **Extraction**: Scrapes pages with Playwright, locates PDF download links, downloads reports
- **Processing**: Extracts text and tables from PDFs, chunks text, uses Claude with strict Pydantic schemas to extract GRI/SASB-aligned ESG metrics
- **Storage**: Vector embeddings in PostgreSQL (PGVector) for semantic search + structured JSON metrics in relational tables
- **API**: Full FastAPI REST API for querying companies, reports, metrics, and semantic search
- **Orchestration**: LangChain agent with proper tool definitions and retry logic

## Quick Start

### 1. Prerequisites
- Python 3.11+
- Docker & Docker Compose
- Tesseract OCR installed on your system
- Playwright browsers installed

### 2. Setup

```bash
# Clone and enter directory
cd esg_agent

# Copy environment file and fill in your API keys
copy .env.example .env

# Start PostgreSQL with PGVector
docker compose up -d

# Create virtual environment
python -m venv .venv
.venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Install Playwright browsers
playwright install chromium

# Initialize the database
python main.py --init-db
```

### 3. Run

```bash
# Start the API server
python main.py --serve

# OR run a one-off pipeline for a company
python main.py --company "Microsoft"

# OR run both API + scheduler
python main.py --serve --schedule
```

### 4. API Endpoints

Once running, visit `http://localhost:8000/docs` for the Swagger UI.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/companies` | List all companies |
| POST | `/api/companies` | Create a company |
| GET | `/api/companies/{id}` | Get company details |
| POST | `/api/reports/pipeline` | Trigger full pipeline for a company |
| GET | `/api/reports/{company_id}` | List reports for a company |
| GET | `/api/metrics/{company_id}` | Get ESG metrics for a company |
| POST | `/api/metrics/search` | Semantic search across all chunks |

## Architecture

```
Discovery (Tavily + Claude)
    ↓
Extraction (Playwright + httpx)
    ↓
Processing (PyMuPDF + Camelot + Claude/Instructor)
    ↓
Storage (PostgreSQL + PGVector)
    ↓
API (FastAPI) ← Semantic Search (SentenceTransformers)
```

## Tech Stack

- **Orchestration**: LangChain + Anthropic Claude
- **Search**: Tavily
- **Scraping**: Playwright + BeautifulSoup
- **PDF**: PyMuPDF + Camelot + Tesseract OCR
- **LLM Extraction**: Instructor + Pydantic
- **Embeddings**: SentenceTransformers (all-MiniLM-L6-v2)
- **Database**: PostgreSQL + PGVector
- **API**: FastAPI + Uvicorn
