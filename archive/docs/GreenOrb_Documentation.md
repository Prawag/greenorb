# GreenOrb: Comprehensive Project Documentation

## 1. Project Overview
**GreenOrb** is a collaborative AI network for discovering and analyzing real-time ESG (Environmental, Social, and Governance) metrics and carbon data. Serving as an intelligence layer for climate action, it features a highly interactive 3D globe for spatial data visualization, AI-driven agents for deep document auditing and web scraping, and a Trust UI for human-in-the-loop verification and auditing of ESG claims.

## 2. Use Cases
- **Real-time Spatial ESG Analysis**: Stakeholders, policymakers, and investors can visualize global emissions, active fires, grid carbon intensity, and air quality on a dynamic 3D interactive globe.
- **Automated ESG Audits**: A network of specialized AI agents automatically discovers company sustainability reports globally, parses unstructured data, and extracts relevant metrics such as Scope 1, 2, and 3 emissions, generating standardized ESG scores.
- **Greenwashing & Risk Detection**: The system cross-references publicly reported corporate data against real-world physical evidence signals (such as satellite imagery, air quality sensors, and ESG news velocity) to identify discrepancies, mathematical contradictions, and "greenwashing."
- **Investment & Policy Strategy**: Strategy Agents synthesize all gathered data to recommend objective Buy/Hold/Avoid actions based on aggregated ESG performance and regulatory risks.
- **Smart City Integration (Indore Prototype)**: A localized integration that powers a specific city dashboard, monitoring live IoT streams for waste management, water quality, EV infrastructure, and hyper-local air quality.

## 3. Information Architecture (IA)
The GreenOrb dashboard is organized into distinct, specialized functional tabs:

1. **Globe Tab (Main Intelligence View)**
   - **3D Globe Visualization**: Powered by `react-globe.gl`.
   - **Interactive Data Layers**:
     - *Company emissions*: Interactive pillars mapped to coordinate points, height indicating Scope emissions.
     - *Active fires (NASA VIIRS)*: Real-time thermal anomalies.
     - *Grid carbon intensity*: Global energy grid cleanliness.
     - *Air quality (PM2.5)*: Global sensor integration.
     - *Country Greendex*: Choropleth polygons detailing average national ESG performance.
     - *ESG news velocity*: Highlighting trending ESG PR and news globally.
     - *Climate TRACE assets*: Tracking high-emission physical assets like power plants.
     - *NASA Satellite (MODIS Terra)*: Photorealistic cloud and landmass overlays.
   - **Timeline Scrubber**: For historical playback and chronological ESG event tracking.
   - **Threat Overlays**: Real-time popups alerting the user to physical evidence contradictions for specific corporate assets.

2. **Audit Tab (Company ESG Library)**
   - A searchable, comprehensive database of 900+ tracked companies.
   - High-level summaries of extracted Scope 1+2 emissions, ESG grades, data freshness, and source geography.
   - AI Deep-Dive features leveraging RAG (Retrieval-Augmented Generation) to ask direct questions against parsed sustainability PDFs.

3. **Compare Tab**
   - Head-to-head comparison engine allowing stakeholders to stack companies against each other based on quantitative ESG metrics, verified emissions, and AI-assessed risk factors.

4. **Trust UI (Human-in-the-Loop)**
   - Dedicated dashboard for human auditors.
   - Displays a queue of AI-flagged discrepancies, mathematical anomalies, or evidence contradictions.
   - Auditors can confirm, reject, or adjust the AI's findings, feeding the results back into the system to train the models better.

5. **Indore Tab (Smart City Integration)**
   - Localized Smart City dashboard currently configured to display live IoT and civic metrics (e.g., local AQI, waste bin fill levels, and EV charging station availability) specifically for Indore City.

## 4. Technology Stack & Dependencies
GreenOrb is architected as a decoupled system featuring a modern web frontend, a Node.js API gateway, a highly capable Python AI processing backend, and specialized databases.

**Frontend UI/UX:**
- **Core**: React 18, Vite bundler.
- **Visuals & 3D**: `react-globe.gl`, `three.js` to render the immersive interactive globe.
- **Styling**: Vanilla CSS utilizing a customized design system with specific CSS variables (`var(--sf)`, `var(--tx)`, `var(--bg)`, etc.) mimicking modern glassmorphism and dark mode aesthetics.
- **Geospatial Processing**: `h3-js` for dynamic clustering of coordinates into hexagonal grid data structures at different zoom levels.
- **Icons**: `lucide-react`.

**Backend Service (Node.js/Express):**
- **Server**: Express.js serving as the primary REST API and routing gateway.
- **Caching**: `node-cache` implemented on high-traffic routes (like agent status monitoring) to reduce database load.

**AI & Web Scraping Engine (Python):**
- **Core**: Python 3.10+.
- **Orchestration**: `langgraph` and `langchain` managing a stateful multi-agent pipeline.
- **Models**: `Groq` for high-speed Llama 3 LLM inference.
- **Structured Outputs**: `instructor` for ensuring strict JSON schemas from LLM responses via Pydantic.
- **Scraping & Parsing**: `PyPDF2`, `pdfplumber`, `BeautifulSoup4` for digesting unstructured PDFs, web sites, and CSR reports.

**Database Structure:**
- **Provider**: Neon Serverless PostgreSQL.
- **Vector Search**: utilizing the `pgvector` extension to store 768-dimensional text embeddings of corporate documents.

**Web3 Integration (Audit Transparency):**
- Mentioned in the architecture is the use of **Hedera Hashgraph (Solidity/Rust)** for minting `$GORB` tokenomics and maintaining an immutable, transparent ledger of ESG audit records.

## 5. Agent Network Architecture
GreenOrb uses a multi-agent system (MAS) to systematically crawl, parse, summarize, and critique corporate ESG standing:

1. **Scout Agent (Discovery)**
   - **Role**: Discovers new companies releasing sustainability or CSR reports.
   - **Goal**: Identifies 2024/2025 ESG reports globally and performs initial extraction of raw carbon footprints using search skills.
2. **Analyst Agent (Diligence)**
   - **Role**: Deep-scans sustainability performance from large PDFs.
   - **Goal**: Breaks down long-form documents to accurately score detailed Environmental, Social, and Governance (E, S, G) pillars based on text extraction.
3. **Risk Agent (Verification)**
   - **Role**: Detects greenwashing and regulatory exposure.
   - **Goal**: Analyzes vague commitments, identifies reporting methodology gaps, and highlights contradictions in the data.
4. **Strategy Agent (Insights)**
   - **Role**: Investment and policy strategist.
   - **Goal**: Takes all outputs from Scout, Analyst, and Risk to formulate final `BUY`, `HOLD`, or `AVOID` recommendations with high-level rationales tailored for investment intelligence.

## 6. Database Schema Summary
The Neon PostgreSQL instance leverages the following core tables:
- `companies`: Primary metadata source containing `name, sector, country, co2, s1, s2, s3, report_year, lat, lng, audit_status, created_at`.
- `embeddings`: The knowledge base for the RAG engine. Contains `company_name, content, page_number, report_year`, and the `embedding` (VECTOR 768) itself.
- `analysis`: Agent-generated diligence scores (`e_score, s_score, g_score`), strengths, and weaknesses.
- `risks`: Contains assessments on `greenwash`, `reg_risk`, `climate_exp`, `data_quality`.
- `strategies`: Contains `action` (Buy/Hold), `confidence`, `rationale`, and `price_impact`.

## 7. Setup and Installation Instructions
A complete guide to completely run and recreate the full suite locally.

### Prerequisites
- Node.js (v18 or higher)
- NPM or Yarn
- Python (v3.10 or higher)
- A Neon Serverless PostgreSQL instance URI.
- Groq API Key (for LLM inference).

### Step 1: Frontend Setup
1. Open a terminal and navigate to the project root directory.
2. Install Javascript dependencies:
   ```bash
   cd GreenOrb
   npm install
   ```
3. Run the Vite development server:
   ```bash
   npm run dev -- --host --port 5173
   ```
   *The frontend will be accessible at http://localhost:5173/*

### Step 2: Node.js Backend Setup
1. Open a new terminal instance and navigate to the Backend folder.
2. Install JS dependencies for the server:
   ```bash
   cd GreenOrb/Backend
   npm install
   ```
3. Create a `.env` file inside the `Backend` directory containing:
   ```env
   DATABASE_URL=postgresql://<user>:<password>@<neon-host>/<db>?sslmode=require
   PORT=5000
   GROQ_API_KEY=your_groq_api_key_here
   ```
4. Run the database schema migrations to instantiate tables and columns:
   ```bash
   node migrate.js
   ```
5. Boot up the Express API server:
   ```bash
   node index.js
   ```
   *The backend will run on port 5000 and handle API requests from the frontend.*

### Step 3: Python AI Agent Engine Setup
1. Open a third terminal inside the `Backend` directory.
2. Create and activate a Python virtual environment:
   **Windows:**
   ```bash
   python -m venv .venv
   .venv\Scripts\activate
   ```
   **Mac/Linux:**
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```
3. Install the required Python packages (e.g., langgraph, langchain, groq, pydantic, pdfplumber, psycopg2-binary, pgvector):
   ```bash
   pip install -r requirements.txt
   ```
4. Run the master orchestrator or specific agents to begin the automated ESG auditing and populating the database:
   ```bash
   python esg_discovery_agent.py
   ```
   *(Running this script allows the agents to fetch data, chunk PDFs, generate embeddings, and write into the Neon DB, which instantly streams to the Frontend Globe).*
