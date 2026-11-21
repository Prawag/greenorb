import json
from pathlib import Path

"""
ESGSchema Teacher — Learns the structural layout of ESG reports.
After processing a company once, GreenOrb knows WHERE every metric lives.
All future audits of the same report format require zero LLM calls.
"""

SCHEMA_DIR = Path(__file__).parent / "learned"
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
    """Persist a learned schema template to disk as JSON."""
    path = SCHEMA_DIR / f"{template_id}.json"
    path.write_text(json.dumps(schema, indent=2))


def load_schema(template_id: str) -> dict | None:
    """Load a previously learned schema template from disk."""
    path = SCHEMA_DIR / f"{template_id}.json"
    return json.loads(path.read_text()) if path.exists() else None


def list_all_schemas() -> list[str]:
    """List all learned schema template IDs."""
    return [p.stem for p in SCHEMA_DIR.glob("*.json")]
