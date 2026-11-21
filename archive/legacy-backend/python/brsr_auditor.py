import os
import json
import argparse
import time
import asyncio
import fitz  # PyMuPDF

# Use the canonical LLM router and safe_eval utilities
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from llm.router import llm_call
from sandbox.safe_eval import coerce_float

"""
GreenOrb BRSR Compliance Auditor (Principle 6 focus).
Extracts SEBI BRSR Core indicators from Indian sustainability reports.
Uses the resilient LLM router (Gemini → Groq → Ollama) instead of raw API calls.
All numeric values pass through coerce_float() before output.
"""


def extract_text_from_pdf(pdf_path: str, max_pages: int = 50) -> str:
    """Extract text from PDF with page markers."""
    print(f"📄 Extracting text from {os.path.basename(pdf_path)}...")
    try:
        doc = fitz.open(pdf_path)
        text = ""
        for i in range(min(doc.page_count, max_pages)):
            text += f"\n--- Page {i+1} ---\n"
            text += doc[i].get_text()
        return text
    except Exception as e:
        print(f"❌ Error reading PDF: {e}")
        return ""


BRSR_SYSTEM_PROMPT = """You are an expert SEBI BRSR (Business Responsibility and Sustainability Reporting) Auditor.
Your task is to extract structured data from Indian corporate sustainability reports.
Focus on BRSR Principle 6 (Environment) and Principle 3 (Employees) indicators.
Return ONLY valid JSON - no markdown, no prose wrapper, no backticks."""


def build_brsr_prompt(text: str) -> str:
    return f"""Extract BRSR Core indicators from this report.

Return ONLY this JSON format:
{{
    "company_name": "<string>",
    "reporting_year": "YYYY-YYYY",
    "principle_6_environment": {{
        "energy_consumption_gj": <number or null>,
        "renewable_energy_pct": <number or null>,
        "scope_1_emissions_mtco2e": <number or null>,
        "scope_2_emissions_mtco2e": <number or null>,
        "scope_3_emissions_mtco2e": <number or null>,
        "water_withdrawal_kl": <number or null>,
        "waste_generated_mt": <number or null>
    }},
    "principle_3_employees": {{
        "total_employees": <number or null>,
        "differently_abled_employees": <number or null>,
        "women_representation_percent": <number or null>
    }},
    "compliance_status": "High | Medium | Low | Unknown",
    "audit_notes": "<string>"
}}

RULES:
- All numeric values must be raw numbers (int/float), never strings with units.
- If not found, return null — never return 0 or "Not disclosed".
- compliance_status must be one of: High, Medium, Low, Unknown.

Report text (truncated):
{text[:40000]}"""


async def analyze_brsr(text: str, filename: str) -> dict | None:
    """Run BRSR audit via resilient LLM router."""
    print(f"🧠 Running BRSR Compliance Audit via LLM Router...")

    prompt = build_brsr_prompt(text)
    result = await llm_call(prompt, system=BRSR_SYSTEM_PROMPT, task_id=f"brsr_{filename[:30]}")

    if result["error"]:
        print(f"❌ LLM Error: {result['error']}")
        return None

    provider = result["provider_used"]
    print(f"✅ BRSR audit completed via {provider}")

    raw = result["text"].strip()
    if raw.startswith("```json"): raw = raw[7:]
    elif raw.startswith("```"): raw = raw[3:]
    if raw.endswith("```"): raw = raw[:-3]

    try:
        data = json.loads(raw.strip())
    except json.JSONDecodeError:
        print(f"⚠️ Failed to parse BRSR JSON. Raw output:\n{raw[:200]}...")
        return None

    # Coerce all numeric fields through safe pipeline
    p6 = data.get("principle_6_environment", {})
    for field in ["energy_consumption_gj", "renewable_energy_pct",
                  "scope_1_emissions_mtco2e", "scope_2_emissions_mtco2e",
                  "scope_3_emissions_mtco2e", "water_withdrawal_kl",
                  "waste_generated_mt"]:
        p6[field] = coerce_float(p6.get(field), field)

    p3 = data.get("principle_3_employees", {})
    for field in ["total_employees", "differently_abled_employees",
                  "women_representation_percent"]:
        p3[field] = coerce_float(p3.get(field), field)

    data["_provider"] = provider
    return data


def main():
    parser = argparse.ArgumentParser(description="GreenOrb BRSR Compliance Auditor")
    parser.add_argument("pdf_path", help="Path to the SEBI BRSR PDF report")
    args = parser.parse_args()

    if not os.path.exists(args.pdf_path):
        print(f"❌ File not found: {args.pdf_path}")
        return

    text = extract_text_from_pdf(args.pdf_path)
    if not text:
        return

    print(f"✅ Extracted {len(text)} characters. Initiating AI parsing...")
    start_time = time.time()

    brsr_data = asyncio.run(analyze_brsr(text, os.path.basename(args.pdf_path)))

    elapsed = time.time() - start_time
    print(f"⏱️ Audit completed in {elapsed:.1f} seconds.")

    if brsr_data:
        print("\n" + "="*50)
        print("🟢 BRSR AUDIT RESULTS")
        print("="*50)
        # Remove internal metadata for display
        display = {k: v for k, v in brsr_data.items() if not k.startswith("_")}
        print(json.dumps(display, indent=2))

        out_name = os.path.basename(args.pdf_path) + "_brsr_audit.json"
        with open(out_name, "w", encoding="utf-8") as f:
            json.dump(brsr_data, f, indent=2)
        print(f"\n💾 Saved structured audit to: {out_name}")


if __name__ == "__main__":
    main()
