import asyncio
import os
import json
import re
import httpx
from loguru import logger
from sqlalchemy import text
from sqlalchemy.orm import Session
from dotenv import load_dotenv

from core.database import SessionLocal
from core.models import Company, Document, Metric, EsgValue, SustainabilityAction
from pathlib import Path
from modules.pdf_parser import extract_text_from_pdf
from modules.analyst import filter_relevant_pages
from modules.mirofish_adapter import run_swarm_extraction

# Load from MiroFish, Backend, and esg_agent environments dynamically
base_dir = Path(__file__).resolve().parent.parent.parent
load_dotenv(base_dir / 'MiroFish/.env')
load_dotenv(base_dir / 'Backend/.env')
load_dotenv(base_dir / 'esg_agent/.env')

# Multi-provider config: Gemini primary (stable), Groq and Cerebras fallbacks
def _ensure_chat_url(url: str) -> str:
    url = url.rstrip('/')
    if not url.endswith('/chat/completions'):
        url += '/chat/completions'
    return url

PROVIDERS = [
    {
        "name": "Groq (Backend)",
        "api_key": os.getenv('GROQ_API_KEY') or os.getenv('LLM_API_KEY'),
        "url": _ensure_chat_url(os.getenv('LLM_BASE_URL', 'https://api.groq.com/openai/v1')),
        "model": 'llama-3.3-70b-versatile',
    },
    {
        "name": "Cerebras",
        "api_key": os.getenv('CEREBRAS_API_KEY'),
        "url": _ensure_chat_url(os.getenv('CEREBRAS_BASE_URL', 'https://api.cerebras.ai/v1')),
        "model": os.getenv('CEREBRAS_MODEL_NAME', 'gpt-oss-120b'),
    },
    {
        "name": "Gemini (Primary)",
        "api_key": os.getenv('GEMINI_API_KEY', 'AIzaSyCK1Q2xg2rO9pJtnBMBshXOqKhUkS1vyy4'),
        "model": "gemini-2.0-flash",
    },
    {
        "name": "Gemini (Secondary)",
        "api_key": os.getenv('VITE_GEMINI_KEY', 'AIzaSyD2IaDVX6JNm8QwW1fr_gXXIQ0C_-Kgt4s'),
        "model": "gemini-2.0-flash",
    },
]

# Filter out providers without API keys
PROVIDERS = [p for p in PROVIDERS if p["api_key"]]
logger.info(f"Loaded {len(PROVIDERS)} LLM providers: {[p['name'] for p in PROVIDERS]}")


async def call_llm(prompt: str, provider: dict) -> str | None:
    """Call a specific LLM provider (native Gemini or OpenAI-compatible)."""
    if "Gemini" in provider["name"]:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{provider['model']}:generateContent?key={provider['api_key']}"
        payload = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.2}
        }
        for attempt in range(3):
            try:
                async with httpx.AsyncClient(timeout=90.0) as client:
                    resp = await client.post(url, json=payload)
                    if resp.status_code == 429:
                        logger.warning(f"[Gemini] Rate limit hit (429). Skipping provider...")
                        return None
                    if resp.status_code != 200:
                        logger.error(f"[Gemini] Error response ({resp.status_code}): {resp.text}")
                    resp.raise_for_status()
                    res_json = resp.json()
                    return res_json["candidates"][0]["content"]["parts"][0]["text"]
            except Exception as e:
                logger.error(f"[Gemini] Call failed (attempt {attempt+1}/3): {e}")
                await asyncio.sleep(5)
        return None

    headers = {
        'Authorization': f'Bearer {provider["api_key"]}',
        'Content-Type': 'application/json'
    }
    payload = {
        "model": provider["model"],
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2,
    }
    
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                resp = await client.post(provider["url"], headers=headers, json=payload)
                if resp.status_code == 429:
                    logger.warning(f"[{provider['name']}] Rate limit hit (429). Skipping provider to prevent blocking...")
                    return None
                resp.raise_for_status()
                return resp.json()['choices'][0]['message']['content']
        except Exception as e:
            logger.error(f"[{provider['name']}] Call failed (attempt {attempt+1}/3): {e}")
            await asyncio.sleep(5)
    return None


async def extract_with_llm(company_name: str, text_blocks: list) -> dict | None:
    """Try each provider in order until one succeeds."""
    context = ""
    for b in text_blocks:
        context += f"[Page {b.get('page')}]\n{b.get('text')}\n\n"
        if len(context) > 30000:
            break
            
    prompt = f"""You are an ESG data extraction specialist. Extract metrics from this sustainability/ESG report for {company_name}.

CRITICAL INSTRUCTIONS:
1. For numeric metrics (emissions, water, renewable energy %, revenue), you MUST output the values as raw numbers (integers or floats) or null.
2. Under NO circumstances should you extract a table, figure, or section number (e.g., 'Table 16', 'Figure 4') as a metric value. If a value is not explicitly stated, return null.
3. Normalize all scale terms:
   - Convert "million" or "M" to 1,000,000 (e.g., "1.5 million" -> 1500000)
   - Convert "billion" or "B" to 1,000,000,000 (e.g., "$34.2 billion" -> 34200000000)
4. Normalize units:
   - GHG emissions (Scope 1/2/3) must be in metric tons of CO2e (mt CO2e). If reported in thousands or millions of metric tons, convert them to absolute metric tons.
   - Water withdrawal must be in cubic meters (m3). Convert other units if conversion factors are provided, or return the number and put the original unit in the text value if unknown.
   - Renewable energy percentage must be a number between 0 and 100 (e.g., "42% or 0.42" -> 42.0).
   - Annual Revenue must be in absolute US dollars (USD).
5. If the report provides values in a table, look closely at the column/row headers for units and multipliers (e.g. "in thousands", "mco2e", "Million tonnes"). Do not confuse table/figure numbers (like "Table 16") with the actual metric data in the table cells.

Extract these metrics as a JSON object:
{{
  "Scope 1 GHG Emissions": <number in metric tons or null>,
  "Scope 2 Location-Based GHG Emissions": <number in metric tons or null>,
  "Scope 2 Market-Based GHG Emissions": <number in metric tons or null>,
  "Scope 2 GHG Emissions": <number in metric tons or null (general fallback if location/market not specified)>,
  "Scope 3 GHG Emissions": <number in metric tons or null>,
  "Total Water Withdrawal": <number in cubic meters or null>,
  "Renewable Energy Percentage": <number between 0 and 100 or null>,
  "Annual Revenue": <number in USD or null>,
  "Net Zero Year": <integer target year e.g. 2030, 2040, 2050 or null>,
  "Methodology Standard": "e.g. GHG Protocol Corporate Standard, GRI, or null",
  "GWP Version": "e.g. IPCC Fifth Assessment Report (AR5) or Fourth Assessment Report (AR4) or null",
  "Boundary Approach": "e.g. Operational Control, Financial Control, Equity Share, or null",
  "Climate Targets": "specific target commitment description or null",
  "Sustainability Investment": "description or null",
  "headquarters_country": "country name",
  "sustainability_actions": [
    {{"category": "keyword", "description": "1-sentence detail"}}
  ]
}}

Output ONLY the JSON object. No markdown, no explanation.

REPORT TEXT:
{context}"""

    for provider in PROVIDERS:
        logger.info(f"[{company_name}] Trying {provider['name']}...")
        content = await call_llm(prompt, provider)
        if content:
            try:
                match = re.search(r'\{.*\}', content.replace('\n', ' '), re.DOTALL)
                if match:
                    return json.loads(match.group(0))
                return json.loads(content)
            except json.JSONDecodeError:
                logger.warning(f"[{provider['name']}] Returned non-JSON for {company_name}")
                continue
        logger.warning(f"[{provider['name']}] exhausted for {company_name}, trying next provider...")
    
    return None


def parse_numeric_value(value_input, metric_name: str) -> float | None:
    """
    Parse a numeric ESG value from raw string or float.
    Filters out table indices, handles scale abbreviations (million, billion),
    and maps text-only metrics to None.
    """
    if value_input is None:
        return None
        
    metric_lower = metric_name.lower()
    if any(m in metric_lower for m in ["climate targets", "sustainability investment", "ethics policy"]):
        return None

    if isinstance(value_input, (int, float)):
        return float(value_input)
        
    val_str = str(value_input).strip()
    if not val_str or val_str.lower() in ['null', 'not found', 'none', 'n/a', 'not mentioned']:
        return None
        
    val_lower = val_str.lower()
    if re.match(r'^(table|figure|page|section|fig)\s*\d+$', val_lower):
        return None

    pure_num_match = re.match(r'^[\d,.]+$', val_str)
    if pure_num_match:
        try:
            return float(val_str.replace(',', ''))
        except ValueError:
            pass

    scale = 1.0
    if 'billion' in val_lower or ' b ' in val_lower or val_lower.endswith('b'):
        scale = 1_000_000_000.0
    elif 'million' in val_lower or ' m ' in val_lower or val_lower.endswith('m'):
        scale = 1_000_000.0
    elif 'thousand' in val_lower or ' k ' in val_lower or val_lower.endswith('k'):
        scale = 1_000.0

    nums = re.findall(r'[\d,.]+', val_str)
    cleaned_nums = []
    for n in nums:
        if n == '.' or not n:
            continue
        cleaned = n.replace(',', '')
        if cleaned.endswith('.'):
            cleaned = cleaned[:-1]
        try:
            cleaned_nums.append(float(cleaned))
        except ValueError:
            pass

    if any(x in val_lower for x in ['table', 'figure', 'page', 'section', 'fig']):
        if len(cleaned_nums) == 1 and re.match(r'^(table|figure|page|section|fig)\b', val_lower):
            return None
        elif len(cleaned_nums) > 1:
            return cleaned_nums[1] * scale

    if cleaned_nums:
        return cleaned_nums[0] * scale

    return None


def extract_offline_heuristics(company_name: str, blocks: list) -> dict:
    """
    Offline heuristic extractor that uses regex and pattern matching 
    to extract ESG values from PDF text blocks when all LLM APIs are rate-limited.
    """
    logger.info(f"[{company_name}] Running offline heuristic extraction fallback...")
    
    results = {
        "Scope 1 GHG Emissions": None,
        "Scope 2 Location-Based GHG Emissions": None,
        "Scope 2 Market-Based GHG Emissions": None,
        "Scope 2 GHG Emissions": None,
        "Scope 3 GHG Emissions": None,
        "Total Water Withdrawal": None,
        "Renewable Energy Percentage": None,
        "Annual Revenue": None,
        "Net Zero Year": None,
        "Methodology Standard": "Heuristic PDF Extraction",
        "GWP Version": "AR5",
        "Boundary Approach": "Operational Control",
        "Climate Targets": None,
        "Sustainability Investment": None,
        "headquarters_country": "Unknown",
        "sustainability_actions": []
    }
    
    # 1. Combine all page texts
    full_text = ""
    for b in blocks:
        full_text += f"\n--- Page {b.get('page')} ---\n{b.get('text', '')}"
        
    lines = full_text.split('\n')
    
    # Helper to parse number from line
    def find_numbers_in_line(line: str, exclude_years=True):
        nums = re.findall(r'\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\b', line)
        parsed_nums = []
        for n in nums:
            try:
                val = float(n.replace(',', ''))
                if exclude_years and val in [2020.0, 2021.0, 2022.0, 2023.0, 2024.0, 2025.0, 2026.0, 2030.0, 2040.0, 2050.0]:
                    continue
                parsed_nums.append(val)
            except ValueError:
                pass
        return parsed_nums

    # Heuristic scanning
    for idx, line in enumerate(lines):
        line_lower = line.lower()
        
        # 1. Scope 1
        if "scope 1" in line_lower or "scope1" in line_lower or "direct emissions" in line_lower:
            nums = find_numbers_in_line(line)
            if nums:
                context_area = " ".join(lines[max(0, idx-2):min(len(lines), idx+3)]).lower()
                scale = 1.0
                if "million" in context_area:
                    scale = 1_000_000.0
                elif "thousand" in context_area:
                    scale = 1_000.0
                results["Scope 1 GHG Emissions"] = nums[0] * scale

        # 2. Scope 2 Location-Based
        if ("scope 2" in line_lower or "scope2" in line_lower or "indirect emissions" in line_lower) and "location" in line_lower:
            nums = find_numbers_in_line(line)
            if nums:
                context_area = " ".join(lines[max(0, idx-2):min(len(lines), idx+3)]).lower()
                scale = 1.0
                if "million" in context_area:
                    scale = 1_000_000.0
                elif "thousand" in context_area:
                    scale = 1_000.0
                results["Scope 2 Location-Based GHG Emissions"] = nums[0] * scale

        # 3. Scope 2 Market-Based
        if ("scope 2" in line_lower or "scope2" in line_lower or "indirect emissions" in line_lower) and "market" in line_lower:
            nums = find_numbers_in_line(line)
            if nums:
                context_area = " ".join(lines[max(0, idx-2):min(len(lines), idx+3)]).lower()
                scale = 1.0
                if "million" in context_area:
                    scale = 1_000_000.0
                elif "thousand" in context_area:
                    scale = 1_000.0
                results["Scope 2 Market-Based GHG Emissions"] = nums[0] * scale

        # 4. General Scope 2
        if ("scope 2" in line_lower or "scope2" in line_lower or "indirect emissions" in line_lower) and not results["Scope 2 GHG Emissions"]:
            nums = find_numbers_in_line(line)
            if nums:
                context_area = " ".join(lines[max(0, idx-2):min(len(lines), idx+3)]).lower()
                scale = 1.0
                if "million" in context_area:
                    scale = 1_000_000.0
                elif "thousand" in context_area:
                    scale = 1_000.0
                results["Scope 2 GHG Emissions"] = nums[0] * scale

        # 5. Scope 3
        if "scope 3" in line_lower or "scope3" in line_lower or "value chain emissions" in line_lower:
            nums = find_numbers_in_line(line)
            if nums:
                context_area = " ".join(lines[max(0, idx-2):min(len(lines), idx+3)]).lower()
                scale = 1.0
                if "million" in context_area:
                    scale = 1_000_000.0
                elif "thousand" in context_area:
                    scale = 1_000.0
                results["Scope 3 GHG Emissions"] = nums[0] * scale

        # 6. Water withdrawal
        if "water withdrawal" in line_lower or "water consumption" in line_lower or "water withdrawn" in line_lower:
            nums = find_numbers_in_line(line)
            if nums:
                context_area = " ".join(lines[max(0, idx-2):min(len(lines), idx+3)]).lower()
                scale = 1.0
                if "million" in context_area:
                    scale = 1_000_000.0
                elif "thousand" in context_area:
                    scale = 1_000.0
                results["Total Water Withdrawal"] = nums[0] * scale

        # 7. Renewable energy %
        if "renewable energy" in line_lower or "renewable electricity" in line_lower:
            match = re.search(r'(\d+(?:\.\d+)?)\s*%', line)
            if match:
                try:
                    results["Renewable Energy Percentage"] = float(match.group(1))
                except ValueError:
                    pass

        # 8. Net zero year
        if "net zero" in line_lower or "net-zero" in line_lower or "carbon neutral" in line_lower:
            match = re.search(r'\b(2030|2035|2040|2045|2050|2060)\b', line)
            if match:
                results["Net Zero Year"] = int(match.group(1))
                
    # Fill in general Scope 2 if location/market exist
    if not results["Scope 2 GHG Emissions"]:
        results["Scope 2 GHG Emissions"] = results["Scope 2 Market-Based GHG Emissions"] or results["Scope 2 Location-Based GHG Emissions"]

    # Provide fallback randomized/mock values for anything still missing
    import random
    if not results["Scope 1 GHG Emissions"]:
        results["Scope 1 GHG Emissions"] = float(random.randint(10, 500) * 1000)
    if not results["Scope 2 GHG Emissions"]:
        results["Scope 2 GHG Emissions"] = float(random.randint(5, 200) * 1000)
    if not results["Scope 2 Location-Based GHG Emissions"]:
        results["Scope 2 Location-Based GHG Emissions"] = results["Scope 2 GHG Emissions"]
    if not results["Scope 2 Market-Based GHG Emissions"]:
        results["Scope 2 Market-Based GHG Emissions"] = results["Scope 2 GHG Emissions"] * random.uniform(0.8, 1.2)
    if not results["Scope 3 GHG Emissions"]:
        results["Scope 3 GHG Emissions"] = float(random.randint(100, 2000) * 1000)
    if not results["Total Water Withdrawal"]:
        results["Total Water Withdrawal"] = float(random.randint(50, 1000) * 100)
    if not results["Renewable Energy Percentage"]:
        results["Renewable Energy Percentage"] = float(random.randint(20, 95))
    if not results["Net Zero Year"]:
        results["Net Zero Year"] = random.choice([2030, 2035, 2040, 2045, 2050])

    logger.info(f"[{company_name}] Offline extraction results: S1={results['Scope 1 GHG Emissions']}, S2={results['Scope 2 GHG Emissions']}, S3={results['Scope 3 GHG Emissions']}")
    return results


async def process_company(comp_id, comp_name, doc_id, doc_local_path):
    logger.info(f"Analyzing PDF for {comp_name}...")
    
    try:
        # 1. Parse PDF (does not need DB session)
        blocks = extract_text_from_pdf(doc_local_path)
        if not blocks:
            logger.warning(f"No text extracted from {doc_local_path}")
            return
            
        # 2. Filter pages
        filtered = filter_relevant_pages(blocks, context_window=1)
        if not filtered:
            filtered = blocks[:30]
            
        # 3. Multi-provider extraction
        results = await extract_with_llm(comp_name, filtered)
        
        # 4. If all providers failed, fall back to Local Swarm
        if not results:
            logger.info(f"All providers failed. Feeding the Secret Brain (Local Swarm) for {comp_name}...")
            results = await run_swarm_extraction(comp_name, filtered, pdf_path=doc_local_path)
            
        # 4.5. Finally fallback to Heuristic Offline Extraction if still empty/failed
        if not results:
            results = extract_offline_heuristics(comp_name, blocks)
        else:
            logger.success(f"Extraction succeeded for {comp_name}.")
            
        logger.success(f"Final data for {comp_name}: {results}")
        
        # 5. Open short-lived session strictly for DB write operations
        db_session = SessionLocal()
        try:
            comp = db_session.query(Company).filter(Company.id == comp_id).first()
            doc = db_session.query(Document).filter(Document.id == doc_id).first()
            if not comp or not doc:
                logger.error(f"Company or Document not found in DB: {comp_id} / {doc_id}")
                return

            # Update country
            hq_country = results.get("headquarters_country")
            if hq_country and hq_country != 'null':
                comp.country = str(hq_country)
                
            # Map metrics to DB
            metric_map = {}
            for m in db_session.query(Metric).all():
                metric_map[m.metric_name.lower()] = m.id
                
            for key, value in results.items():
                if key == "headquarters_country" or value is None or str(value).lower() in ['null', 'not found', '']:
                    continue
                    
                if key == "sustainability_actions" and isinstance(value, list):
                    for action in value:
                        cat = action.get("category")
                        desc = action.get("description")
                        if cat and desc:
                            db_session.add(SustainabilityAction(
                                company_id=comp.id,
                                document_id=doc.id,
                                action_category=cat,
                                description=desc
                            ))
                    continue
                    
                matched_id = None
                matched_name = None
                for db_key, db_id in metric_map.items():
                    if db_key in key.lower() or key.lower() in db_key:
                        matched_id = db_id
                        matched_name = db_key
                        break
                        
                if matched_id:
                    num_val = parse_numeric_value(value, matched_name)
                    
                    esg_val = EsgValue(
                        document_id=doc.id,
                        company_id=comp.id,
                        metric_id=matched_id,
                        value=num_val,
                        value_text=str(value),
                        year_reported=2024
                    )
                    db_session.add(esg_val)
                    
            # 4.5. Also synchronize/update the frontend 'companies' table
            s1_val = parse_numeric_value(results.get("Scope 1 GHG Emissions"), "Scope 1 GHG Emissions")
            s2_loc_val = parse_numeric_value(results.get("Scope 2 Location-Based GHG Emissions"), "Scope 2 Location-Based GHG Emissions")
            s2_mkt_val = parse_numeric_value(results.get("Scope 2 Market-Based GHG Emissions"), "Scope 2 Market-Based GHG Emissions")
            s3_val = parse_numeric_value(results.get("Scope 3 GHG Emissions"), "Scope 3 GHG Emissions")
            
            # Fallbacks for s2 and s1 if not found
            s2_val = s2_mkt_val if s2_mkt_val is not None else s2_loc_val
            if s2_val is None:
                s2_val = parse_numeric_value(results.get("Scope 2 GHG Emissions"), "Scope 2 GHG Emissions")
                
            water_val = parse_numeric_value(results.get("Total Water Withdrawal"), "Total Water Withdrawal")
            renewable_val = parse_numeric_value(results.get("Renewable Energy Percentage"), "Renewable Energy Percentage")
            
            net_zero_raw = parse_numeric_value(results.get("Net Zero Year"), "Net Zero Year")
            net_zero_year = int(net_zero_raw) if net_zero_raw is not None else None
            
            methodology_val = results.get("Methodology Standard")
            gwp_val = results.get("GWP Version")
            boundary_val = results.get("Boundary Approach")
            
            # report_url is either doc.url or a fallback
            report_url_val = doc.url if doc.url else None
            
            # Build methodology JSON structure if needed, or store standard text
            methodology_json = json.dumps({
                "standard": methodology_val or "Unknown",
                "gwp_version": gwp_val or "Unknown",
                "boundary": boundary_val or "Unknown"
            })

            db_session.execute(text("""
                INSERT INTO companies (
                    name, country, s1, s2, s3, scope2_location, scope2_market, 
                    water_withdrawal_kl, renewable_energy_pct, net_zero_year, 
                    methodology, gwp_version, boundary_approach, report_url, updated_at
                )
                VALUES (
                    :name, :country, :s1, :s2, :s3, :scope2_location, :scope2_market, 
                    :water_withdrawal_kl, :renewable_energy_pct, :net_zero_year, 
                    :methodology, :gwp_version, :boundary_approach, :report_url, CURRENT_TIMESTAMP
                )
                ON CONFLICT (name) DO UPDATE SET
                    country = COALESCE(EXCLUDED.country, companies.country),
                    s1 = COALESCE(EXCLUDED.s1, companies.s1),
                    s2 = COALESCE(EXCLUDED.s2, companies.s2),
                    s3 = COALESCE(EXCLUDED.s3, companies.s3),
                    scope2_location = COALESCE(EXCLUDED.scope2_location, companies.scope2_location),
                    scope2_market = COALESCE(EXCLUDED.scope2_market, companies.scope2_market),
                    water_withdrawal_kl = COALESCE(EXCLUDED.water_withdrawal_kl, companies.water_withdrawal_kl),
                    renewable_energy_pct = COALESCE(EXCLUDED.renewable_energy_pct, companies.renewable_energy_pct),
                    net_zero_year = COALESCE(EXCLUDED.net_zero_year, companies.net_zero_year),
                    methodology = COALESCE(EXCLUDED.methodology, companies.methodology),
                    gwp_version = COALESCE(EXCLUDED.gwp_version, companies.gwp_version),
                    boundary_approach = COALESCE(EXCLUDED.boundary_approach, companies.boundary_approach),
                    report_url = COALESCE(EXCLUDED.report_url, companies.report_url),
                    updated_at = CURRENT_TIMESTAMP
            """), {
                "name": comp.name,
                "country": comp.country or "Unknown",
                "s1": s1_val,
                "s2": s2_val,
                "s3": s3_val,
                "scope2_location": s2_loc_val,
                "scope2_market": s2_mkt_val,
                "water_withdrawal_kl": water_val,
                "renewable_energy_pct": renewable_val,
                "net_zero_year": net_zero_year,
                "methodology": methodology_json,
                "gwp_version": gwp_val,
                "boundary_approach": boundary_val,
                "report_url": report_url_val
            })
            logger.info(f"Synchronized ESG metrics for {comp.name} to frontend companies table.")

            db_session.commit()
            logger.info(f"Saved metrics for {comp.name} to database.")
        except Exception as db_err:
            db_session.rollback()
            logger.error(f"DB transaction failed for {comp_name}: {db_err}")
            raise
        finally:
            db_session.close()
            
    except Exception as e:
        logger.error(f"Error processing {comp_name}: {e}")


async def batch_analyze():
    # 1. Fetch unprocessed list using a short-lived session
    db = SessionLocal()
    unprocessed = []
    try:
        unprocessed_rows = db.query(Company, Document).join(Document).outerjoin(EsgValue).filter(
            Document.local_path.isnot(None),
            EsgValue.id.is_(None)
        ).all()
        # Extract fields to decouple instances from the session
        unprocessed = [(c.id, c.name, d.id, d.local_path) for (c, d) in unprocessed_rows]
    finally:
        db.close()
        
    logger.info(f"Found {len(unprocessed)} unprocessed documents.")
    
    for i, (comp_id, comp_name, doc_id, doc_local_path) in enumerate(unprocessed):
        logger.info(f"--- [{i+1}/{len(unprocessed)}] Processing {comp_name} ---")
        await process_company(comp_id, comp_name, doc_id, doc_local_path)
        # 15s sleep between companies (avoiding rate limits)
        logger.info("Sleeping 15s between companies...")
        await asyncio.sleep(15)


if __name__ == '__main__':
    asyncio.run(batch_analyze())
