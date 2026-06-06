import os
import sys
import json
import argparse
import asyncio
import time
import requests
import psycopg2
from dotenv import load_dotenv
load_dotenv(override=True)

import fitz  # PyMuPDF

# Insert current directory into path for local imports
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

from llm.router import llm_call
from sandbox.safe_eval import coerce_float

DATABASE_URL = os.environ.get("DATABASE_URL")
FRAMEWORK_MAP_PATH = os.path.join(current_dir, "config", "framework_map.json")

def extract_text_from_pdf(pdf_path: str, max_pages: int = 50) -> str:
    """Extract text from PDF with page markers."""
    try:
        doc = fitz.open(pdf_path)
        text = ""
        for i in range(min(doc.page_count, max_pages)):
            text += f"\n--- Page {i+1} ---\n"
            text += doc[i].get_text()
        return text
    except Exception as e:
        print(f"ERROR: Reading PDF: {e}", file=sys.stderr)
        return ""

BRSR_SYSTEM_PROMPT = """You are an expert SEBI BRSR (Business Responsibility and Sustainability Reporting) Auditor.
Your task is to extract structured ESG data from corporate sustainability reports.
Focus on BRSR Principle 6 (Environment) and Principle 3 (Employees) indicators.
Return ONLY valid JSON - no markdown, no prose, no backticks."""

def build_brsr_prompt(text: str) -> str:
    return f"""Extract BRSR Core indicators from this report across multiple principles.

Return ONLY this JSON format:
{{
    "reporting_year": "YYYY-YYYY",
    "metrics": {{
        "scope_1": <number or null>,
        "scope_2": <number or null>,
        "scope_3": <number or null>,
        "energy_consumption": <number or null>,
        "water_withdrawal": <number or null>,
        "waste_generated": <number or null>,
        "renewable_energy_pct": <number or null>,
        "women_workforce_pct": <number or null>,
        "rd_spend_sustainability": <number or null>,
        "net_zero_target_year": <number or null>,
        "employee_turnover_rate": <number or null>,
        "median_remuneration": <number or null>,
        "posh_complaints": <number or null>,
        "ltifr": <number or null>,
        "training_hours_per_employee": <number or null>,
        "csr_spend": <number or null>,
        "local_sourcing_pct": <number or null>,
        "trade_associations_count": <number or null>,
        "anti_competitive_fines": <number or null>,
        "customer_complaints": <number or null>,
        "data_breach_incidents": <number or null>
    }},
    "reported_total_emissions": <number or null>
}}

RULES:
- All numeric values must be raw numbers (int/float), never strings with units.
- If a value is a year (e.g., 2040), return it as an integer.
- If a value is a count (e.g., number of complaints), return as an integer.
- If not found, return null — never return 0 or "Not disclosed".
- reported_total_emissions is the total GHG emissions reported in the text (if explicitly stated, else null).

Report text (truncated):
{text[:45000]}"""

async def extract_brsr_data(text: str, filename: str) -> dict | None:
    """Run BRSR audit via resilient LLM router."""
    prompt = build_brsr_prompt(text)
    result = await llm_call(prompt, system=BRSR_SYSTEM_PROMPT, task_id=f"brsr_pipeline_{filename[:30]}")

    if result["error"]:
        print(f"ERROR: LLM Router error: {result['error']}", file=sys.stderr)
        return None

    raw = result["text"].strip()
    if raw.startswith("```json"): raw = raw[7:]
    elif raw.startswith("```"): raw = raw[3:]
    if raw.endswith("```"): raw = raw[:-3]

    try:
        data = json.loads(raw.strip())
    except json.JSONDecodeError:
        print(f"ERROR: Failed to parse LLM JSON: {raw[:300]}", file=sys.stderr)
        return None

    # Coerce numeric values
    metrics = data.get("metrics", {})
    for field in ["scope_1", "scope_2", "scope_3", "energy_consumption", 
                  "water_withdrawal", "waste_generated", "renewable_energy_pct", "women_workforce_pct",
                  "rd_spend_sustainability", "net_zero_target_year", "employee_turnover_rate",
                  "median_remuneration", "posh_complaints", "ltifr", "training_hours_per_employee",
                  "csr_spend", "local_sourcing_pct", "trade_associations_count", "anti_competitive_fines",
                  "customer_complaints", "data_breach_incidents"]:
        metrics[field] = coerce_float(metrics.get(field), field)
    
    data["metrics"] = metrics
    data["reported_total_emissions"] = coerce_float(data.get("reported_total_emissions"), "reported_total_emissions")
    return data

def get_framework_tags(metrics: dict) -> dict:
    """Map metrics to compliance standards."""
    try:
        with open(FRAMEWORK_MAP_PATH, "r", encoding="utf-8") as f:
            fw_map = json.load(f)
        tags = {}
        for k, v in metrics.items():
            if v is not None and k in fw_map:
                tags[k] = fw_map[k]
        return tags
    except Exception as e:
        print(f"WARNING: Framework mapping failed: {e}", file=sys.stderr)
        return {}

def calculate_peer_baselines(sector: str) -> dict:
    """Compute peer disclosure rates in the database."""
    default_baselines = {
        "scope_1": 0.8, "scope_2": 0.8, "scope_3": 0.4,
        "energy_consumption": 0.75, "water_withdrawal": 0.7,
        "waste_generated": 0.65, "renewable_energy_pct": 0.6
    }
    if not DATABASE_URL:
        return default_baselines

    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN s1 IS NOT NULL THEN 1 ELSE 0 END) as s1,
                SUM(CASE WHEN s2 IS NOT NULL THEN 1 ELSE 0 END) as s2,
                SUM(CASE WHEN s3 IS NOT NULL THEN 1 ELSE 0 END) as s3,
                SUM(CASE WHEN energy_consumption IS NOT NULL THEN 1 ELSE 0 END) as en,
                SUM(CASE WHEN water_withdrawal IS NOT NULL THEN 1 ELSE 0 END) as ww,
                SUM(CASE WHEN waste_generated IS NOT NULL THEN 1 ELSE 0 END) as wg,
                SUM(CASE WHEN renewable_energy_pct IS NOT NULL THEN 1 ELSE 0 END) as re
            FROM companies WHERE sector = %s
        """, (sector,))
        
        row = cursor.fetchone()
        cursor.close()
        conn.close()

        if row and row[0] > 0:
            total = float(row[0])
            return {
                "scope_1": row[1] / total,
                "scope_2": row[2] / total,
                "scope_3": row[3] / total,
                "energy_consumption": row[4] / total,
                "water_withdrawal": row[5] / total,
                "waste_generated": row[6] / total,
                "renewable_energy_pct": row[7] / total
            }
    except Exception as e:
        print(f"WARNING: Database baseline calculation failed: {e}", file=sys.stderr)
    
    return default_baselines

def verify_scope2_with_grid(country: str, reported_scope2: float, reported_energy: float) -> dict | None:
    """Cross check reported Scope 2 against Electricity Maps grid factors."""
    if not country or reported_scope2 is None or reported_energy is None or reported_scope2 <= 0 or reported_energy <= 0:
        return None

    try:
        r = requests.get("http://localhost:5000/api/globe/grid", timeout=5)
        grid_data = r.json().get("data", [])
        
        country_grid = next(
            (z for z in grid_data if country.lower() in z["name"].lower()),
            None
        )
        
        if country_grid:
            ci = float(country_grid["carbon_intensity"])  # gCO2eq/kWh
            energy_kwh = float(reported_energy) * 277.778  # GJ to kWh
            calculated_scope2 = (energy_kwh * ci) / 1e6  # tonnes CO2e
            
            ratio = abs(calculated_scope2 - reported_scope2) / reported_scope2
            if ratio > 0.25:
                return {
                    "reported_scope2": reported_scope2,
                    "calculated_scope2": round(calculated_scope2, 1),
                    "discrepancy_pct": round(ratio * 100, 1),
                    "severity": "HIGH" if ratio > 0.5 else "MEDIUM",
                    "ci": ci,
                    "message": (
                        f"Scope 2 discrepancy: Reported {reported_scope2:,.1f} tCO2e differs "
                        f"{ratio*100:.1f}% from grid-verified estimate ({calculated_scope2:,.1f} tCO2e) "
                        f"using country emission factor of {ci} gCO2/kWh."
                    )
                }
    except Exception as e:
        print(f"WARNING: Grid verification failed: {e}", file=sys.stderr)
    return None

def main():
    parser = argparse.ArgumentParser(description="BRSR Complete Audit Pipeline")
    parser.add_argument("pdf_path", help="Path to PDF")
    parser.add_argument("company_name", help="Company Name")
    parser.add_argument("sector", help="Company Sector")
    parser.add_argument("--country", default="India", help="Company Country")
    args = parser.parse_args()

    if not os.path.exists(args.pdf_path):
        print(json.dumps({"error": f"File not found: {args.pdf_path}"}))
        sys.exit(1)

    text = extract_text_from_pdf(args.pdf_path)
    if not text:
        print(json.dumps({"error": "Failed to extract text from PDF"}))
        sys.exit(1)

    filename = os.path.basename(args.pdf_path)
    brsr_data = asyncio.run(extract_brsr_data(text, filename))

    if not brsr_data:
        print(json.dumps({"error": "Failed to extract BRSR structured indicators"}))
        sys.exit(1)

    metrics = brsr_data.get("metrics", {})
    reported_total = brsr_data.get("reported_total_emissions")
    
    # 1. Framework Tagging
    framework_tags = get_framework_tags(metrics)

    # 2. Peer Gap Analysis (Absence Signals)
    peer_rates = calculate_peer_baselines(args.sector)
    reporting_gaps = []
    
    labels = {
        "scope_1": "Scope 1 emissions", "scope_2": "Scope 2 emissions", 
        "scope_3": "Scope 3 emissions", "energy_consumption": "Total energy consumption",
        "water_withdrawal": "Total water withdrawal", "waste_generated": "Total waste generated",
        "renewable_energy_pct": "Renewable energy percentage"
    }
    
    for metric, rate in peer_rates.items():
        if metrics.get(metric) is None:
            if rate >= 0.70:
                severity = "HIGH" if rate >= 0.85 else "MEDIUM"
                reporting_gaps.append({
                    "metric": metric,
                    "metric_label": labels.get(metric, metric),
                    "peer_disclosure_rate": round(rate * 100, 1),
                    "severity": severity,
                    "message": f"{round(rate*100)}% of sector peers report {labels.get(metric, metric)}, but this report omits it."
                })

    # 3. Anomaly & Discrepancy Detections
    anomaly_flags = []
    
    # Check A: Math Discrepancy
    s1 = metrics.get("scope_1")
    s2 = metrics.get("scope_2")
    if s1 is not None and s2 is not None and reported_total is not None:
        math_total = s1 + s2
        diff = abs(math_total - reported_total)
        if reported_total > 0 and (diff / reported_total) > 0.01:  # > 1% diff
            anomaly_flags.append({
                "metric": "emissions_total",
                "metric_label": "Total Emissions Sum",
                "type": "MATH_DISCREPANCY",
                "severity": "HIGH",
                "message": f"Sum of Scope 1 + Scope 2 ({math_total:,.1f} tCO2e) does not match reported total emissions ({reported_total:,.1f} tCO2e) by {diff/reported_total*100:.1f}%.",
                "details": {"reported": reported_total, "calculated": math_total, "diff": diff}
            })

    # Check B: Grid Carbon Discrepancy
    grid_discrepancy = verify_scope2_with_grid(args.country, s2, metrics.get("energy_consumption"))
    if grid_discrepancy:
        anomaly_flags.append({
            "metric": "scope_2",
            "metric_label": "Scope 2 Emissions",
            "type": "GRID_DISCREPANCY",
            "severity": grid_discrepancy["severity"],
            "message": grid_discrepancy["message"],
            "details": grid_discrepancy
        })

    # 4. Compliance Scoring
    score = 100
    for gap in reporting_gaps:
        score -= 15 if gap["severity"] == "HIGH" else 8
    for flag in anomaly_flags:
        score -= 20 if flag["severity"] == "HIGH" else 10
    
    score = max(0, min(100, score))
    rating = "High" if score >= 80 else "Medium" if score >= 50 else "Low"

    # 5. Sector CBAM liability (if sector applicable)
    cbam_applicable = args.sector in ["Steel", "Aluminium", "Cement", "Fertilizers"]
    CBAM_BENCHMARKS = {"Steel": 2.1, "Cement": 0.82, "Aluminium": 14.5, "Fertilizers": 2.5}
    cbam_risk = {"applicable": cbam_applicable, "sector": args.sector, "net_liability_eur": 0, "verified_offset_eur": 0, "penalty_liability_eur": 0}
    
    if cbam_applicable and s1:
        net_tariff = 70.0  # Net €70/tonne (EU ETS - India CCTS)
        cbam_risk["net_liability_eur"] = round(10000 * CBAM_BENCHMARKS.get(args.sector, 1.0) * net_tariff, 1)
        cbam_risk["verified_offset_eur"] = round(s1 * net_tariff, 1)
        cbam_risk["penalty_liability_eur"] = round(s1 * 2.1 * 80.0, 1)

    # 6. Formulate recommendations
    recommendations = []
    if reporting_gaps:
        recommendations.append({
            "category": "COMPLIANCE",
            "priority": "HIGH" if any(g["severity"] == "HIGH" for g in reporting_gaps) else "MEDIUM",
            "message": f"Disclose omitted metrics: {', '.join([g['metric_label'] for g in reporting_gaps])} to match industry baseline."
        })
    if anomaly_flags:
        recommendations.append({
            "category": "DATA_QUALITY",
            "priority": "HIGH" if any(f["severity"] == "HIGH" for f in anomaly_flags) else "MEDIUM",
            "message": "Audit and resolve carbon calculations to eliminate mathematical and location grid discrepancies."
        })
    if cbam_applicable:
        recommendations.append({
            "category": "DECARBONIZATION",
            "priority": "HIGH" if cbam_risk["penalty_liability_eur"] > 1000000 else "MEDIUM",
            "message": f"Initiate verified carbon emission reduction at facilities to mitigate border adjustment tax (CBAM) liabilities."
        })
    if not recommendations:
        recommendations.append({
            "category": "COMPLIANCE",
            "priority": "MEDIUM",
            "message": "Maintain reporting excellence and initiate Scope 3 vendor engagement audits."
        })

    # Assemble Gap Report output
    report = {
        "metadata": {
            "company_name": args.company_name,
            "reporting_year": brsr_data.get("reporting_year") or "2024-2025",
            "audit_date": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "compliance_rating": rating,
            "compliance_score": score
        },
        "metrics": metrics,
        "framework_tags": framework_tags,
        "reporting_gaps": reporting_gaps,
        "anomaly_flags": anomaly_flags,
        "cbam_risk": cbam_risk,
        "recommendations": recommendations
    }

    print(json.dumps(report, indent=2))

if __name__ == "__main__":
    main()
