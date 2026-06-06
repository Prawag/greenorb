# SKILL: MiroFish Swarm Intelligence (The Secret Brain)

## Overview
This skill documents how to leverage the **MiroFish** engine—a multi-agent swarm intelligence tool running as GreenOrb's "Secret Brain." 

Because ESG reports differ wildly between companies (some use detailed charts, some use complex tables spanning multiple pages, some use narrative formats), traditional regex, heuristics, and single-pass LLM prompts often fail to extract accurate data. 

**MiroFish** solves this by generating an interactive knowledge graph from the PDF text and allowing multiple simulated agents (like 'Auditor', 'Data Scientist', and 'Climate Strategist') to debate the document's meaning in a sandboxed environment until they reach a precise, cross-validated consensus on the target metrics.

## Prerequisites
- The MiroFish backend must be running (typically `http://localhost:5001`).
- The `MiroFish/.env` file must be configured with a valid `LLM_API_KEY` and `ZEP_API_KEY`.
- The `mirofish_adapter.py` module must be present in `esg_agent/modules/`.

## When to Use This Skill
- **The Analyst Agent:** Use when standard tabular extraction (`pdfplumber` + regex) fails or returns ambiguous results (e.g., if Scope 3 is split into 15 sub-categories across 3 pages).
- **The Risk Agent:** Use when evaluating greenwashing. You can feed the sustainability narrative into MiroFish and ask the swarm to simulate an audit by an aggressive environmental NGO.
- **The Strategy Agent:** Use to simulate market reactions. Feed the company's metrics into the swarm and ask it to predict the impact on the stock's ESG rating.

## How to Use This Skill

### Example 1: Extracting Complex Metrics (Analyst)
Instead of processing the PDF yourself, pass the filtered text blocks to the adapter:

```python
from modules.mirofish_adapter import run_swarm_extraction

async def analyze_company(company_name, pdf_blocks):
    # The adapter will spin up the swarm and return a JSON consensus
    metrics = await run_swarm_extraction(
        company_name=company_name, 
        pdf_text_blocks=pdf_blocks,
        target_metrics=["Scope 1 Emissions", "Scope 2 Emissions", "Scope 3 Emissions", "Water Usage"]
    )
    
    if metrics:
        print(f"Swarm reached consensus: {metrics}")
    else:
        print("Swarm failed to extract data.")
```

### Example 2: Running Custom Simulations (Strategy/Risk)
If you need to run a custom simulation (not just extraction), you can interact directly with the MiroFish API:

```python
import httpx
import json

async def run_greenwashing_audit(company_name, report_text):
    prompt = (
        "You are a swarm of investigative journalists and climate scientists. "
        "Review this company's claims and debate whether they constitute greenwashing. "
        "Output a risk score from 1-100 and a 2-sentence rationale."
    )
    
    payload = {
        "seed_material": report_text,
        "prompt": prompt,
        "simulation_rounds": 8 # Allow more rounds for deeper debate
    }
    
    async with httpx.AsyncClient(timeout=600.0) as client:
        response = await client.post("http://localhost:5001/api/v1/simulate", json=payload)
        return response.json().get("final_report")
```

## Important Considerations
1. **Time and Cost:** Swarm intelligence requires significant LLM inference. Each simulation can take 1-5 minutes and consume 50k-100k tokens. **Use it sparingly**—only as a fallback or for deep diligence.
2. **Memory:** The swarm retains long-term memory via Zep Cloud. This means if you audit 'Apple' today, the swarm will remember its findings if you ask it to simulate 'Apple' again next month. You don't need to feed it the same context twice.
