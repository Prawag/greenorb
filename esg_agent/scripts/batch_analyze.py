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
            
    prompt = f"""You are an ESG data extraction specialist. Extract NUMERICAL metrics from this sustainability/ESG report for {company_name}.

CRITICAL INSTRUCTIONS:
- Look for SPECIFIC NUMBERS in the text (e.g. "1,234,567 mt CO2e", "$45.2 billion", "42%")
- Scope 1/2/3 emissions are usually in metric tons (mt) of CO2e
- Revenue is usually in billions (e.g. "$34.2 billion" or "$34.2B")
- If a number exists anywhere in the text for a metric, you MUST extract it
- Include units and trends when mentioned (e.g. "53,407,907 mt (down 12% YoY)")
- For Climate Targets, extract specific commitments like "Net-Zero by 2050" or "SBTi validated"

Extract these metrics as a JSON object:
{{
  "Scope 1 GHG Emissions": "value with unit or null",
  "Scope 2 GHG Emissions": "value with unit or null",
  "Scope 3 GHG Emissions": "value with unit or null",
  "Total Water Withdrawal": "value with unit or null",
  "Renewable Energy Percentage": "value or null",
  "Annual Revenue": "value or null",
  "Climate Targets": "specific target or null",
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


async def process_company(comp, doc, db_session):
    logger.info(f"Analyzing PDF for {comp.name}...")
    
    try:
        # 1. Parse PDF
        blocks = extract_text_from_pdf(doc.local_path)
        if not blocks:
            logger.warning(f"No text extracted from {doc.local_path}")
            return
            
        # 2. Filter pages
        filtered = filter_relevant_pages(blocks, context_window=1)
        if not filtered:
            filtered = blocks[:30]
            
        # 3. Multi-provider extraction
        results = await extract_with_llm(comp.name, filtered)
        
        # 4. If all providers failed, fall back to Local Swarm
        if not results:
            logger.info(f"All providers failed. Feeding the Secret Brain (Local Swarm) for {comp.name}...")
            results = await run_swarm_extraction(comp.name, filtered, pdf_path=doc.local_path)
        else:
            logger.success(f"Extraction succeeded for {comp.name}.")
        
        if not results:
            logger.error(f"All extraction methods failed for {comp.name}.")
            return
            
        logger.success(f"Final data for {comp.name}: {results}")
        
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
            for db_key, db_id in metric_map.items():
                if db_key in key.lower() or key.lower() in db_key:
                    matched_id = db_id
                    break
                    
            if matched_id:
                num_val = None
                try:
                    clean_str = ''.join(c for c in str(value) if c.isdigit() or c == '.')
                    if clean_str:
                        num_val = float(clean_str)
                except ValueError:
                    pass
                    
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
        
    except Exception as e:
        logger.error(f"Error processing {comp.name}: {e}")
        db_session.rollback()

async def batch_analyze():
    db = SessionLocal()
    try:
        unprocessed = db.query(Company, Document).join(Document).outerjoin(EsgValue).filter(
            Document.local_path.isnot(None),
            EsgValue.id.is_(None)
        ).all()
        
        logger.info(f"Found {len(unprocessed)} unprocessed documents.")
        
        for i, (comp, doc) in enumerate(unprocessed):
            logger.info(f"--- [{i+1}/{len(unprocessed)}] Processing {comp.name} ---")
            await process_company(comp, doc, db)
            # 15s sleep with Cerebras (much more generous limits than Groq)
            logger.info("Sleeping 15s between companies...")
            await asyncio.sleep(15)
            
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(batch_analyze())
