import os
import json
import fitz
import asyncio
from orchestrator.state import AgentState
from sandbox.safe_eval import coerce_float
from llm.router import llm_call
from agents.framework_tagger import tag_all_metrics
import cache.pdf_cache as pdf_cache


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


async def analyst_agent(state: AgentState) -> dict:
    """
    Analyst Agent: Extracts ESG metrics from PDFs using 3-layer extraction:
      Layer 1: PDF result cache (zero API calls if hit)
      Layer 2: Schema-based extraction (zero LLM calls if learned)  [future]
      Layer 3: LLM via resilient router (Gemini → Groq fallback)
    All numeric values pass through coerce_float(). Framework tags auto-applied.
    """
    company = state.get('company', 'Unknown')
    print(f"\n[Analyst Agent] Extracting text and parsing metrics for {company}...")

    if not state.get("pdf_path"):
        return {"status": "FAILED", "failed_at": "analyst_agent", "error": "No PDF provided to Analyst."}

    try:
        def read_pdf():
            doc = fitz.open(state["pdf_path"])
            text = ""
            for i in range(doc.page_count):
                text += doc[i].get_text()
            return text

        # Offload heavy IO to thread to not block event loop
        text = await asyncio.to_thread(read_pdf)
    except Exception as e:
        return {"status": "FAILED", "failed_at": "analyst_agent", "error": f"PDF Read Error: {e}"}

    # Chunk the PDF text with overlap for large documents
    chunks = chunk_pdf_text(text)
    safe_text_chunk = chunks[0]  # Primary chunk for extraction

    prompt = f"""You are the GreenOrb Analyst Agent.
Extract ALL sustainability metrics from this ESG/sustainability report.
CRITICAL: DO NOT CALCULATE TOTALS YOURSELF.
Only extract the raw numbers and provide a Python expression string to compute the total mathematically.

Return ONLY this JSON format:
{{
    "scope_1": <number or null>,
    "scope_2": <number or null>,
    "scope_3": <number or null>,
    "reported_total": <number or null>,
    "energy_consumption": <number or null>,
    "water_withdrawal": <number or null>,
    "waste_generated": <number or null>,
    "renewable_energy_pct": <number or null>,
    "math_formula": "scope_1 + scope_2"
}}

CRITICAL OUTPUT RULES:
- Return ONLY valid JSON. No markdown, no prose wrapper, no backticks.
- All numeric values must be raw numbers (floats/ints), NEVER strings with units.
- If a metric is not found, return null — never return 0 or "Not disclosed".
- Units are always metric tonnes CO2 equivalent (tCO2e) for emissions.

Text snippet: {safe_text_chunk}"""

    # --- Layer 1: Cache check (zero API calls if already processed) ---
    cached = await asyncio.to_thread(pdf_cache.get, company, state["pdf_path"])
    if cached:
        print(f"[Analyst Agent] Cache HIT — skipping LLM call")
        return {"extracted_data": cached, "raw_text": safe_text_chunk[:1000], "status": "ANALYST_COMPLETE", "cache_hit": True}

    # --- Layer 3: LLM call via resilient router (Gemini → Groq → Ollama fallback) ---
    try:
        result = await llm_call(prompt, company=company)
        if result["error"]:
            return {"status": "FAILED", "failed_at": "analyst_agent", "error": result["error"]}
        raw_text = result["text"]
        provider_used = result["provider_used"]
    except RuntimeError as e:
        return {"status": "FAILED", "failed_at": "analyst_agent", "error": str(e)}
    except asyncio.TimeoutError:
        return {"status": "FAILED", "failed_at": "analyst_agent", "error": "All LLM providers timed out (120s)"}

    try:
        json_str = raw_text.strip()
        if json_str.startswith("```json"): json_str = json_str[7:]
        elif json_str.startswith("```"): json_str = json_str[3:]
        if json_str.endswith("```"): json_str = json_str[:-3]

        parsed_data = json.loads(json_str.strip())

        # Coerce ALL numeric fields through coerce_float
        NUMERIC_FIELDS = [
            "scope_1", "scope_2", "scope_3", "reported_total",
            "energy_consumption", "water_withdrawal", "waste_generated",
            "renewable_energy_pct"
        ]
        for field in NUMERIC_FIELDS:
            parsed_data[field] = coerce_float(parsed_data.get(field), field)

        print(f"[Analyst Agent] Extracted coerced floats: S1={parsed_data['scope_1']}, S2={parsed_data['scope_2']}, S3={parsed_data.get('scope_3')}")

        # Apply regulatory framework tags (BRSR / CSRD / GRI)
        try:
            framework_tags = tag_all_metrics(parsed_data)
            parsed_data["_framework_tags"] = framework_tags
            tagged_count = len(framework_tags)
            print(f"[Analyst Agent] Tagged {tagged_count} metrics with regulatory frameworks")
        except Exception as e:
            print(f"[Analyst Agent] Framework tagging skipped: {e}")

        # --- Write to cache for next run ---
        await asyncio.to_thread(pdf_cache.put, company, state["pdf_path"], parsed_data, provider_used)

        return {
            "extracted_data": parsed_data,
            "raw_text": safe_text_chunk[:1000],
            "status": "ANALYST_COMPLETE",
            "llm_provider": provider_used
        }

    except Exception as e:
        return {"status": "FAILED", "failed_at": "analyst_agent", "error": f"JSON parse error: {e}"}
