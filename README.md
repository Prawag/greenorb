# ◎ GreenOrb v3 — Open Carbon & ESG Intelligence Platform

GreenOrb is an enterprise-grade, agentic AI-powered carbon intelligence platform designed to discover, audit, verify, and visualize real-time corporate sustainability data, carbon footprints (Scope 1, 2, and 3), and physical climate risks globally. 

Powered by a multi-agent AI network (Scout, Analyst, Risk, Strategy), an interactive 3D spatial globe, layout-aware PDF extraction engines, vector RAG search, human-in-the-loop audit verification, and decentralized $GORB Web3 tokenomics.

![GreenOrb Architecture](https://img.shields.io/badge/architecture-agentic%20multi--agent-00e87a?style=flat-square)
![Stack](https://img.shields.io/badge/stack-React%2018%20%7C%20Node%20Express%20%7C%20Python%20FastAPI%20%7C%20Neon%20Postgres-00d4e8?style=flat-square)
![AI Engine](https://img.shields.io/badge/AI-Groq%20Llama%203.3%20%7C%20Gemini%202.0%20%7C%20Ollama-7000ff?style=flat-square)
![Web3](https://img.shields.io/badge/Web3-Hedera%20Hashgraph%20%7C%20Solidity-ff9900?style=flat-square)

---

## 📋 Table of Contents

- [1. Executive Summary & Core Vision](#1-executive-summary--core-vision)
- [2. End-to-End System Architecture](#2-end-to-end-system-architecture)
- [3. Information Architecture (Data Pillars)](#3-information-architecture-data-pillars)
- [4. Collaborative AI Agent Network & Workflows](#4-collaborative-ai-agent-network--workflows)
- [5. Data Extraction & Ingestion Methodology](#5-data-extraction--ingestion-methodology)
- [6. Database Schema & Data Models](#6-database-schema--data-models)
- [7. Web3 & $GORB Tokenomics Architecture](#7-web3--gorb-tokenomics-architecture)
- [8. Platform Modules & Dashboard Tabs](#8-platform-modules--dashboard-tabs)
- [9. Tech Stack Summary](#9-tech-stack-summary)
- [10. Setup, Configuration & Local Development](#10-setup-configuration--local-development)
- [11. API Documentation Reference](#11-api-documentation-reference)
- [12. Verification & Walkthrough](#12-verification--walkthrough)

---

## 1. Executive Summary & Core Vision

Corporate sustainability reporting suffers from fragmentation, greenwashing, delayed disclosures, and unstandardized data formats across thousands of PDF sustainability reports (CSR/BRSR/GRI/SASB).

**GreenOrb** solves this by creating an autonomous **Carbon Intelligence System** that:
1. **Discovers**: Continuously searches the web and regulatory filings for newly published corporate ESG reports.
2. **Parses & Extracts**: Utilizes layout-aware PDF coordinate block extraction to accurately isolate numeric emissions, financial data, and operational metrics into standardized units ($tCO_2e$, $MWh$, $m^3$).
3. **Audits & Verifies**: Cross-references reported emissions against real-world physical evidence signals—such as NASA VIIRS thermal fire anomalies, global air quality sensors (PM2.5), and live shipping logistics (AISstream).
4. **Delivers Actionable Insights**: Synthesizes multi-agent evaluations into investment recommendations (`BUY`, `HOLD`, `AVOID`) with confidence scores and target price impact estimates.
5. **Ensures Immutability**: Uses a Hedera-backed Solidity smart contract layer ($GORB tokenomics) for human auditor verification rewards and immutable audit trail verification.

---

## 2. End-to-End System Architecture

```mermaid
graph TD
    subgraph Data_Sources [1. Data Ingestion & Physical Evidence Signals]
        S1[SEC EDGAR XBRL & 10-K]
        S2[Corporate ESG PDFs & BRSR Reports]
        S3[NASA VIIRS Thermal Anomalies]
        S4[Global PM2.5 Air Quality Sensors]
        S5[AISstream Live Maritime Logistics]
        S6[Climate TRACE High-Emission Assets]
    end

    subgraph Agent_Network [2. Collaborative Multi-Agent AI Network]
        Scout[🔍 Scout Agent - Discovery]
        Analyst[📊 Analyst Agent - Diligence & PDF Extraction]
        Risk[⚠️ Risk Agent - Greenwashing & Verification]
        Strategy[💡 Strategy Agent - Investment Action]

        Scout -->|Found PDFs & URLs| Analyst
        Analyst -->|E, S, G Scores & Metrics| Risk
        Risk -->|Physical Evidence Discrepancies| Strategy
    end

    subgraph Core_Engine [3. Processing, RAG & Storage Layer]
        Express[Node.js Express API Gateway :5000]
        FastAPI[Python FastAPI Processing Engine :8000]
        PyMuPDF[Layout-Aware PDF Block Parser]
        Norm[Metric Unit Normalizer Engine]
        RAG[RAG Engine - SentenceTransformers 768-dim]
        LLM{LLM Consensus Router: Groq Llama 3.3 / Gemini 2.0 / Local Ollama}
        DB[(Neon PostgreSQL + PGVector)]

        FastAPI --> PyMuPDF --> Norm --> RAG --> LLM --> DB
        Express <--> DB
    end

    subgraph Terminal [4. Frontend Intelligence Terminal :5173]
        G[3D Spatial Globe - Three.js / react-globe.gl]
        A[Audit Directory & PDF RAG Q&A]
        C[Compare Engine]
        T[Trust UI - Human-in-the-Loop]
        S[Smart City Indore IoT Dashboard]

        Express <--> G
        Express <--> A
        Express <--> C
        Express <--> T
        Express <--> S
    end

    subgraph Web3_Layer [5. Blockchain & Tokenomics]
        GORB[GreenOrbToken.sol ERC20]
        Stake[Staking.sol Protocol Access]
        Reward[RewardEngine.sol Auditor Bounties]
        Burn[BurnMechanism.sol Fee Burning]

        T -->|Verified Audits| Reward
        Reward --> GORB
        Stake --> GORB
        Burn --> GORB
    end
```

---

## 3. Information Architecture (Data Pillars)

GreenOrb organizes planetary carbon data across 5 distinct data pillars:

1. **Financial Layer**: SEC EDGAR XBRL facts, 10-year revenue trends, CapEx/OpEx allocations toward decarbonization, and Scope-to-revenue intensity ratios ($tCO_2e / \$M$).
2. **Production Layer**: Global Energy Monitor (GEM) facility mapping, Open Supply Hub facility IDs, national Industrial Production Index (IIP) series, and localized manufacturing asset coordinates.
3. **Environmental Layer**: Verified Scope 1 (Direct), Scope 2 (Location & Market-based Energy), and Scope 3 (Value Chain) emissions extracted directly from audited BRSR/GRI/SASB filings and Climate TRACE spatial assets.
4. **Logistics Layer**: Live AISstream.io maritime vessel tracking, freight route emission modeling, and GLEC Framework v3 compliant supply chain transit calculations.
5. **Regulatory Layer**: European Union CBAM (Carbon Border Adjustment Mechanism) liability estimation, CA100+ alignment indices, regulatory vulnerability scoring, and greenwashing flag thresholds.

---

## 4. Collaborative AI Agent Network & Workflows

GreenOrb relies on a specialized 4-agent network defined in [`AGENTS.md`](file:///C:/Users/prawa/Desktop/GreenOrb/AGENTS.md) and orchestrated via Python (`LangChain` / `LangGraph`):

```
       [ Company Query / Target URL ]
                    │
                    ▼
         ┌─────────────────────┐
         │ 🔍 Scout Agent     │  • Web search (Tavily/DDG/Google)
         │ (Discovery)         │  • Locate 2024/2025 CSR/BRSR PDFs
         └──────────┬──────────┘
                    │ PDF Links & Metadata
                    ▼
         ┌─────────────────────┐
         │ 📊 Analyst Agent    │  • PyMuPDF coordinate block extraction
         │ (Diligence)         │  • GRI/SASB metric parsing via Instructor
         └──────────┬──────────┘  • Calculate E, S, G scores (0-100)
                    │ Extracted Metrics & RAG Chunks
                    ▼
         ┌─────────────────────┐
         │ ⚠️ Risk Agent       │  • Detect greenwashing & reporting gaps
         │ (Verification)      │  • Cross-check vs Satellite & Air Quality
         └──────────┬──────────┘  • Emit threat alerts to Trust UI
                    │ Verified Risk Profile
                    ▼
         ┌─────────────────────┐
         │ 💡 Strategy Agent   │  • Synthesize aggregate risk matrix
         │ (Insights)          │  • Issue BUY / HOLD / AVOID rating
         └─────────────────────┘  • Calculate target price impact
```

### Agent Roles & Specifications

#### 1. Scout Agent (Discovery)
- **Primary Function**: Autonomous web discovery of corporate sustainability reports and regulatory filings.
- **Tools & Skills**: Uses `skills/search.md`, Tavily API, DuckDuckGo API, Google Custom Search, and Playwright headless browsers.
- **Workflow**: Takes a company name or ticker, queries regulatory repositories (SEC EDGAR, NSE/BSE BRSR filings, corporate investor relations pages), locates PDF download endpoints, and downloads files into `downloaded_reports/`.

#### 2. Analyst Agent (Diligence)
- **Primary Function**: Deep document scanning, layout parsing, and quantitative metric extraction.
- **Tools & Skills**: Uses `skills/pdf_analysis.md`, PyMuPDF (`fitz`), `Camelot-py` (table parsing), `instructor` + `pydantic` schemas.
- **Workflow**: Performs block-level PDF layout analysis, segregates document context into domain-specific token budgets (Emissions, Financials, Operations), extracts numerical metrics for Scope 1, Scope 2, Scope 3, Water consumption, and Energy usage, and computes standardized E, S, and G scores (0–100).

#### 3. Risk Agent (Verification)
- **Primary Function**: Greenwashing detection, mathematical contradiction analysis, and physical evidence cross-verification.
- **Workflow**: Evaluates extracted corporate claims against real-world physical indicators:
  - Cross-references reported facility operational status with **NASA VIIRS thermal anomaly fire data**.
  - Cross-references regional facility emissions with **global PM2.5 air quality sensor feeds**.
  - Flagging vague decarbonization commitments (e.g., "Net Zero by 2050" with zero interim CapEx).
  - Emits discrepancy alerts into the **Trust UI queue** for human auditor verification.

#### 4. Strategy Agent (Insights)
- **Primary Function**: Investment diligence, regulatory risk scoring, and policy action synthesis.
- **Workflow**: Synthesizes the quantitative metrics from the Analyst Agent and the discrepancy flags from the Risk Agent to generate:
  - Final Recommendation: `BUY`, `HOLD`, or `AVOID`.
  - Confidence Level: Score between `0.00` and `1.00`.
  - Target Price Impact: Estimated percentage impact on corporate valuation due to carbon liabilities or CBAM taxes.
  - Strategic Rationale: Human-readable markdown summary for portfolio managers.

---

## 5. Data Extraction & Ingestion Methodology

### 1. Safe Layout-Aware PDF Block Parsing
Standard PDF text tools scramble multi-column tables and sidebars. GreenOrb implements coordinate-aware block extraction via PyMuPDF (`page.get_text("blocks")`):
- **Paragraph Isolation**: Isolates visual text bounding boxes $(x_0, y_0, x_1, y_1)$ to preserve reading order.
- **Domain-Specific Token Budgeting**: Paragraphs are scored for relevance and routed into separate single-domain processing budgets:
  - *Emissions Budget*: Captures $tCO_2e$, Scope 1/2/3 tables, GRI 305 disclosures.
  - *Financials Budget*: Captures revenue, OpEx, CapEx, SEC 10-K facts.
  - *Operations Budget*: Captures energy consumption, fuel mix, facility locations.
- **Global Deduplication**: A global tracking buffer guarantees no paragraph is duplicated across categories.

### 2. Self-Healing JSON Parser & Offline Local Mode
To maintain 100% reliability even when running low-cost or local LLMs (via Ollama Llama 3):
- **Intelligent Sliding Window**: Dynamically shifts window focus (e.g., pulling emissions metrics from appendix pages while reading financial notes from front pages).
- **Self-Healing Bracket Balancer**: Reconstructs incomplete or truncated LLM JSON payloads on-the-fly by tracking quote state and balancing bracket closures (`{...}` and `[...]`).
- **Predict Token Optimization**: Configured to `2048` predict tokens for robust, multi-pass structured output.

### 3. Deterministic Unit Normalization
Before storing extracted data into PostgreSQL, all quantitative metrics pass through a deterministic normalization engine:
- **Carbon Emissions**: Standardized to Metric Tonnes of $CO_2$ equivalent ($tCO_2e$). Auto-converts $ktCO_2e$ $(\times 10^3)$, $MtCO_2e$ $(\times 10^6)$, and short tons $(\times 0.907185)$.
- **Energy Consumption**: Standardized to Megawatt-hours ($MWh$). Auto-converts Gigajoules ($GJ \times 0.277778$), Terajoules ($TJ \times 277.778$), and Kilowatt-hours ($kWh / 1000$).
- **Water Usage**: Standardized to cubic meters ($m^3$ / $kL$). Auto-converts Megaliters ($ML \times 1000$) and million gallons.

### 4. Vector RAG Pipeline Architecture
- **Text Chunking**: Document text is split into overlapping 512-token chunks with 50-token context overlap.
- **Embedding Generation**: Embedded using `SentenceTransformers` (`all-MiniLM-L6-v2`) generating 768-dimensional dense vectors.
- **PostgreSQL PGVector**: Embeddings are indexed using HNSW (Hierarchical Navigable Small World) graph indexing for sub-10ms semantic similarity queries.

---

## 6. Database Schema & Data Models

GreenOrb utilizes Neon Serverless PostgreSQL with the `pgvector` extension. Below are the primary relational schemas:

### `companies`
Stores top-level entity metadata and verified carbon totals.
```sql
CREATE TABLE companies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    sector VARCHAR(100),
    country VARCHAR(100),
    co2 DOUBLE PRECISION,        -- Total emissions (tCO2e)
    s1 DOUBLE PRECISION,         -- Scope 1 emissions (tCO2e)
    s2 DOUBLE PRECISION,         -- Scope 2 emissions (tCO2e)
    s3 DOUBLE PRECISION,         -- Scope 3 emissions (tCO2e)
    report_year INT DEFAULT 2024,
    lat DOUBLE PRECISION,        -- HQ Latitude
    lng DOUBLE PRECISION,        -- HQ Longitude
    audit_status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, AUDITED, FLAGGED
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### `embeddings`
Stores chunked PDF text and dense vector embeddings for RAG search.
```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE embeddings (
    id SERIAL PRIMARY KEY,
    company_name VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    page_number INT,
    report_year INT DEFAULT 2024,
    embedding VECTOR(768)
);
```

### `analysis`
Stores scores generated by the Analyst Agent.
```sql
CREATE TABLE analysis (
    id SERIAL PRIMARY KEY,
    company_id INT REFERENCES companies(id) ON DELETE CASCADE,
    e_score INT CHECK (e_score BETWEEN 0 AND 100),
    s_score INT CHECK (s_score BETWEEN 0 AND 100),
    g_score INT CHECK (g_score BETWEEN 0 AND 100),
    strengths TEXT[],
    weaknesses TEXT[]
);
```

### `risks`
Stores risk flags emitted by the Risk Agent.
```sql
CREATE TABLE risks (
    id SERIAL PRIMARY KEY,
    company_id INT REFERENCES companies(id) ON DELETE CASCADE,
    greenwash VARCHAR(50),      -- LOW, MEDIUM, HIGH, CRITICAL
    reg_risk VARCHAR(50),       -- LOW, MEDIUM, HIGH
    climate_exp VARCHAR(50),    -- LOW, MEDIUM, HIGH
    data_quality VARCHAR(50)    -- HIGH, MODERATE, LOW, UNVERIFIED
);
```

### `strategies`
Stores portfolio recommendations from the Strategy Agent.
```sql
CREATE TABLE strategies (
    id SERIAL PRIMARY KEY,
    company_id INT REFERENCES companies(id) ON DELETE CASCADE,
    action VARCHAR(20),         -- BUY, HOLD, AVOID
    confidence DOUBLE PRECISION, -- 0.00 to 1.00
    rationale TEXT,
    price_impact VARCHAR(50)
);
```

### `facilities`
Stores corporate physical assets (factories, power plants, refineries).
```sql
CREATE TABLE facilities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    company_id INT REFERENCES companies(id) ON DELETE CASCADE,
    type VARCHAR(100),
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    capacity VARCHAR(100),
    emission_rate DOUBLE PRECISION
);
```

### `geo_cities`
Stores municipal data for smart city dashboards (e.g., Indore).
```sql
CREATE TABLE geo_cities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    country VARCHAR(100) NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    aqi INT,
    carbon_intensity INT,
    ev_charging_count INT,
    waste_management_index DOUBLE PRECISION
);
```

---

## 7. Web3 & $GORB Tokenomics Architecture

To enforce data integrity, prevent corporate manipulation of ESG scores, and incentivize independent verification, GreenOrb integrates Solidity smart contracts (`contracts/`) designed for deployment on Hedera Hashgraph (EVM compatible):

```
       [ Community Auditor ] ──(Submits Evidence)──► [ Trust UI Queue ]
                                                             │
                                                   (Verification Passes)
                                                             │
                                                             ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │                           RewardEngine.sol                             │
  │  • Mints / transfers $GORB reward tokens to auditor address            │
  └─────────────────────────────────┬──────────────────────────────────────┘
                                    │
               ┌────────────────────┴────────────────────┐
               ▼                                         ▼
   ┌───────────────────────┐                 ┌───────────────────────┐
   │     Staking.sol       │                 │  BurnMechanism.sol    │
   │ • Stake $GORB to unlock│                 │ • 2% protocol query   │
   │   premium RAG & Globe │                 │   fees automatically  │
   │ • Earn APY yield      │                 │   burned from supply  │
   └───────────────────────┘                 └───────────────────────┘
```

### Contract Inventory

1. **`GreenOrbToken.sol`**:
   - Standard ERC20 token ($GORB) serving as the native utility token for platform queries, staking, and audit governance.
2. **`Staking.sol`**:
   - Allows users and enterprise institutions to stake $GORB tokens. Staking unlocks access to high-resolution satellite layers, predictive RAG queries, and yields staking rewards over time.
3. **`RewardEngine.sol`**:
   - Manages bounty distributions for community auditors who identify confirmed greenwashing discrepancies in corporate disclosures via the Trust UI.
4. **`BurnMechanism.sol`**:
   - Implements a deflationary token model. A portion of protocol access and API query fees are automatically sent to a burn address to contract circulating supply over time.

---

## 8. Platform Modules & Dashboard Tabs

The GreenOrb frontend UI (`src/`) is structured into dedicated intelligence terminals:

### 1. 🌐 Globe Tab (Main Intelligence View)
- **3D Spatial Visualization**: Built with `react-globe.gl` and `Three.js` for rendering a interactive digital twin of Earth.
- **Interactive Spatial Overlays**:
  - *Company Emission Pillars*: 3D vertical bars positioned at corporate HQ / facility coordinates, height-scaled by Scope 1+2 emissions volume.
  - *NASA VIIRS Active Thermal Fire Points*: Real-time satellite thermal anomaly overlay.
  - *Grid Carbon Intensity Layer*: Global power grid cleanliness index heatmap.
  - *Air Quality Layer (PM2.5)*: Real-time global atmospheric particle concentration sensors.
  - *Country Greendex Polygons*: Choropleth nation-level ESG rating polygons.
  - *Climate TRACE Asset Layer*: High-resolution physical points for global power plants and steel mills.
  - *Photorealistic Satellite Layer*: Toggleable MODIS Terra cloud and surface texture maps via Cesium.
- **Threat Alert Cards**: Dynamic floating popups alerting users to spatial physical evidence contradictions.
- **Timeline Scrubber**: Chronological slider for inspecting historical emissions trajectories and fire spreads.

### 2. 📚 Audit Tab (Company ESG Library & RAG Q&A)
- Searchable directory of tracked international companies.
- Displays Scope 1, 2, 3 metrics, data freshness badges, and confidence indicators.
- **Interactive PDF RAG Chat**: Allows users to ask natural language questions directly against corporate sustainability reports (e.g., *"What is Microsoft's 2024 water reclamation plan in desert regions?"*) and view exact paragraph citations.

### 3. ⚖️ Compare Tab
- Head-to-head benchmarking engine.
- Compare up to 4 companies simultaneously across Scope emissions, carbon intensity per revenue, GRI compliance ratings, and Risk Agent vulnerability scores.

### 4. 🛡️ Trust UI (Human-in-the-Loop Verification)
- Auditor dashboard displaying an automated queue of AI-flagged discrepancies (e.g., *Company A reported zero emissions for Facility X, but NASA VIIRS detected active thermal flaring*).
- Certified human auditors can **Approve**, **Reject**, or **Request Further Diligence**, triggering $GORB token bounty distributions from `RewardEngine.sol`.

### 5. 🏙️ Indore Tab (Smart City Integration)
- Hyper-local civic dashboard specifically configured for Indore City.
- Visualizes real-time IoT feeds: PM2.5 / PM10 air quality stations, municipal solid waste bin fill sensors, EV charging station status, and water treatment metrics.

### 6. 📄 Upload & Custom Pipeline Execution Screen
- Allows users to upload custom corporate PDF reports.
- Triggers the full 4-agent LangChain workflow with real-time SSE progress updates (Scouting -> Extracting -> Verifying -> Strategy Recommendation).

---

## 9. Tech Stack Summary

| Layer | Technology / Library | Purpose |
| :--- | :--- | :--- |
| **Frontend Core** | React 18, Vite 6, Javascript (ES6+) | Core user interface & fast bundling |
| **Frontend Visuals** | `react-globe.gl`, `three.js`, Cesium JS | 3D interactive globe, satellite overlays, dynamic 3D pillars |
| **Geospatial & Styling**| `h3-js`, Vanilla CSS (Glassmorphism), Lucide Icons | Coordinate hexagonal indexing, custom CSS token system |
| **Backend Gateway** | Node.js, Express.js | REST API routing, caching via `node-cache`, frontend state sync |
| **AI Orchestration** | Python 3.11+, `langchain`, `langgraph` | Multi-agent stateful workflow execution |
| **LLM Inference** | Groq (Llama 3.3 70B), Gemini 2.0 Flash, Ollama (Llama 3 local) | High-speed structured inference & fallback synthesis |
| **PDF Extraction** | PyMuPDF (`fitz`), `pdfplumber`, `Camelot-py`, `instructor`, `pydantic` | Layout-aware block parsing, structured JSON schema validation |
| **Vector Database** | Neon Serverless PostgreSQL + `pgvector` | Dual storage: Relational metrics + 768-dim dense vector search |
| **Web Scraping** | Playwright, BeautifulSoup4, Tavily API | Headless browser report crawling & web discovery |
| **Web3 / Blockchain** | Hedera Hashgraph, Solidity, Ether.js | Smart contracts (`$GORB`, Staking, RewardEngine, Burn) |

---

## 10. Setup, Configuration & Local Development

Follow this step-by-step guide to run the full GreenOrb stack locally.

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher
- **Python**: v3.10 or higher
- **Git**
- **Docker & Docker Compose** (Optional, for local PostgreSQL + PGVector)
- **Tesseract OCR & Playwright** (For full PDF OCR & scraping capability)

---

### 2. Environment Configuration

Create a `.env` file in the project root (`C:\Users\prawa\Desktop\GreenOrb\.env`) and in `Backend/.env`:

```env
# Database (Neon Serverless PostgreSQL or Local Postgres with pgvector)
DATABASE_URL=postgresql://user:password@host:5432/greenorb?sslmode=require

# API Keys
GROQ_API_KEY=gsk_your_groq_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
TAVILY_API_KEY=tvly_your_tavily_api_key_here

# Server Ports
PORT=5000
FASTAPI_PORT=8000
VITE_PORT=5173

# Web3 (Optional - Hedera Testnet / Local Hardhat)
HEDERA_OPERATOR_ID=0.0.xxxxx
HEDERA_OPERATOR_KEY=302e...
```

---

### 3. Frontend Setup (React + Vite)

```bash
# 1. Open terminal at project root
cd C:\Users\prawa\Desktop\GreenOrb

# 2. Install Node dependencies
npm install

# 3. Start Vite development server
npm run dev
```
*The frontend terminal will launch at `http://localhost:5173`.*

---

### 4. Express API Gateway Setup (Node.js Backend)

```bash
# 1. Open a new terminal and navigate to Backend
cd C:\Users\prawa\Desktop\GreenOrb\Backend

# 2. Install Node dependencies
npm install

# 3. Run database migrations to initialize tables
node migrate.js

# 4. Start the Express API gateway
node index.js
```
*The API gateway will launch on `http://localhost:5000`.*

---

### 5. Python AI Agent Engine & Pipeline Setup

```bash
# 1. Open a third terminal in Backend (or esg_agent)
cd C:\Users\prawa\Desktop\GreenOrb\Backend

# 2. Create and activate a Python virtual environment
# On Windows:
python -m venv .venv
.venv\Scripts\activate

# On Mac/Linux:
python3 -m venv .venv
source .venv/bin/activate

# 3. Install Python dependencies
pip install -r requirements.txt

# 4. Install Playwright browser binaries
playwright install chromium

# 5. Run the master agent discovery runner
python esg_discovery_agent.py
```

*To run the standalone FastAPI service in `esg_agent`:*
```bash
cd C:\Users\prawa\Desktop\GreenOrb\esg_agent
python main.py --serve
```
*FastAPI documentation will be available at `http://localhost:8000/docs`.*

---

### 6. Smart Contracts Setup (Solidity / Hedera)

```bash
# Navigate to contracts directory
cd C:\Users\prawa\Desktop\GreenOrb\contracts

# Compile contracts using Hardhat or Solc
npx hardhat compile
```

---

## 11. API Documentation Reference

### Node.js Express Gateway (`http://localhost:5000`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/companies` | List all tracked companies with Scope 1/2/3 emissions & lat/lng coordinates |
| `GET` | `/api/companies/:id` | Get comprehensive details, risk ratings, and strategy for a specific company |
| `POST` | `/api/query` | RAG vector similarity search across all parsed PDF document chunks |
| `GET` | `/api/facilities` | List physical high-emission assets & factory coordinates globally |
| `GET` | `/api/trust-flags` | Fetch pending greenwashing discrepancy alerts for the Trust UI |
| `POST` | `/api/trust-flags/:id/verify` | Submit human auditor verdict (Approve / Reject) and trigger reward contract |
| `GET` | `/api/city/indore` | Get live IoT metrics for Indore Smart City (AQI, waste fill levels, EV charging) |

### Python FastAPI Engine (`http://localhost:8000`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/companies` | Returns registered companies in the AI pipeline |
| `POST` | `/api/reports/pipeline` | Triggers full 4-agent pipeline execution for a company name or ticker |
| `GET` | `/api/reports/:company_id` | List ingested sustainability PDF report files |
| `GET` | `/api/metrics/:company_id` | Returns extracted quantitative ESG metrics (Scope 1/2/3, Energy, Water) |
| `POST` | `/api/metrics/search` | Performs dense 768-dim vector semantic search against chunk embeddings |

---

## 12. Verification & Walkthrough

To verify that your installation is working correctly:

1. **Database Check**: Run `node Backend/check_db.js` to ensure your Neon PostgreSQL connection string is active and tables are populated.
2. **Frontend Check**: Open `http://localhost:5173` in Chrome/Edge, ensure the 3D globe renders with interactive emission pillars.
3. **Agent Check**: Run `python Backend/test_extraction.py` to confirm PyMuPDF and LLM extraction functions execute cleanly.

---

*Built with ❤️ and verified carbon data by the GreenOrb Team.*
