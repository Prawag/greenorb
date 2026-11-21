# GreenOrb — Complete Build Mission
## Single-pass Antigravity Master Prompt

---

> **HOW TO USE THIS:**
> Open Antigravity → Manager View → paste this entire document.
> Set autonomy to **"Approve Writes"** before starting.
> Request an **implementation plan artifact** before any file is modified.
> Do not divide into phases — execute in the dependency order defined below.

---

## 1. PROJECT CONTEXT (read before touching anything)

GreenOrb is an autonomous multi-agent ESG intelligence platform.
It deploys 4 AI agents (Scout → Analyst → Risk → Strategy) via LangGraph
to audit corporate sustainability PDFs, verify carbon math deterministically,
and visualize global emissions on a NASA GIBS-powered 3D globe.

**Primary market:** BRSR-mandated Indian enterprises (SEBI top 1000 listed companies).
**Core differentiator:** Zero-hallucination math audit — LLM extracts a Python formula,
a deterministic sandbox executes it, never the other way around.

### Absolute rules — enforce on every file touched:
- NEVER use `eval()` anywhere. Only `safe_eval()` from `backend/sandbox/safe_eval.py`
- NEVER import external UI libraries (no MUI, no Tailwind, no Chakra)
- ALL CSS must use variables: `var(--color-background-primary)`, `var(--color-text-primary)` etc.
- ALL numeric values from PDFs must pass through `coerce_float()` before DB write
- ALL Gemini API calls must have `asyncio.wait_for(timeout=120)` + try/except → FAILED state
- `$GORB` / Hedera token minting UI is ONLY shown when `VITE_ENABLE_TOKENOMICS=true`
- snake_case for Python files/functions, camelCase for JS/JSX

### Current file structure:
```
greenorb/
├── frontend/src/
│   ├── components/     ← GlobeTab.jsx, AuditTab.jsx, CompareTab.jsx,
│   │                      TrustDashboard.jsx, CityDashboard.jsx
│   ├── hooks/          ← useAgentStatus.js, useEmissionsData.js
│   └── config/         ← cities.config.js (create if missing)
├── backend/
│   ├── agents/         ← scout_agent.py, analyst_agent.py,
│   │                      risk_agent.py, strategy_agent.py
│   ├── orchestrator/   ← langgraph_pipeline.py
│   ├── sandbox/        ← safe_eval.py
│   ├── llm/            ← (create) router.py
│   ├── cache/          ← (create) pdf_cache.py
│   ├── schema/         ← (create) schema_teacher.py, schema_matcher.py
│   │   └── learned/    ← (create dir) stores .json schema templates
│   ├── signals/        ← (create) absence_detector.py
│   ├── config/         ← (create) framework_map.json
│   ├── migrations/     ← SQL migration files
│   └── api/            ← Express routes
└── brsr_auditor.py     ← DO NOT MODIFY — standalone tool
```

---

## 2. GENERATE THIS ARTIFACT FIRST

Before writing a single line of code, generate an **implementation plan artifact**
with this structure:

```
TASK N | File(s) touched | What changes | Depends on task(s)
```

List every task below mapped to files. Flag any ambiguity. Wait for approval
before proceeding. After approval, begin executing in dependency order.

---

## 3. TASKS — EXECUTE IN THIS EXACT ORDER

Dependencies are explicit. Do not start a task until its dependencies are complete.

---

### TASK 1 — Security: Replace eval() with AST sandbox
**Priority: CRITICAL — do this before any other code runs**
**Depends on: nothing**

File: `backend/sandbox/safe_eval.py`

Create or replace with this exact implementation:

```python
import ast
import operator

"""
Safe deterministic formula evaluator.
Only allows arithmetic on named float variables.
Any other node type raises ValueError — no imports, no functions, no strings.
"""

SAFE_OPS = {
    ast.Add:  operator.add,
    ast.Sub:  operator.sub,
    ast.Mult: operator.mul,
    ast.Div:  operator.truediv,
}

def safe_eval(formula: str, variables: dict) -> float:
    """
    Evaluate a simple arithmetic formula with named variables.
    Example: safe_eval("scope_1 + scope_2", {"scope_1": 1200.0, "scope_2": 800.0})
    Returns 2000.0

    Raises ValueError for any non-arithmetic node — blocks all injection attempts.
    """
    tree = ast.parse(formula, mode="eval")
    for node in ast.walk(tree):
        if not isinstance(node, (
            ast.Expression, ast.BinOp, ast.Constant,
            ast.Name, ast.UnaryOp, ast.USub,
            *SAFE_OPS.keys()
        )):
            raise ValueError(
                f"Blocked AST node: {type(node).__name__}. "
                f"Only arithmetic operators and named variables are allowed."
            )
    return float(_eval_node(tree.body, variables))

def _eval_node(node, variables: dict):
    if isinstance(node, ast.Constant):
        return float(node.value)
    if isinstance(node, ast.Name):
        if node.id not in variables:
            raise ValueError(f"Unknown variable: '{node.id}'. Available: {list(variables.keys())}")
        return float(variables[node.id])
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        return -_eval_node(node.operand, variables)
    if isinstance(node, ast.BinOp):
        op_fn = SAFE_OPS.get(type(node.op))
        if not op_fn:
            raise ValueError(f"Blocked operator: {type(node.op).__name__}")
        left  = _eval_node(node.left, variables)
        right = _eval_node(node.right, variables)
        if isinstance(node.op, ast.Div) and right == 0:
            raise ValueError("Division by zero in formula")
        return op_fn(left, right)
    raise ValueError(f"Unsupported node: {type(node).__name__}")
```

Search the entire codebase for any remaining `eval(` calls.
Replace every instance with `safe_eval()`. Log each replacement.

**Verify:** Run `grep -r "eval(" backend/` — result must be empty or only comments.

---

### TASK 2 — Data: Add coerce_float() and fix 0Mt root cause
**Priority: CRITICAL — root cause of all zero values in UI**
**Depends on: nothing (parallel with Task 1)**

File: `backend/agents/analyst_agent.py`

Add this function at the top of the file, below imports:

```python
def coerce_float(value, field_name: str = "") -> float | None:
    """
    Safely convert any LLM-returned value to float.
    Handles: "1,200", "1200 tCO2e", "Not disclosed", None, 0, "", "N/A"
    Returns None (not 0) when value is genuinely absent — null != zero in ESG.
    """
    if value is None:
        return None
    if isinstance(value, (int, float)):
        v = float(value)
        return None if v == 0.0 else v   # Treat 0 from LLM as missing, not zero
    cleaned = str(value).strip()
    if cleaned.lower() in ("", "n/a", "not disclosed", "not available",
                            "nil", "none", "-", "–", "not reported", "nr"):
        return None
    # Strip non-numeric characters except decimal point and minus
    import re
    numeric = re.sub(r"[^\d.\-]", "", cleaned.replace(",", ""))
    try:
        return float(numeric) if numeric else None
    except ValueError:
        return None
```

Then find every DB insert/update in `analyst_agent.py` and wrap ALL numeric
fields through `coerce_float()`. Example pattern:

```python
record = {
    "company_name":       extracted.get("company_name"),
    "scope_1":            coerce_float(extracted.get("scope_1"),  "scope_1"),
    "scope_2":            coerce_float(extracted.get("scope_2"),  "scope_2"),
    "scope_3":            coerce_float(extracted.get("scope_3"),  "scope_3"),
    "reported_total":     coerce_float(extracted.get("reported_total"), "reported_total"),
    "energy_consumption": coerce_float(extracted.get("energy_consumption"), "energy_consumption"),
    "water_withdrawal":   coerce_float(extracted.get("water_withdrawal"), "water_withdrawal"),
    "waste_generated":    coerce_float(extracted.get("waste_generated"), "waste_generated"),
}
```

Also update the Gemini extraction prompt to add this instruction at the end:
```
CRITICAL OUTPUT RULES:
- Return ONLY valid JSON. No markdown, no prose wrapper, no backticks.
- All numeric values must be raw numbers (floats/ints), NEVER strings with units.
- If a metric is not found, return null — never return 0 or "Not disclosed".
- Units are always metric tonnes CO2 equivalent (tCO2e) for emissions.
```

**Verify:** Trigger an audit on any company. Check DB directly — scope_1 column
should contain a float (e.g. 47800000.0) or NULL. Never 0 or a string.

---

### TASK 3 — Reliability: LangGraph timeout + FAILED state
**Priority: CRITICAL — fixes Trust UI stuck on EXTRACTING**
**Depends on: nothing (parallel with Tasks 1–2)**

File: `backend/orchestrator/langgraph_pipeline.py`

Make these three changes:

**Change 1 — Wrap every Gemini call with timeout:**
```python
import asyncio
from datetime import datetime, timezone

async def analyst_node(state: dict) -> dict:
    try:
        result = await asyncio.wait_for(
            _call_gemini_analyst(state["pdf_text"]),
            timeout=120
        )
        return {**state, "analyst_output": result, "status": "VERIFYING"}
    except asyncio.TimeoutError:
        return {
            **state,
            "status":    "FAILED",
            "error":     "Analyst timeout — PDF likely exceeds context window. Try chunking.",
            "failed_at": datetime.now(timezone.utc).isoformat()
        }
    except Exception as e:
        return {
            **state,
            "status":    "FAILED",
            "error":     str(e)[:500],
            "failed_at": datetime.now(timezone.utc).isoformat()
        }
```

Apply the same pattern (try/except with FAILED state return) to
`scout_node`, `risk_node`, and `strategy_node`.

**Change 2 — Add PDF chunker for large documents:**
```python
def chunk_pdf_text(text: str, max_chars: int = 80_000) -> list[str]:
    """Split large PDF text into overlapping chunks for Gemini context window."""
    if len(text) <= max_chars:
        return [text]
    chunks = []
    overlap = 2000
    step = max_chars - overlap
    for i in range(0, len(text), step):
        chunks.append(text[i:i + max_chars])
    return chunks
```

Use `chunk_pdf_text()` in `analyst_node` before passing to Gemini.
Process each chunk and merge results (take non-null values, prefer earlier chunks).

**Change 3 — Add FAILED terminal node to graph:**
```python
from langgraph.graph import StateGraph, END

def failed_node(state: dict) -> dict:
    """Terminal node — job ended in failure, surface error to UI."""
    return state  # Error already in state, just terminate cleanly

# In your graph builder, after defining all nodes:
graph.add_node("failed", failed_node)

def route_after_analyst(state: dict) -> str:
    return "failed" if state.get("status") == "FAILED" else "risk"

graph.add_conditional_edges("analyst", route_after_analyst)
# Add similar routing from scout and risk nodes
```

**Verify:** Run an audit on a very large PDF (200+ pages). Within 130 seconds,
the Trust UI job status must change from EXTRACTING to either VERIFYING or FAILED.
It must never stay on EXTRACTING indefinitely.

---

### TASK 4 — LLM: Multi-provider fallback router
**Priority: HIGH — prevents 429 quota errors**
**Depends on: Tasks 1, 2, 3 complete**

**Step 1 — Install Groq SDK:**
Add to `requirements.txt`:
```
groq>=0.4.0
httpx>=0.27.0
```
Run: `pip install groq httpx`

**Step 2 — Create `backend/llm/router.py`:**
```python
import os, time, asyncio, logging
from enum import Enum

logger = logging.getLogger("llm_router")

class Provider(Enum):
    GEMINI = "gemini"
    GROQ   = "groq"
    OLLAMA = "ollama"

PROVIDER_CHAIN = [Provider.GEMINI, Provider.GROQ, Provider.OLLAMA]

_rate_state = {
    Provider.GEMINI: {"calls": 0, "window_start": time.time(), "rpm": 14},
    Provider.GROQ:   {"calls": 0, "window_start": time.time(), "rpm": 28},
}

def _is_rate_limited(provider: Provider) -> bool:
    if provider not in _rate_state:
        return False
    s = _rate_state[provider]
    now = time.time()
    if now - s["window_start"] > 60:
        s["calls"] = 0
        s["window_start"] = now
    return s["calls"] >= s["rpm"]

def _record_call(provider: Provider):
    if provider in _rate_state:
        _rate_state[provider]["calls"] += 1

async def _call_gemini(prompt: str, system: str) -> str:
    import google.generativeai as genai
    genai.configure(api_key=os.environ["GEMINI_API_KEY"])
    model = genai.GenerativeModel("gemini-1.5-flash", system_instruction=system)
    resp = await model.generate_content_async(
        prompt,
        generation_config={"temperature": 0.1, "max_output_tokens": 4096}
    )
    return resp.text

async def _call_groq(prompt: str, system: str) -> str:
    from groq import AsyncGroq
    client = AsyncGroq(api_key=os.environ["GROQ_API_KEY"])
    resp = await client.chat.completions.create(
        model="llama-3.1-70b-versatile",
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": prompt}
        ],
        temperature=0.1,
        max_tokens=4096
    )
    return resp.choices[0].message.content

async def _call_ollama(prompt: str, system: str) -> str:
    import httpx
    async with httpx.AsyncClient(timeout=180) as client:
        resp = await client.post(
            "http://localhost:11434/api/generate",
            json={
                "model":  os.environ.get("OLLAMA_MODEL", "llama3.2"),
                "prompt": f"{system}\n\n{prompt}",
                "stream": False
            }
        )
        return resp.json()["response"]

_CALLERS = {
    Provider.GEMINI: _call_gemini,
    Provider.GROQ:   _call_groq,
    Provider.OLLAMA: _call_ollama,
}

async def llm_call(prompt: str, system: str = "", task_id: str = "") -> dict:
    """
    Route LLM call through provider chain with automatic fallback.
    Returns: {"text": str, "provider_used": str, "error": str | None}
    """
    last_error = None
    for provider in PROVIDER_CHAIN:
        if _is_rate_limited(provider):
            logger.info(f"[{task_id}] {provider.value} rate-limited, skipping")
            continue
        try:
            logger.info(f"[{task_id}] Attempting {provider.value}")
            text = await asyncio.wait_for(_CALLERS[provider](prompt, system), timeout=120)
            _record_call(provider)
            logger.info(f"[{task_id}] Success via {provider.value}")
            return {"text": text, "provider_used": provider.value, "error": None}
        except Exception as e:
            last_error = str(e)
            logger.warning(f"[{task_id}] {provider.value} failed: {last_error[:120]}")
    return {"text": None, "provider_used": None, "error": f"All providers failed: {last_error}"}
```

**Step 3 — Update all agent files** to use `llm_call()` instead of direct Gemini calls:
```python
# Replace this pattern everywhere:
response = model.generate_content(prompt)

# With this:
from llm.router import llm_call
result = await llm_call(prompt=prompt, system=SYSTEM_PROMPT, task_id=company_name)
if result["error"]:
    raise Exception(result["error"])
text = result["text"]
```

Store `result["provider_used"]` in LangGraph state as `"llm_provider"`.
Display it in TrustDashboard as a small badge: "Analysed via Gemini Flash" or "Groq Llama 3.1".

**Step 4 — Add to `.env`:**
```
GROQ_API_KEY=gsk_your_key_here
OLLAMA_MODEL=llama3.2
```

**Verify:** Trigger 20 rapid audit requests. Monitor logs — after Gemini hits its RPM,
subsequent calls should log "Attempting groq" and succeed. No 429 errors surfaced in UI.

---

### TASK 5 — Performance: PDF result cache (zero API calls for re-runs)
**Priority: HIGH — prevents re-processing same PDFs**
**Depends on: Task 4 complete**

Create `backend/cache/pdf_cache.py`:
```python
import hashlib, json, sqlite3, os, logging
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger("pdf_cache")
DB_PATH = os.environ.get("CACHE_DB_PATH", "backend/cache/pdf_results.db")
Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)

def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS pdf_cache (
            pdf_hash     TEXT PRIMARY KEY,
            company_name TEXT,
            result_json  TEXT NOT NULL,
            provider     TEXT,
            cached_at    TEXT NOT NULL,
            hit_count    INTEGER DEFAULT 0
        )
    """)
    conn.commit()
    return conn

def hash_pdf(pdf_bytes: bytes) -> str:
    """Stable SHA-256 fingerprint of raw PDF bytes."""
    return hashlib.sha256(pdf_bytes).hexdigest()

def get_cached(pdf_hash: str) -> dict | None:
    """Return stored extraction result if exists. Increments hit counter."""
    try:
        row = _conn().execute(
            "SELECT result_json, provider, cached_at FROM pdf_cache WHERE pdf_hash=?",
            (pdf_hash,)
        ).fetchone()
        if row:
            conn = _conn()
            conn.execute(
                "UPDATE pdf_cache SET hit_count = hit_count + 1 WHERE pdf_hash=?",
                (pdf_hash,)
            )
            conn.commit()
            logger.info(f"Cache HIT: {pdf_hash[:12]}...")
            return {**json.loads(row[0]), "_cached": True, "_provider": row[1]}
    except Exception as e:
        logger.error(f"Cache read error: {e}")
    return None

def store_result(pdf_hash: str, result: dict, company_name: str, provider: str):
    """Persist LLM extraction result keyed by PDF content hash."""
    try:
        _conn().execute("""
            INSERT OR REPLACE INTO pdf_cache
            (pdf_hash, company_name, result_json, provider, cached_at)
            VALUES (?, ?, ?, ?, ?)
        """, (pdf_hash, company_name, json.dumps(result), provider,
              datetime.now(timezone.utc).isoformat()))
        _conn().commit()
        logger.info(f"Cached: {company_name} [{pdf_hash[:12]}...]")
    except Exception as e:
        logger.error(f"Cache write error: {e}")
```

**Wire into `analyst_node` in `langgraph_pipeline.py`:**
```python
from cache.pdf_cache import hash_pdf, get_cached, store_result

async def analyst_node(state: dict) -> dict:
    pdf_bytes = state.get("pdf_bytes", b"")
    pdf_hash  = hash_pdf(pdf_bytes) if pdf_bytes else state.get("pdf_url", "")

    # Check cache first — zero API calls if hit
    cached = get_cached(pdf_hash)
    if cached:
        logger.info(f"Cache hit for {state.get('company_name')} — skipping LLM")
        return {**state, "analyst_output": cached, "status": "VERIFYING", "cache_hit": True}

    # Cache miss — continue to LLM call (rest of existing logic)
    # ... existing LLM call code ...
    # After successful extraction, store result:
    store_result(pdf_hash, extracted, state.get("company_name", ""), result["provider_used"])
```

Add to `.env`:
```
CACHE_DB_PATH=backend/cache/pdf_results.db
```

**Verify:** Run the same company audit twice. Second run logs should show
"Cache HIT" and complete in under 1 second with zero API calls.

---

### TASK 6 — Database: Migrate SQLite to Neon PostgreSQL
**Priority: HIGH — SQLite deadlocks on concurrent agent writes**
**Depends on: Tasks 1–5 complete**

**Step 1 — Install psycopg2:**
Add to `requirements.txt`: `psycopg2-binary>=2.9.9`

**Step 2 — Create `backend/migrations/001_neon_initial.sql`:**
Write a complete schema migration file that:
- Reads the current SQLite schema by inspecting all tables
- Converts to PostgreSQL-compatible SQL (TEXT, FLOAT, TIMESTAMP WITH TIME ZONE etc.)
- Adds the new columns needed for this build:
  - `companies` table: add `llm_provider TEXT`, `cache_hit BOOLEAN DEFAULT FALSE`,
    `linguistic_flags JSONB`, `framework_tags JSONB`, `schema_template_id TEXT`
  - Create new `pdf_cache` table matching the structure in Task 5
  - Create new `esg_schemas` table:
    `(id SERIAL PRIMARY KEY, template_id TEXT UNIQUE, schema_json JSONB,
     company_example TEXT, framework TEXT, created_at TIMESTAMPTZ, hit_count INT DEFAULT 0)`
  - Create new `audit_verdicts` table for human-in-the-loop feedback:
    `(id SERIAL PRIMARY KEY, company_name TEXT, verdict TEXT,
     analyst_accepted BOOLEAN, analyst_notes TEXT, created_at TIMESTAMPTZ)`

**Step 3 — Create `backend/db/connection.py`:**
```python
import os
import psycopg2
import psycopg2.extras
from functools import lru_cache

@lru_cache(maxsize=1)
def get_db():
    """Return a connection to Neon PostgreSQL. Falls back to SQLite in dev."""
    neon_url = os.environ.get("DATABASE_URL")
    if neon_url:
        return psycopg2.connect(neon_url, cursor_factory=psycopg2.extras.RealDictCursor)
    # Dev fallback: SQLite via sqlite3
    import sqlite3
    return sqlite3.connect(os.environ.get("SQLITE_PATH", "greenorb.db"))
```

**Step 4 — Update all agent files** to use `get_db()` from `backend/db/connection.py`
instead of any hardcoded SQLite connections.

**Step 5 — Add to `.env`:**
```
DATABASE_URL=postgresql://user:password@host.neon.tech/neondb?sslmode=require
```
(Leave blank in dev — will fall back to SQLite automatically)

**Verify:** With `DATABASE_URL` set, run the migration SQL on Neon.
Start an audit run. Check Neon dashboard — records should appear in real time.

---

### TASK 7 — Original feature: ESGSchema self-learning extraction mesh
**Priority: HIGH — eliminates the API quota problem at its root cause**
**Depends on: Tasks 1–6 complete**

This is the core original architecture. After processing a company once,
GreenOrb learns the LOCATION of every metric in that company's report format.
All future audits of the same company or structurally similar reports require
zero LLM calls.

**Step 1 — Create `backend/schema/schema_teacher.py`:**
```python
import json
from pathlib import Path

SCHEMA_DIR = Path("backend/schema/learned")
SCHEMA_DIR.mkdir(parents=True, exist_ok=True)

SCHEMA_TEACHER_SYSTEM = """
You are an ESG document structure analyst. Your job is NOT to summarize —
it is to create a precise extraction map so future parsing requires zero AI.

For every metric you find, return the VALUE plus exact LOCATION coordinates.
Return ONLY valid JSON. No prose, no markdown, no backticks.
"""

SCHEMA_TEACHER_PROMPT_TEMPLATE = """
Extract all sustainability metrics from this ESG report and return their
exact locations so we can find them in future reports without AI.

Required JSON format:
{{
  "template_id": "<company_shortname>_<sector>_<framework>",
  "company_name": "<full name>",
  "framework": "<GRI|BRSR|TCFD|SASB|CUSTOM>",
  "metrics": {{
    "scope_1": {{
      "value": <float or null>,
      "unit": "tCO2e",
      "page": <int>,
      "section_header": "<exact text>",
      "table_row_text": "<exact text>",
      "column_header": "<year or category>",
      "confidence": <0.0-1.0>
    }},
    "scope_2":            {{ ... same structure ... }},
    "scope_3":            {{ ... same structure ... }},
    "reported_total":     {{ ... same structure ... }},
    "energy_consumption": {{ ... same structure ... }},
    "water_withdrawal":   {{ ... same structure ... }},
    "waste_generated":    {{ ... same structure ... }},
    "renewable_energy_pct": {{ ... same structure ... }}
  }},
  "report_structure": {{
    "total_pages": <int>,
    "emissions_section_page": <int>,
    "social_section_page": <int>,
    "governance_section_page": <int>,
    "data_tables_pages": [<list of page numbers>]
  }}
}}

PDF TEXT:
{pdf_text}
"""

def save_schema(template_id: str, schema: dict):
    path = SCHEMA_DIR / f"{template_id}.json"
    path.write_text(json.dumps(schema, indent=2))

def load_schema(template_id: str) -> dict | None:
    path = SCHEMA_DIR / f"{template_id}.json"
    return json.loads(path.read_text()) if path.exists() else None

def list_all_schemas() -> list[str]:
    return [p.stem for p in SCHEMA_DIR.glob("*.json")]
```

**Step 2 — Create `backend/schema/schema_matcher.py`:**
```python
import fitz  # PyMuPDF
from pathlib import Path
from schema_teacher import load_schema, list_all_schemas

ESG_KEYWORDS = [
    "scope 1", "scope 2", "scope 3", "ghg emissions",
    "direct emissions", "indirect emissions", "carbon",
    "energy consumption", "water withdrawal", "waste",
    "brsr", "gri", "tcfd", "sasb", "sustainability report",
    "environmental", "climate"
]

def fingerprint_pdf(pdf_path: str) -> dict:
    """Extract structural fingerprint — section keywords + page numbers. No LLM."""
    doc = fitz.open(pdf_path)
    found = {"total_pages": len(doc), "section_pages": {}}
    for page_num, page in enumerate(doc):
        text = page.get_text().lower()
        for kw in ESG_KEYWORDS:
            if kw in text and kw not in found["section_pages"]:
                found["section_pages"][kw] = page_num + 1
    return found

def find_best_schema(pdf_fingerprint: dict, threshold: float = 0.82) -> tuple[str | None, float]:
    """
    Compare PDF fingerprint against all learned schemas.
    Returns (template_id, confidence) or (None, score) if below threshold.
    """
    best_id, best_score = None, 0.0
    for template_id in list_all_schemas():
        schema = load_schema(template_id)
        if not schema:
            continue
        stored = schema.get("report_structure", {})
        score = _structural_similarity(pdf_fingerprint, stored)
        if score > best_score:
            best_score, best_id = score, template_id
    return (best_id, best_score) if best_score >= threshold else (None, best_score)

def extract_by_schema(pdf_path: str, schema: dict) -> dict:
    """
    Extract metric values using known page/section coordinates.
    Zero LLM calls. Returns dict of {metric_name: value}.
    """
    doc = fitz.open(pdf_path)
    results = {}
    for metric, location in schema.get("metrics", {}).items():
        if not location or not location.get("page"):
            results[metric] = None
            continue
        page_idx = location["page"] - 1
        if page_idx >= len(doc):
            results[metric] = None
            continue
        page_text = doc[page_idx].get_text()
        row_text = location.get("table_row_text", "")
        value = _find_value_near_text(page_text, row_text, location.get("column_header", ""))
        results[metric] = value
    return results

def _structural_similarity(pdf_struct: dict, stored_struct: dict) -> float:
    """Score how similar two report structures are (0.0–1.0)."""
    pdf_pages   = pdf_struct.get("section_pages", {})
    stored_emit = stored_struct.get("emissions_section_page", 0)
    stored_soc  = stored_struct.get("social_section_page", 0)
    pdf_emit = pdf_pages.get("scope 1", pdf_pages.get("ghg emissions", 0))
    pdf_soc  = pdf_pages.get("social", pdf_pages.get("employee", 0))
    matches = 0
    if abs(pdf_emit - stored_emit) <= 5: matches += 1
    if abs(pdf_soc  - stored_soc)  <= 5: matches += 1
    if abs(pdf_struct.get("total_pages", 0) - stored_struct.get("total_pages", 0)) <= 20:
        matches += 1
    return matches / 3

def _find_value_near_text(page_text: str, row_label: str, column_header: str) -> float | None:
    """Find a numeric value on a page near a known row label. Returns float or None."""
    import re
    if not row_label:
        return None
    idx = page_text.lower().find(row_label.lower())
    if idx == -1:
        return None
    # Look in the 200 characters after the row label for a number
    snippet = page_text[idx:idx+200]
    numbers = re.findall(r"[\d,]+(?:\.\d+)?", snippet)
    if not numbers:
        return None
    # Return largest number found (emission values dwarf formatting numbers)
    parsed = []
    for n in numbers:
        try:
            parsed.append(float(n.replace(",", "")))
        except ValueError:
            pass
    return max(parsed) if parsed else None
```

**Step 3 — Wire ESGSchema into `analyst_node` in `langgraph_pipeline.py`:**

Replace the existing analyst logic with this decision tree:

```python
from schema.schema_matcher import fingerprint_pdf, find_best_schema, extract_by_schema
from schema.schema_teacher import SCHEMA_TEACHER_SYSTEM, SCHEMA_TEACHER_PROMPT_TEMPLATE, save_schema
from llm.router import llm_call
import json

async def analyst_node(state: dict) -> dict:
    pdf_path    = state.get("pdf_path")
    company     = state.get("company_name", "unknown")
    pdf_hash    = state.get("pdf_hash", "")

    # Layer 1: Check PDF result cache
    from cache.pdf_cache import get_cached, store_result
    cached = get_cached(pdf_hash)
    if cached:
        return {**state, "analyst_output": cached, "status": "VERIFYING",
                "cache_hit": True, "schema_used": "cached"}

    # Layer 2: Try schema-based extraction (zero LLM calls)
    try:
        fingerprint = fingerprint_pdf(pdf_path)
        template_id, confidence = find_best_schema(fingerprint)

        if template_id and confidence >= 0.82:
            from schema.schema_teacher import load_schema
            schema = load_schema(template_id)
            extracted_values = extract_by_schema(pdf_path, schema)
            # Coerce all values
            coerced = {k: coerce_float(v, k) for k, v in extracted_values.items()}
            coerced["company_name"] = company
            coerced["_schema_used"] = template_id
            coerced["_schema_confidence"] = confidence
            store_result(pdf_hash, coerced, company, f"schema:{template_id}")
            return {**state, "analyst_output": coerced, "status": "VERIFYING",
                    "schema_used": template_id, "schema_confidence": confidence}
    except Exception as e:
        # Schema extraction failed — fall through to LLM
        import logging
        logging.getLogger("analyst").warning(f"Schema extraction failed: {e}")

    # Layer 3: LLM call (first time seeing this format)
    # Read PDF text
    import fitz
    doc = fitz.open(pdf_path)
    pdf_text = "\n".join(page.get_text() for page in doc)

    # Chunk if needed
    chunks = chunk_pdf_text(pdf_text)
    primary_chunk = chunks[0]  # Use first chunk for schema learning

    try:
        result = await asyncio.wait_for(
            llm_call(
                prompt=SCHEMA_TEACHER_PROMPT_TEMPLATE.format(pdf_text=primary_chunk),
                system=SCHEMA_TEACHER_SYSTEM,
                task_id=company
            ),
            timeout=120
        )
        if result["error"]:
            raise Exception(result["error"])

        # Parse and save schema for future use
        extracted = json.loads(result["text"])
        template_id = extracted.get("template_id", f"unknown_{company[:8]}")
        save_schema(template_id, extracted)

        # Coerce values
        coerced = {}
        for k, v in extracted.get("metrics", {}).items():
            if isinstance(v, dict):
                coerced[k] = coerce_float(v.get("value"), k)
            else:
                coerced[k] = coerce_float(v, k)
        coerced["company_name"] = company
        coerced["_schema_used"] = f"new:{template_id}"

        store_result(pdf_hash, coerced, company, result["provider_used"])
        return {**state, "analyst_output": coerced, "status": "VERIFYING",
                "llm_provider": result["provider_used"], "schema_used": f"new:{template_id}"}

    except asyncio.TimeoutError:
        return {**state, "status": "FAILED",
                "error": "LLM timeout on schema teaching call",
                "failed_at": datetime.now(timezone.utc).isoformat()}
    except json.JSONDecodeError as e:
        return {**state, "status": "FAILED",
                "error": f"LLM returned invalid JSON: {str(e)[:200]}",
                "failed_at": datetime.now(timezone.utc).isoformat()}
    except Exception as e:
        return {**state, "status": "FAILED",
                "error": str(e)[:500],
                "failed_at": datetime.now(timezone.utc).isoformat()}
```

**Verify:**
1. First audit of any company → logs "Schema miss, using LLM" → schema file created in `backend/schema/learned/`
2. Second audit of same company → logs "Schema match: [template_id], confidence: 0.94" → completes in <2s with zero API calls
3. Run 10 different company audits → check `backend/schema/learned/` → should see 3–6 unique templates (companies in same sector share templates)

---

### TASK 8 — Original feature: Absence-as-signal greenwashing detector
**Priority: HIGH — requires no LLM, pure statistical engine**
**Depends on: Task 6 (database with enough company records)**

Create `backend/signals/absence_detector.py`:
```python
"""
Sector baseline greenwashing detector.
Principle: What a company DOESN'T say is as informative as what it does say.
If 70%+ of sector peers disclose a metric but this company omits it, that IS a signal.
No LLM required — pure statistical comparison against the sector DB.
"""

import logging
logger = logging.getLogger("absence_detector")

ABSENCE_THRESHOLD = 0.70  # Flag if 70%+ of peers report it but this company doesn't
HIGH_SEVERITY_THRESHOLD = 0.85

METRIC_LABELS = {
    "scope_1":            "Scope 1 (direct) emissions",
    "scope_2":            "Scope 2 (energy indirect) emissions",
    "scope_3":            "Scope 3 (value chain) emissions",
    "energy_consumption": "Total energy consumption",
    "water_withdrawal":   "Water withdrawal volume",
    "waste_generated":    "Total waste generated",
    "renewable_energy_pct": "Renewable energy percentage",
}

def build_sector_baseline(sector: str, db_conn) -> dict:
    """Calculate disclosure rates for each metric across all companies in this sector."""
    cursor = db_conn.cursor()
    cursor.execute("""
        SELECT
            COUNT(*)                                                      AS total,
            SUM(CASE WHEN scope_1             IS NOT NULL THEN 1 ELSE 0 END) AS s1,
            SUM(CASE WHEN scope_2             IS NOT NULL THEN 1 ELSE 0 END) AS s2,
            SUM(CASE WHEN scope_3             IS NOT NULL THEN 1 ELSE 0 END) AS s3,
            SUM(CASE WHEN energy_consumption  IS NOT NULL THEN 1 ELSE 0 END) AS en,
            SUM(CASE WHEN water_withdrawal    IS NOT NULL THEN 1 ELSE 0 END) AS ww,
            SUM(CASE WHEN waste_generated     IS NOT NULL THEN 1 ELSE 0 END) AS wg,
            SUM(CASE WHEN renewable_energy_pct IS NOT NULL THEN 1 ELSE 0 END) AS re
        FROM companies WHERE sector = %s
    """, (sector,))
    row = cursor.fetchone()
    total = max(row[0], 1)
    return {
        "scope_1":             row[1] / total,
        "scope_2":             row[2] / total,
        "scope_3":             row[3] / total,
        "energy_consumption":  row[4] / total,
        "water_withdrawal":    row[5] / total,
        "waste_generated":     row[6] / total,
        "renewable_energy_pct": row[7] / total,
    }

def detect_absence_signals(company_data: dict, sector: str, db_conn) -> list[dict]:
    """
    Compare a company's disclosures to sector baseline.
    Returns list of absence signals — each is a greenwashing risk flag.
    """
    if not sector:
        return []

    try:
        baseline = build_sector_baseline(sector, db_conn)
    except Exception as e:
        logger.error(f"Baseline query failed for sector {sector}: {e}")
        return []

    signals = []
    for metric, peer_rate in baseline.items():
        if peer_rate < ABSENCE_THRESHOLD:
            continue  # Most peers don't report this either — not suspicious
        if company_data.get(metric) is not None:
            continue  # Company does report this — no signal

        severity = "HIGH" if peer_rate >= HIGH_SEVERITY_THRESHOLD else "MEDIUM"
        signals.append({
            "signal_type": "ABSENT_DISCLOSURE",
            "metric":      metric,
            "metric_label": METRIC_LABELS.get(metric, metric),
            "peer_rate":   round(peer_rate * 100, 1),
            "severity":    severity,
            "brsr_flag":   metric in ("scope_1", "scope_2", "energy_consumption"),
            "message": (
                f"{round(peer_rate * 100)}% of {sector} companies disclose "
                f"{METRIC_LABELS.get(metric, metric)}, but this report omits it. "
                f"Undisclosed metrics in majority-reporting sectors are a "
                f"{'high' if severity == 'HIGH' else 'medium'}-risk greenwashing indicator."
            )
        })

    return sorted(signals, key=lambda s: s["peer_rate"], reverse=True)
```

Wire `detect_absence_signals()` into `risk_agent.py` — call it after math verification,
add the results to `state["absence_signals"]`. Display absence signals in TrustDashboard
as a new "Disclosure Gaps" section with red/orange severity badges.

**Verify:** Find a company in the DB that has null scope_3 but other Energy companies
have scope_3. The Risk Agent output for that company should include an absence signal
flagging the missing Scope 3 disclosure.

---

### TASK 9 — Feature: ClimateBERT linguistic greenwashing layer
**Priority: MEDIUM — catches language-based greenwashing math alone misses**
**Depends on: Tasks 1–3 complete**

**Step 1 — Install dependencies:**
Add to `requirements.txt`:
```
transformers>=4.40.0
torch>=2.0.0
```

**Step 2 — Create `backend/agents/linguistic_risk.py`:**
```python
"""
ClimateBERT linguistic greenwashing detector.
Model: climatebert/distilroberta-base-climate-detector
Classifies ESG text sentences as factual climate statements vs vague/evasive language.
Runs locally — no API calls, no cost, no quota.
"""

import logging
from functools import lru_cache

logger = logging.getLogger("linguistic_risk")
MODEL_ID = "climatebert/distilroberta-base-climate-detector"

@lru_cache(maxsize=1)
def _load_classifier():
    """Load model once, cache in memory. Downloads ~250MB on first run."""
    from transformers import pipeline
    logger.info(f"Loading ClimateBERT model: {MODEL_ID}")
    return pipeline(
        "text-classification",
        model=MODEL_ID,
        device=-1  # CPU — change to 0 for GPU if available
    )

def split_into_sentences(text: str, max_sentences: int = 50) -> list[str]:
    """Simple sentence splitter. Limits to first N sentences for performance."""
    import re
    sentences = re.split(r'(?<=[.!?])\s+', text)
    # Filter: only sentences likely to contain ESG claims (20–200 chars)
    filtered = [s.strip() for s in sentences if 20 < len(s.strip()) < 200]
    return filtered[:max_sentences]

def analyze_claims(sentences: list[str]) -> list[dict]:
    """
    Run ClimateBERT on a list of sentences.
    Returns list of {sentence, label, confidence, greenwashing_risk}
    label: "climate" = factual statement, "not_climate" = vague/evasive
    """
    if not sentences:
        return []

    classifier = _load_classifier()
    results = []
    try:
        outputs = classifier(sentences, truncation=True, max_length=128)
    except Exception as e:
        logger.error(f"ClimateBERT inference failed: {e}")
        return []

    for sentence, output in zip(sentences, outputs):
        label      = output["label"].lower()
        confidence = round(output["score"], 3)

        # Flag as greenwashing risk if the model is confident it's NOT a factual claim
        if label == "not_climate" and confidence > 0.75:
            risk = "HIGH"
        elif label == "not_climate" and confidence > 0.60:
            risk = "MEDIUM"
        else:
            risk = "LOW"

        results.append({
            "sentence":         sentence,
            "label":            label,
            "confidence":       confidence,
            "greenwashing_risk": risk
        })

    return results

def extract_high_risk_claims(text: str) -> list[dict]:
    """
    Convenience function: split text → classify → return only HIGH/MEDIUM risks.
    Use this in the risk_agent pipeline.
    """
    sentences = split_into_sentences(text)
    all_results = analyze_claims(sentences)
    return [r for r in all_results if r["greenwashing_risk"] in ("HIGH", "MEDIUM")]
```

**Step 3 — Wire into `risk_agent.py`:**
```python
from agents.linguistic_risk import extract_high_risk_claims

# In risk_node, after math verification:
pdf_text = state.get("pdf_text_excerpt", "")  # Use first 5,000 chars for speed
linguistic_flags = extract_high_risk_claims(pdf_text) if pdf_text else []
state["linguistic_flags"] = linguistic_flags
```

**Step 4 — Display in TrustDashboard:**
Add a "Language Analysis" section showing each flagged sentence with its
risk level badge and ClimateBERT confidence score.

**Verify:** Pass the sentence "We are committed to a greener future for all stakeholders"
through `extract_high_risk_claims()`. It should return HIGH risk.
Pass "Our Scope 1 emissions were 1,200 tCO2e in FY2024." — should return LOW risk.

---

### TASK 10 — Feature: Regulatory framework crosswalk (BRSR / CSRD / GRI)
**Priority: MEDIUM — transforms audit output into compliance evidence**
**Depends on: Task 2 complete**

**Step 1 — Create `backend/config/framework_map.json`:**
```json
{
  "scope_1": {
    "label": "Scope 1 direct emissions",
    "unit": "tCO2e",
    "BRSR": { "principle": "P6", "indicator": "Essential Indicator 1", "description": "GHG emissions (Scope I)" },
    "CSRD": { "standard": "ESRS E1", "indicator": "E1-4", "description": "GHG emissions — direct" },
    "GRI":  { "standard": "GRI 305", "indicator": "305-1", "description": "Direct (Scope 1) GHG emissions" },
    "TCFD": { "pillar": "Metrics & Targets", "indicator": "a", "description": "Scope 1 emissions" }
  },
  "scope_2": {
    "label": "Scope 2 energy indirect emissions",
    "unit": "tCO2e",
    "BRSR": { "principle": "P6", "indicator": "Essential Indicator 1", "description": "GHG emissions (Scope II)" },
    "CSRD": { "standard": "ESRS E1", "indicator": "E1-4", "description": "GHG emissions — energy indirect" },
    "GRI":  { "standard": "GRI 305", "indicator": "305-2", "description": "Energy indirect (Scope 2) GHG emissions" },
    "TCFD": { "pillar": "Metrics & Targets", "indicator": "a", "description": "Scope 2 emissions" }
  },
  "scope_3": {
    "label": "Scope 3 value chain emissions",
    "unit": "tCO2e",
    "BRSR": { "principle": "P6", "indicator": "Leadership Indicator 1", "description": "GHG emissions (Scope III)" },
    "CSRD": { "standard": "ESRS E1", "indicator": "E1-4", "description": "GHG emissions — value chain" },
    "GRI":  { "standard": "GRI 305", "indicator": "305-3", "description": "Other indirect (Scope 3) GHG emissions" }
  },
  "energy_consumption": {
    "label": "Total energy consumption",
    "unit": "GJ",
    "BRSR": { "principle": "P6", "indicator": "Essential Indicator 2", "description": "Energy consumption (in Joules)" },
    "CSRD": { "standard": "ESRS E1", "indicator": "E1-4", "description": "Energy consumption and mix" },
    "GRI":  { "standard": "GRI 302", "indicator": "302-1", "description": "Energy consumption within the organization" }
  },
  "water_withdrawal": {
    "label": "Total water withdrawal",
    "unit": "KL",
    "BRSR": { "principle": "P6", "indicator": "Essential Indicator 3", "description": "Water withdrawal (in KL)" },
    "CSRD": { "standard": "ESRS E3", "indicator": "E3-4", "description": "Water consumption" },
    "GRI":  { "standard": "GRI 303", "indicator": "303-3", "description": "Water withdrawal" }
  },
  "waste_generated": {
    "label": "Total waste generated",
    "unit": "MT",
    "BRSR": { "principle": "P6", "indicator": "Essential Indicator 5", "description": "Total waste generated (in metric tonnes)" },
    "CSRD": { "standard": "ESRS E5", "indicator": "E5-4", "description": "Resource outflows — waste" },
    "GRI":  { "standard": "GRI 306", "indicator": "306-3", "description": "Waste generated" }
  },
  "renewable_energy_pct": {
    "label": "Renewable energy percentage",
    "unit": "%",
    "BRSR": { "principle": "P6", "indicator": "Essential Indicator 2", "description": "Energy from renewable sources (%)" },
    "CSRD": { "standard": "ESRS E1", "indicator": "E1-4", "description": "Share of renewable energy" },
    "GRI":  { "standard": "GRI 302", "indicator": "302-1", "description": "Renewable energy consumption share" }
  }
}
```

**Step 2 — Create `backend/agents/framework_tagger.py`:**
```python
import json
from pathlib import Path
from functools import lru_cache

FRAMEWORK_MAP_PATH = Path("backend/config/framework_map.json")

@lru_cache(maxsize=1)
def _load_map() -> dict:
    return json.loads(FRAMEWORK_MAP_PATH.read_text())

def tag_metric(metric_key: str, frameworks: list[str] = ["BRSR", "CSRD", "GRI"]) -> dict:
    """
    Return the regulatory framework indicators satisfied by a given metric.
    Returns {} if metric is not in the map.
    """
    framework_map = _load_map()
    if metric_key not in framework_map:
        return {}
    entry = framework_map[metric_key]
    return {fw: entry[fw] for fw in frameworks if fw in entry}

def tag_all_metrics(extracted_data: dict) -> dict:
    """Tag every metric in an extracted data dict. Returns {metric: {framework_tags}}."""
    return {
        metric: tag_metric(metric)
        for metric in extracted_data
        if metric in _load_map() and extracted_data[metric] is not None
    }
```

**Step 3 — Wire into `analyst_agent.py`:**
After extraction and coercion, call:
```python
from agents.framework_tagger import tag_all_metrics
framework_tags = tag_all_metrics(coerced_data)
# Store as JSON column in DB and pass through LangGraph state
state["framework_tags"] = framework_tags
```

**Step 4 — Display in AuditTab.jsx:**
Next to each metric value, show small framework badges (BRSR, CSRD, GRI).
Clicking a badge shows the exact indicator reference in a tooltip.
Example: "47,800,000 Mt  [BRSR P6/EI-1] [CSRD ESRS E1-4] [GRI 305-1]"

**Verify:** After auditing any company, expand a company card in AuditTab.
Non-null scope_1 should show at minimum BRSR and GRI badges.

---

### TASK 11 — UI: Fix Globe camera + wire Climate TRACE emission points
**Priority: HIGH — Globe currently loads facing dark hemisphere with no dots**
**Depends on: Task 2 complete (emission data must exist in DB)**

File: `frontend/src/components/GlobeTab.jsx`

**Change 1 — Fix initial camera position:**
```jsx
import Globe from 'react-globe.gl';
import { useRef, useEffect } from 'react';

const globeRef = useRef();

useEffect(() => {
  // Animate to Asia-Pacific on load — where most emission data exists
  globeRef.current?.pointOfView(
    { lat: 25, lng: 105, altitude: 2.2 },
    1500
  );
}, []);
```

**Change 2 — Fix pointsData null crash:**
```jsx
<Globe
  ref={globeRef}
  pointsData={emissionsData ?? []}
  pointLat={d => d.lat}
  pointLng={d => d.lng}
  pointAltitude={d => {
    const mt = d.emissions_mt || 0;
    return Math.min(Math.sqrt(mt) / 800, 0.5); // Cap at 0.5 to avoid extreme spikes
  }}
  pointRadius={0.4}
  pointColor={d => {
    const mt = d.emissions_mt || 0;
    if (mt > 2000) return '#FF3B3B';
    if (mt > 500)  return '#FF8C00';
    if (mt > 200)  return '#FFD700';
    if (mt > 50)   return '#7CFC00';
    return '#00FA9A';
  }}
  pointLabel={d =>
    `<div style="background:#000a;color:#fff;padding:6px 10px;border-radius:6px;font-size:12px">
      <b>${d.country || d.company_name}</b><br/>
      ${(d.emissions_mt || 0).toLocaleString()} Mt CO₂
    </div>`
  }
  atmosphereColor="#00ff88"
  atmosphereAltitude={0.18}
  globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
/>
```

**Change 3 — Add useEmissionsData hook if missing:**
Create `frontend/src/hooks/useEmissionsData.js` if it doesn't exist:
```js
import { useState, useEffect } from 'react';

export function useEmissionsData() {
  const [data, setData]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    fetch('/api/emissions/globe-points')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  return { data, loading, error };
}
```

Add the Express route `/api/emissions/globe-points` that returns:
```json
[{ "country": "China", "lat": 35.8, "lng": 104.2, "emissions_mt": 11397 }]
```
Pull from the DB companies table, aggregating by country.

**Verify:** Reload app. Globe animates to Asia-Pacific over 1.5s.
Emission dots appear in Asia, North America, Europe.
Hovering a dot shows a clean tooltip with country name and Mt value.

---

### TASK 12 — UI: Multi-city Smart City dashboard
**Priority: HIGH — currently hardcoded to Indore only**
**Depends on: nothing (pure frontend)**

**Step 1 — Create `frontend/src/config/cities.config.js`:**
```js
export const CITIES = {
  indore: {
    name: "Indore", state: "MP", swachh_rank: 1,
    description: "India's cleanest city — Carbon Credit Aggregator pioneer",
    metrics: {
      waste:  { label: "Wet Waste Processed", unit: "Tons/day",  base: 479,   variance: 40,  color: "#f59e0b" },
      biocng: { label: "Methane Capture Yield", unit: "kg/day",  base: 14307, variance: 800, color: "#10b981" },
      solar:  { label: "Solar PV Grid Output", unit: "MW",       base: 4.23,  variance: 0.5, color: "#3b82f6" },
    },
    carbonCredit: { methodology: "ACM0022", rate_per_ton_inr: 1200, annual_credits_est: 8340 }
  },
  surat: {
    name: "Surat", state: "GJ", swachh_rank: 2,
    description: "Textile capital with aggressive solar adoption",
    metrics: {
      waste:  { label: "Wet Waste Processed", unit: "Tons/day",  base: 620,   variance: 55,  color: "#f59e0b" },
      biocng: { label: "Methane Capture Yield", unit: "kg/day",  base: 18200, variance: 900, color: "#10b981" },
      solar:  { label: "Solar PV Grid Output", unit: "MW",       base: 6.1,   variance: 0.6, color: "#3b82f6" },
    },
    carbonCredit: { methodology: "ACM0022", rate_per_ton_inr: 1200, annual_credits_est: 10200 }
  },
  pune: {
    name: "Pune", state: "MH", swachh_rank: 4,
    description: "EV adoption leader with smart waste segregation",
    metrics: {
      waste:  { label: "Wet Waste Processed", unit: "Tons/day",  base: 890,   variance: 70,  color: "#f59e0b" },
      biocng: { label: "Methane Capture Yield", unit: "kg/day",  base: 22100, variance: 1100, color: "#10b981" },
      solar:  { label: "Solar PV Grid Output", unit: "MW",       base: 8.4,   variance: 0.8, color: "#3b82f6" },
    },
    carbonCredit: { methodology: "ACM0022", rate_per_ton_inr: 1200, annual_credits_est: 14800 }
  },
  ahmedabad: {
    name: "Ahmedabad", state: "GJ", swachh_rank: 5,
    description: "Industrial hub driving BRSR supply chain reporting",
    metrics: {
      waste:  { label: "Wet Waste Processed", unit: "Tons/day",  base: 1100,  variance: 90,  color: "#f59e0b" },
      biocng: { label: "Methane Capture Yield", unit: "kg/day",  base: 27000, variance: 1400, color: "#10b981" },
      solar:  { label: "Solar PV Grid Output", unit: "MW",       base: 11.2,  variance: 1.0, color: "#3b82f6" },
    },
    carbonCredit: { methodology: "ACM0022", rate_per_ton_inr: 1200, annual_credits_est: 18900 }
  }
};

export const CITY_IDS = Object.keys(CITIES);
export const getCity  = (id) => CITIES[id] || CITIES.indore;
```

**Step 2 — Refactor `CityDashboard.jsx`:**
- Replace all hardcoded Indore strings with `city = getCity(activeCity)`
- Add a city selector at the top: horizontal tabs or pills showing all CITY_IDS
- All metric cards, values, colors, and descriptions must pull from `city.metrics`
- The `carbonCredit` panel content must use `city.carbonCredit` values
- Use `useState('indore')` for `activeCity` — Indore is the default
- The `$GORB` / token minting section is ONLY rendered when:
  `import.meta.env.VITE_ENABLE_TOKENOMICS === 'true'`

**Verify:** Open the Indore tab — same as before. Switch to Surat —
all three metric cards update to Surat's values and description.
Switch to Ahmedabad — same. Token minting panel must be invisible
unless `VITE_ENABLE_TOKENOMICS=true` is set.

---

### TASK 13 — UI: TrustDashboard compliance view + human-in-the-loop
**Priority: MEDIUM — required for enterprise pilot demos**
**Depends on: Tasks 7, 8, 9 complete (so all signal types exist)**

File: `frontend/src/components/TrustDashboard.jsx`

**Change 1 — Dual view toggle (Developer ↔ Compliance):**
Add a toggle at the top right of TrustDashboard.
- Developer view: current layout (JSON logs, raw data, timing, provider badge)
- Compliance view: clean printable layout suitable for filing with an auditor:
  - Company name + audit date as header
  - 4-step chain rendered as a numbered receipt: ① Extracted Claim ② Source ③ Math ④ Verdict
  - Absence signals as a "Disclosure Gaps" table
  - Linguistic risk flags as a "Language Analysis" table
  - Framework badges summary: which BRSR/CSRD/GRI indicators are satisfied
  - A "Print / Export PDF" button (use `window.print()`)

**Change 2 — Add Accept/Reject buttons to each verdict:**
```jsx
// For each completed audit job:
<div className="verdict-actions">
  <button
    onClick={() => submitVerdict(jobId, 'accepted')}
    className="verdict-accept"
  >
    ✓ Accept verdict
  </button>
  <button
    onClick={() => submitVerdict(jobId, 'rejected')}
    className="verdict-reject"
  >
    ✗ Reject — flag for review
  </button>
</div>
```

Add Express route `POST /api/verdicts` that stores to `audit_verdicts` table:
`{ company_name, verdict, analyst_accepted, analyst_notes, created_at }`

**Change 3 — Show provider badge on each job:**
If `llm_provider` is in the job's state, show a subtle badge:
"Analysed via Gemini Flash" / "Groq Llama 3.1" / "Schema (no LLM)"

**Change 4 — FAILED state must show cleanly:**
A job with `status: "FAILED"` must display:
- Red "FAILED" badge (not a spinner)
- The `error` message in plain language
- The `failed_at` timestamp
- A "Retry" button that re-triggers the job

**Verify:**
1. Complete job → shows 4-step chain, Accept/Reject buttons, provider badge
2. Failed job → shows red FAILED badge with error message and Retry button
3. Extracting job → shows animated progress, not a frozen spinner
4. Toggle to Compliance view → clean printable layout, no JSON visible
5. Click Accept on a verdict → POST to `/api/verdicts`, toast confirmation

---

## 4. FINAL VERIFICATION CHECKLIST

After all 13 tasks complete, use Antigravity's browser agent to verify:

```
□ GlobeTab: loads facing Asia-Pacific, emission dots visible, no dark hemisphere
□ AuditTab: all companies show non-zero Mt values or clear null (not 0Mt)
□ AuditTab: framework badges (BRSR/GRI) visible on expanded company cards
□ TrustDashboard: Reliance Ind. job either VERIFYING, COMPLETED, or FAILED — never frozen EXTRACTING
□ TrustDashboard: Developer ↔ Compliance toggle works
□ TrustDashboard: Accept/Reject buttons present on completed jobs
□ CityDashboard: city selector shows Indore, Surat, Pune, Ahmedabad
□ CityDashboard: switching cities updates ALL metric values and colors
□ CityDashboard: $GORB panel is INVISIBLE (VITE_ENABLE_TOKENOMICS not set)
□ Run grep -r "eval(" backend/ — zero results (only comments allowed)
□ backend/schema/learned/ exists and is writable
□ backend/cache/ directory exists with pdf_results.db after first audit run
□ Trigger same company audit twice — second run logs "Cache HIT"
□ Trigger 20 rapid requests — after Gemini rate limit, logs show Groq fallback
□ Run ClimateBERT test: "We are committed to a greener future" → HIGH risk flag
```

---

## 5. ENVIRONMENT VARIABLES NEEDED

Confirm these exist in `.env` before running any task:
```
GEMINI_API_KEY=your_existing_key
GROQ_API_KEY=gsk_get_from_console.groq.com
OLLAMA_MODEL=llama3.2
DATABASE_URL=postgresql://...neon.tech/...  (leave blank for SQLite in dev)
CACHE_DB_PATH=backend/cache/pdf_results.db
VITE_ENABLE_TOKENOMICS=false
```

---

*End of GreenOrb master build prompt.*
*Total scope: 13 tasks, zero phases, complete dependency ordering.*
*Every file path, function signature, and verification step is explicit.*
*Generate implementation plan artifact before writing any code.*
