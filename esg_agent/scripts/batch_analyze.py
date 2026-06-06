import asyncio
import os
import json
import re
import httpx
from loguru import logger
from sqlalchemy.orm import Session
from dotenv import load_dotenv

from core.database import SessionLocal
from core.models import Company, Document, Metric, EsgValue, SustainabilityAction
from modules.pdf_parser import extract_text_from_pdf
from modules.analyst import filter_relevant_pages
from modules.mirofish_adapter import run_swarm_extraction

load_dotenv('../MiroFish/.env')

# Multi-provider config: Cerebras primary, Groq fallback
def _ensure_chat_url(url: str) -> str:
    url = url.rstrip('/')
    if not url.endswith('/chat/completions'):
        url += '/chat/completions'
    return url

PROVIDERS = [
    {
        "name": "Cerebras",
        "api_key": os.getenv('CEREBRAS_API_KEY'),
        "url": _ensure_chat_url(os.getenv('CEREBRAS_BASE_URL', 'https://api.cerebras.ai/v1')),
        "model": os.getenv('CEREBRAS_MODEL_NAME', 'llama-3.3-70b'),
    },
    {
        "name": "Groq",
        "api_key": os.getenv('LLM_API_KEY'),
        "url": _ensure_chat_url(os.getenv('LLM_BASE_URL', 'https://api.groq.com/openai/v1')),
        "model": 'llama-3.3-70b-versatile',
    },
]

# Filter out providers without API keys
PROVIDERS = [p for p in PROVIDERS if p["api_key"]]
logger.info(f"Loaded {len(PROVIDERS)} LLM providers: {[p['name'] for p in PROVIDERS]}")


async def call_llm(prompt: str, provider: dict) -> str | None:
    """Call a specific LLM provider."""
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
                    logger.warning(f"[{provider['name']}] Rate limit hit (429). Sleeping 60s... (attempt {attempt+1}/3)")
                    await asyncio.sleep(60)
                    continue
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
  "Scope 2 GHG Emissions": <number in metric tons or null>,
  "Scope 3 GHG Emissions": <number in metric tons or null>,
  "Total Water Withdrawal": <number in cubic meters or null>,
  "Renewable Energy Percentage": <number between 0 and 100 or null>,
  "Annual Revenue": <number in USD or null>,
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
        else:
            logger.success(f"Extraction succeeded for {comp_name}.")
        
        if not results:
            logger.error(f"All extraction methods failed for {comp_name}.")
            return
            
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
