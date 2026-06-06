"""
Local Groq/Cerebras Swarm Intelligence for GreenOrb.

Runs a multi-agent debate (Analyst → Risk → Strategy) entirely locally
using fast LLM APIs. No external MiroFish/Zep dependencies.
"""

import httpx
import json
import os
import re
import asyncio
from typing import List, Dict, Any, Optional
from loguru import logger
from dotenv import load_dotenv

from pathlib import Path

# Load credentials dynamically
base_dir = Path(__file__).resolve().parent.parent.parent
load_dotenv(base_dir / 'MiroFish/.env')
load_dotenv(base_dir / 'Backend/.env')
load_dotenv(base_dir / 'esg_agent/.env')

# Multi-provider: Gemini primary (stable), Cerebras, and Groq fallbacks
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
PROVIDERS = [p for p in PROVIDERS if p["api_key"]]


async def call_agent(role_prompt: str, context: str, user_prompt: str) -> Optional[str]:
    """Call an agent role using multi-provider failover."""
    for provider in PROVIDERS:
        if "Gemini" in provider["name"]:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{provider['model']}:generateContent?key={provider['api_key']}"
            payload = {
                "contents": [
                    {"role": "user", "parts": [{"text": f"SYSTEM PROMPT:\n{role_prompt}\n\nCONTEXT:\n{context}\n\nTASK:\n{user_prompt}"}]}
                ],
                "generationConfig": {"temperature": 0.2}
            }
            for attempt in range(3):
                try:
                    async with httpx.AsyncClient(timeout=120.0) as client:
                        resp = await client.post(url, json=payload)
                        if resp.status_code == 429:
                            logger.warning(f"[Swarm/{provider['name']}] Rate limit (429). Skipping provider...")
                            break # Try next provider
                        if resp.status_code != 200:
                            logger.error(f"[Swarm/{provider['name']}] Error response ({resp.status_code}): {resp.text}")
                        resp.raise_for_status()
                        res_json = resp.json()
                        return res_json["candidates"][0]["content"]["parts"][0]["text"]
                except Exception as e:
                    logger.error(f"[Swarm/{provider['name']}] Failed attempt {attempt+1}: {e}")
                    await asyncio.sleep(5)
            continue # Try next provider

        # Standard OpenAI compatible formatting
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {provider["api_key"]}',
        }
        payload = {
            "model": provider["model"],
            "messages": [
                {"role": "system", "content": role_prompt},
                {"role": "user", "content": f"CONTEXT:\n{context}\n\nTASK:\n{user_prompt}"}
            ],
            "temperature": 0.2
        }
        
        for attempt in range(3):
            try:
                async with httpx.AsyncClient(timeout=120.0) as client:
                    resp = await client.post(provider["url"], headers=headers, json=payload)
                    if resp.status_code == 429:
                        logger.warning(f"[Swarm/{provider['name']}] Rate limit (429). Skipping provider...")
                        break # Try next provider
                    resp.raise_for_status()
                    return resp.json()['choices'][0]['message']['content']
            except Exception as e:
                logger.error(f"[Swarm/{provider['name']}] Failed attempt {attempt+1}: {e}")
                await asyncio.sleep(5)
        
        logger.warning(f"[Swarm/{provider['name']}] Exhausted, trying next provider...")
    
    return None


async def run_swarm_extraction(
    company_name: str, 
    pdf_text_blocks: List[Dict[str, Any]], 
    pdf_path: str = None,
    target_metrics: List[str] = None
) -> Optional[Dict[str, Any]]:
    """
    LOCAL SWARM: Multi-agent debate using Cerebras/Groq failover.
    """
    if not target_metrics:
        target_metrics = [
            "Scope 1 GHG Emissions", "Scope 2 Location-Based GHG Emissions", "Scope 2 Market-Based GHG Emissions",
            "Scope 2 GHG Emissions", "Scope 3 GHG Emissions", "Total Water Withdrawal",
            "Renewable Energy Percentage", "Annual Revenue", "Net Zero Year",
            "Methodology Standard", "GWP Version", "Boundary Approach",
            "Climate Targets", "Sustainability Investment", "headquarters_country"
        ]
        
    logger.info(f"Initiating Local Swarm for {company_name}...")
    
    context = ""
    for b in pdf_text_blocks:
        context += f"--- Page {b.get('page', '?')} ---\n{b.get('text', '')}\n\n"
        if len(context) > 15000:
            break
            
    # Agent 1: Analyst
    logger.info(f"[{company_name}] Analyst Agent scanning...")
    analyst_report = await call_agent(
        "You are the Analyst Agent. Deep-scan sustainability reports and extract hard metrics.",
        context,
        f"Extract these metrics for {company_name}: {target_metrics}. Cite page numbers."
    )
    if not analyst_report:
        return None
        
    await asyncio.sleep(5)
        
    # Agent 2: Risk
    logger.info(f"[{company_name}] Risk Agent verifying...")
    risk_critique = await call_agent(
        "You are the Risk Agent. Detect Greenwashing, verify claims, identify reporting gaps.",
        context,
        f"Review the Analyst's report. Flag vague claims or missing data.\n\nANALYST REPORT:\n{analyst_report}"
    )
    if not risk_critique:
        return None
        
    await asyncio.sleep(5)
        
    # Agent 3: Strategy (final JSON)
    logger.info(f"[{company_name}] Strategy Agent finalizing...")
    final_output = await call_agent(
        "You are the Strategy Agent. Finalize ESG data and output clean JSON only.",
        context,
        (
            f"ANALYST REPORT:\n{analyst_report}\n\n"
            f"RISK CRITIQUE:\n{risk_critique}\n\n"
            f"Output ONLY a valid JSON object with these keys: {json.dumps(target_metrics)}. "
            f"Use null for missing/unreliable metrics. No markdown."
        )
    )
    if not final_output:
        return None
        
    # Parse
    try:
        match = re.search(r'\{.*\}', final_output.replace('\n', ' '), re.DOTALL)
        clean_json = match.group(0) if match else final_output
        metrics = json.loads(clean_json)
        logger.success(f"Local Swarm consensus for {company_name}.")
        return metrics
    except json.JSONDecodeError:
        logger.error(f"Strategy Agent bad JSON for {company_name}:\n{final_output[:200]}")
        return None
