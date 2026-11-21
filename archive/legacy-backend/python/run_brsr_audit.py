import os
import sys
import json
import re
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

# --- Data keywords: the actual metrics we're hunting for ---
DATA_KEYWORDS = [
    r"scope\s*1", r"scope\s*2", r"scope\s*3", r"ghg\s*emission",
    r"co2e?", r"tco2", r"carbon\s*(di)?oxide",
    r"energy\s*consumption", r"total\s*energy", r"electricity\s*consumption",
    r"water\s*withdrawal", r"water\s*consumption", r"water\s*discharg",
    r"waste\s*generat", r"hazardous\s*waste", r"non.hazardous",
    r"renewable\s*energy", r"solar|wind\s*energy",
    r"net[\s\-]*zero", r"carbon\s*neutral",
    r"women.*workforce|female.*employ|gender\s*divers",
    r"employee\s*turnover", r"attrition\s*rate",
    r"ltifr|lost\s*time\s*injury", r"safety\s*incident",
    r"training\s*hours", r"skill\s*develop",
    r"csr\s*spend|corporate\s*social\s*responsibility\s*expend",
    r"local\s*sourcing|local\s*procurement",
    r"posh|sexual\s*harassment",
    r"data\s*breach|cyber\s*security\s*incident",
    r"anti[\s\-]*competitive|anti[\s\-]*trust",
    r"customer\s*complaint",
    r"median\s*remuneration|median\s*salary",
    r"mwh|gwh|gigajoule|terajoule|gj\b|tj\b",
    r"kilolitre|megalitre|kl\b|ml\b",
    r"metric\s*ton|mt\b|tonnes?\b",
    r"verification|third.party\s*assur|external\s*audit",
    r"brsr|principle\s*[1-9]", r"gri\s*\d", r"tcfd", r"sasb",
    r"gwp|boundary\s*approach|operational\s*control",
    r"r&d\s*sustain|research.*sustain",
]

# --- Junk signals: pages that are ads, covers, or marketing fluff ---
JUNK_SIGNALS = [
    r"^.{0,200}$",                       # Nearly empty pages
    r"all\s*rights\s*reserved",           # Legal disclaimers
    r"forward[\s\-]*looking\s*statement", # Boilerplate legal
    r"table\s*of\s*contents",             # TOC page
    r"disclaimer",                        # Disclaimer pages
    r"this\s*page\s*(is|has been)\s*(intentionally|left)\s*blank",
]


from typing import Tuple, Optional, Dict

def _page_data_score(text: str) -> Tuple[int, int]:
    """
    Score a page by:
    1. keyword_hits: how many distinct ESG data keywords appear
    2. number_density: how many actual numbers (potential metric values) appear
    Returns (keyword_hits, number_density).
    """
    t = text.lower()
    keyword_hits = sum(1 for kw in DATA_KEYWORDS if re.search(kw, t))
    # Count actual numbers on the page (dates and page numbers are short, real metrics are longer)
    numbers = re.findall(r'\b\d[\d,\.]+\b', t)
    # Filter out likely page numbers / years (1-4 digit standalone)
    real_numbers = [n for n in numbers if len(n.replace(',','').replace('.','')) >= 2]
    return keyword_hits, len(real_numbers)


def _is_junk_page(text: str) -> bool:
    """Return True if this page is a cover, ad, disclaimer, or blank."""
    t = text.strip().lower()
    if len(t) < 100:  # Nearly blank
        return True
    for pattern in JUNK_SIGNALS:
        if re.search(pattern, t):
            # Only reject if the page has very few real keywords
            kw, _ = _page_data_score(t)
            if kw < 2:
                return True
    return False


def extract_text_from_pdf(pdf_path: str, max_pages: int = 300) -> str:
    """
    Data-only extraction: scans ALL pages, keeps ONLY pages that contain
    both ESG keywords AND actual numeric values. Skips ads, covers,
    CEO letters, and marketing fluff entirely.
    
    Typically reduces a 150-page PDF to just 10-20 high-signal pages.
    """
    try:
        doc = fitz.open(pdf_path)
        total = min(doc.page_count, max_pages)
        
        # Phase 1: Score and classify every page
        scored_pages = []
        skipped = 0
        for i in range(total):
            page_text = doc[i].get_text()
            
            # Skip junk pages immediately
            if _is_junk_page(page_text):
                skipped += 1
                continue
            
            kw_hits, num_density = _page_data_score(page_text)
            
            # Combined score: keywords matter most, but numbers confirm it's a data page
            # A page needs BOTH keywords and numbers to score well
            combined = kw_hits * 2 + (1 if num_density >= 5 else 0)
            
            scored_pages.append({
                "idx": i,
                "text": page_text,
                "kw_hits": kw_hits,
                "num_density": num_density,
                "combined": combined,
            })
        
        # Phase 2: Keep only pages that actually contain data (combined score >= 3)
        # This means at least 2 keyword hits, or 1 keyword + numbers
        data_pages = [p for p in scored_pages if p["combined"] >= 3]
        
        # If too few data pages found, lower the threshold
        if len(data_pages) < 5:
            data_pages = [p for p in scored_pages if p["combined"] >= 1]
        
        # Sort by combined score descending, cap at 40 pages max
        data_pages.sort(key=lambda p: p["combined"], reverse=True)
        data_pages = data_pages[:40]
        
        # Re-sort by page order for coherent reading
        data_pages.sort(key=lambda p: p["idx"])
        
        # Phase 3: Assemble text
        text = ""
        for p in data_pages:
            text += f"\n--- Page {p['idx']+1} [kw:{p['kw_hits']} nums:{p['num_density']}] ---\n"
            text += p["text"]
        
        avg_kw = sum(p["kw_hits"] for p in data_pages) / max(len(data_pages), 1)
        avg_nums = sum(p["num_density"] for p in data_pages) / max(len(data_pages), 1)
        print(f"INFO: Data-only filter: {len(data_pages)} data pages kept, "
              f"{skipped} junk skipped, {total - len(data_pages) - skipped} low-signal dropped "
              f"(avg keywords: {avg_kw:.1f}, avg numbers: {avg_nums:.1f})",
              file=sys.stderr)
        return text
    except Exception as e:
        print(f"ERROR: Reading PDF: {e}", file=sys.stderr)
        return ""


BRSR_SYSTEM_PROMPT = """You are an expert ESG/BRSR data extraction engine.
Your ONLY job is to find numeric values in sustainability reports and return them as JSON.
You MUST return ONLY valid JSON — no markdown, no explanation, no backticks.
If you cannot find a specific value, use null. NEVER make up numbers."""

METRIC_FIELDS = [
    "scope_1", "scope_2", "scope_3", "energy_consumption",
    "water_withdrawal", "waste_generated", "renewable_energy_pct", "women_workforce_pct",
    "rd_spend_sustainability", "net_zero_target_year", "employee_turnover_rate",
    "median_remuneration", "posh_complaints", "ltifr", "training_hours_per_employee",
    "csr_spend", "local_sourcing_pct", "trade_associations_count", "anti_competitive_fines",
    "customer_complaints", "data_breach_incidents"
]

def build_brsr_prompt(text: str, char_limit: int = 120000) -> str:
    truncated = text[:char_limit]
    return f"""Extract BRSR/ESG Core indicators from this sustainability report.

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

CRITICAL RULES:
- All numeric values MUST be raw numbers (int/float). NEVER return strings with units.
- Scope 1 = direct emissions (combustion, vehicles, fugitive). Usually in tCO2e or tonnes CO2.
- Scope 2 = purchased electricity/heat. Usually in tCO2e.
- Scope 3 = value chain (supply chain, business travel, employee commuting).
- energy_consumption = total energy in GJ (gigajoules) or TJ. Convert MWh to GJ by multiplying by 3.6.
- water_withdrawal = total water in kilolitres (KL) or megalitres (ML). Convert ML to KL by multiplying by 1000.
- If a number has "million" or "M" suffix: multiply by 1,000,000.
- If a number has "lakh" suffix: multiply by 100,000.
- If a number has "crore" suffix: multiply by 10,000,000.
- If a number has "Mt" suffix: multiply by 1,000,000.
- If not found, return null — NEVER return 0 as a substitute for "not found".
- 0 IS valid when the report explicitly states zero (e.g., "zero data breaches").

Report text:
{truncated}"""


def _parse_json_robust(raw: str) -> Optional[Dict]:
    """Try multiple strategies to parse LLM JSON output."""
    text = raw.strip()
    
    # Strip markdown code fences
    if text.startswith("```json"): text = text[7:]
    elif text.startswith("```"): text = text[3:]
    if text.endswith("```"): text = text[:-3]
    text = text.strip()
    
    # Strategy 1: Direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    
    # Strategy 2: Find first { and last }
    first_brace = text.find("{")
    last_brace = text.rfind("}")
    if first_brace != -1 and last_brace > first_brace:
        try:
            return json.loads(text[first_brace:last_brace + 1])
        except json.JSONDecodeError:
            pass
    
    # Strategy 3: Try fixing common LLM mistakes (trailing commas, comments)
    import re as re2
    cleaned = re2.sub(r',\s*}', '}', text)  # Remove trailing commas
    cleaned = re2.sub(r',\s*]', ']', cleaned)
    cleaned = re2.sub(r'//[^\n]*\n', '\n', cleaned)  # Remove line comments
    if first_brace != -1:
        try:
            return json.loads(cleaned[cleaned.find("{"):cleaned.rfind("}") + 1])
        except json.JSONDecodeError:
            pass
    
    return None


def _merge_metrics(base: dict, overlay: dict) -> dict:
    """Merge two metrics dicts, preferring non-null values from overlay."""
    merged = dict(base)
    for k, v in overlay.items():
        if v is not None and (merged.get(k) is None):
            merged[k] = v
    return merged


async def extract_brsr_data(text: str, filename: str) -> dict | None:
    """
    Multi-pass BRSR extraction:
    Pass 1: Send full text (up to 120K chars) to the LLM.
    Pass 2: If >50% of metrics are null, split into chunks and retry with focused prompts.
    """
    tag = f"brsr_pipeline_{filename[:30]}"
    
    # === PASS 1: Full-text extraction ===
    print(f"INFO: Pass 1 — Full text extraction ({len(text)} chars)", file=sys.stderr)
    prompt = build_brsr_prompt(text, char_limit=120000)
    result = await llm_call(prompt, system=BRSR_SYSTEM_PROMPT, task_id=tag)

    data = None
    if not result["error"] and result["text"]:
        data = _parse_json_robust(result["text"])
        if data:
            print(f"INFO: Pass 1 success via {result['provider_used']}", file=sys.stderr)
    
    if not data:
        print(f"WARNING: Pass 1 failed ({result.get('error', 'parse error')}), trying chunked pass", file=sys.stderr)
        data = {"reporting_year": None, "metrics": {f: None for f in METRIC_FIELDS}, "reported_total_emissions": None}
    
    # Check how many metrics were extracted
    metrics = data.get("metrics", {})
    null_count = sum(1 for f in METRIC_FIELDS if metrics.get(f) is None)
    total_metrics = len(METRIC_FIELDS)
    extraction_rate = (total_metrics - null_count) / total_metrics
    
    print(f"INFO: Pass 1 extraction rate: {extraction_rate*100:.0f}% ({total_metrics - null_count}/{total_metrics} metrics)", file=sys.stderr)
    
    # === PASS 2: Chunked extraction if needed ===
    if extraction_rate < 0.5:
        print(f"INFO: Pass 2 — Chunked extraction (extraction rate too low)", file=sys.stderr)
        
        # Split text into 3 overlapping chunks
        text_len = len(text)
        chunk_size = min(60000, text_len // 2)
        chunks = []
        
        if text_len <= chunk_size:
            chunks = [text]
        else:
            # Beginning, middle, end with overlap
            chunks.append(text[:chunk_size])
            mid_start = max(0, (text_len // 2) - (chunk_size // 2))
            chunks.append(text[mid_start:mid_start + chunk_size])
            chunks.append(text[max(0, text_len - chunk_size):])
        
        for ci, chunk in enumerate(chunks):
            chunk_prompt = build_brsr_prompt(chunk, char_limit=60000)
            chunk_result = await llm_call(chunk_prompt, system=BRSR_SYSTEM_PROMPT, task_id=f"{tag}_chunk{ci}")
            
            if not chunk_result["error"] and chunk_result["text"]:
                chunk_data = _parse_json_robust(chunk_result["text"])
                if chunk_data and "metrics" in chunk_data:
                    metrics = _merge_metrics(metrics, chunk_data["metrics"])
                    if data.get("reporting_year") is None and chunk_data.get("reporting_year"):
                        data["reporting_year"] = chunk_data["reporting_year"]
                    if data.get("reported_total_emissions") is None and chunk_data.get("reported_total_emissions") is not None:
                        data["reported_total_emissions"] = chunk_data["reported_total_emissions"]
                    print(f"INFO: Chunk {ci+1}/{len(chunks)} added metrics via {chunk_result['provider_used']}", file=sys.stderr)
            
            await asyncio.sleep(1)  # Small delay between chunk calls
        
        data["metrics"] = metrics
        
        final_null = sum(1 for f in METRIC_FIELDS if metrics.get(f) is None)
        final_rate = (total_metrics - final_null) / total_metrics
        print(f"INFO: Pass 2 final extraction rate: {final_rate*100:.0f}% ({total_metrics - final_null}/{total_metrics} metrics)", file=sys.stderr)

    # Coerce all values to proper floats
    for field in METRIC_FIELDS:
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
        try:
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
        finally:
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
        _api_base = os.environ.get('INTERNAL_API_BASE', 'http://localhost:5000')
        r = requests.get(f"{_api_base}/api/globe/grid", timeout=5)
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
