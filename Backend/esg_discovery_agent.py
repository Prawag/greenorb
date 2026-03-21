"""
GreenOrb ESG Report Discovery Agent
=====================================
Autonomous agent that searches the internet for official company
sustainability/ESG reports, downloads the PDFs, and processes them
through the Gemini 1.5 Flash API pipeline.

Search Strategy (Year Cascade):
  1. "{Company}" sustainability report {2026} filetype:pdf
  2. "{Company}" ESG report {2025} filetype:pdf
  3. "{Company}" sustainability report {2025} filetype:pdf
  4. "{Company}" ESG report {2024} filetype:pdf

Usage:
    python esg_discovery_agent.py                       # All companies from DB
    python esg_discovery_agent.py --limit 10            # First 10 companies
    python esg_discovery_agent.py --company "Reliance"  # Single company
"""

import os
import re
import sys
import json
import time
import random
import asyncio
import argparse
import requests
import fitz  # PyMuPDF
from docling.document_converter import DocumentConverter

# ─── CONFIG ──────────────────────────────────────────────────────────────────

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY") or "AIzaSyD2IaDVX6JNm8QwW1fr_gXXIQ0C_-Kgt4s"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
GEMINI_EMBED_URL = f"https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key={GEMINI_API_KEY}"
API_BASE = "http://localhost:5000/api"
PROJECT_ROOT = os.path.dirname(os.path.dirname(__file__))
RAW_DATA_DIR = os.path.join(PROJECT_ROOT, "RawData", "ESG_Reports")
PROCESSED_DIR = os.path.join(RAW_DATA_DIR, "Processed")
JSON_RESULTS_DIR = os.path.join(RAW_DATA_DIR, "JSON_Results")
CURRENT_YEAR = 2026

os.makedirs(RAW_DATA_DIR, exist_ok=True)
os.makedirs(PROCESSED_DIR, exist_ok=True)
os.makedirs(JSON_RESULTS_DIR, exist_ok=True)

# Rotate User-Agents to avoid detection
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
]

def get_random_ua():
    return random.choice(USER_AGENTS)

# ─── LAYER 1: DUCKDUCKGO SEARCH ─────────────────────────────────────────────

def search_esg_report(company_name):
    """
    Search DuckDuckGo for a company's sustainability/ESG report PDF.
    Uses a year cascade: 2026 → 2025 → 2024.
    Returns the best PDF URL found, or None.
    """
    from ddgs import DDGS

    search_queries = []
    for year in [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2]:
        search_queries.append(f'"{company_name}" sustainability report {year} filetype:pdf')
        search_queries.append(f'"{company_name}" ESG report {year} filetype:pdf')

    for query in search_queries:
        try:
            print(f"    🔎 Searching: {query[:70]}...")
            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=5))

            if not results:
                time.sleep(1.5)
                continue

            # Look for direct PDF links first
            for r in results:
                url = r.get("href", "")
                if url.lower().endswith(".pdf"):
                    print(f"    ✅ Direct PDF found: {url[:80]}...")
                    return url, extract_year_from_query(query)

            # Check if any result URL contains sustainability/ESG keywords
            for r in results:
                url = r.get("href", "")
                url_lower = url.lower()
                if any(kw in url_lower for kw in ["sustainability", "esg", "environment", "climate", "csr"]):
                    if url_lower.endswith(".pdf"):
                        print(f"    ✅ ESG PDF found: {url[:80]}...")
                        return url, extract_year_from_query(query)

            # If no direct PDF, return the most relevant URL for crawling
            for r in results:
                url = r.get("href", "")
                title = r.get("title", "").lower()
                if any(kw in title for kw in ["sustainability", "esg", "environment", "annual report"]):
                    print(f"    📄 Relevant page found (not PDF): {url[:80]}...")
                    return url, extract_year_from_query(query)

            time.sleep(1.5)  # Rate limit between searches

        except Exception as e:
            print(f"    ⚠️ Search error: {e}")
            time.sleep(2)
            continue

    return None, None


def extract_year_from_query(query):
    """Pull the year out of a search query string."""
    match = re.search(r'(20\d{2})', query)
    return int(match.group(1)) if match else CURRENT_YEAR


# ─── LAYER 2: CRAWL4AI STEALTH FALLBACK ─────────────────────────────────────

async def crawl_for_pdf_link(url, company_name):
    """
    Use Crawl4AI with stealth mode to visit a page and find PDF download links.
    This is the fallback when DuckDuckGo doesn't return a direct PDF link.
    """
    try:
        from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

        browser_conf = BrowserConfig(
            headless=True,
            user_agent=get_random_ua(),
        )
        run_conf = CrawlerRunConfig(
            word_count_threshold=5,
            exclude_external_links=False,
        )

        async with AsyncWebCrawler(config=browser_conf) as crawler:
            result = await crawler.arun(url=url, config=run_conf)

            if result.success and result.markdown:
                # Search for PDF links in the crawled content
                pdf_links = re.findall(r'https?://[^\s\)\"\']+\.pdf', result.markdown, re.IGNORECASE)

                # Prioritize links that contain ESG/sustainability keywords
                for link in pdf_links:
                    link_lower = link.lower()
                    if any(kw in link_lower for kw in ["sustainability", "esg", "environment", "climate", "csr"]):
                        print(f"    🌐 Crawl4AI found ESG PDF: {link[:80]}...")
                        return link

                # If no keyword match, return first PDF found
                if pdf_links:
                    print(f"    🌐 Crawl4AI found PDF: {pdf_links[0][:80]}...")
                    return pdf_links[0]

                print(f"    ⚠️ Crawl4AI found no PDF links on {url[:60]}...")
            else:
                print(f"    ⚠️ Crawl4AI failed to fetch {url[:60]}...")

    except Exception as e:
        print(f"    ❌ Crawl4AI error: {e}")

    return None


# ─── LAYER 3: PDF DOWNLOAD ──────────────────────────────────────────────────

def download_pdf(url, company_name, year):
    """
    Download a PDF from a URL and save it to RawData/ESG_Reports/.
    Verifies the file is actually a PDF.
    Returns the saved filepath, or None on failure.
    """
    safe_name = re.sub(r'[<>:"/\\|?*]', '', company_name).strip()
    filename = f"{year} - {safe_name} - ESG Report.pdf"
    filepath = os.path.join(RAW_DATA_DIR, filename)

    # Skip if already downloaded
    if os.path.exists(filepath):
        print(f"    ⏩ Already downloaded: {filename}")
        return filepath

    # Also check in Processed/ folder
    processed_path = os.path.join(PROCESSED_DIR, filename)
    if os.path.exists(processed_path):
        print(f"    ⏩ Already processed: {filename}")
        return None

    headers = {"User-Agent": get_random_ua()}

    try:
        print(f"    ⬇️ Downloading: {url[:80]}...")
        response = requests.get(url, headers=headers, timeout=30, stream=True, allow_redirects=True)

        if response.status_code != 200:
            print(f"    ❌ Download failed: HTTP {response.status_code}")
            return None

        content_type = response.headers.get("Content-Type", "").lower()

        # Read first 1KB to check PDF magic bytes
        first_chunk = b""
        for chunk in response.iter_content(chunk_size=1024):
            first_chunk = chunk
            break

        if not first_chunk.startswith(b"%PDF"):
            # Not a real PDF, might be an HTML redirect or error page
            if b"<html" in first_chunk.lower() or b"<!doctype" in first_chunk.lower():
                print(f"    ⚠️ URL returned HTML, not PDF. Skipping.")
                return None
            # Some PDFs don't start with %PDF immediately
            if "pdf" not in content_type and "octet-stream" not in content_type:
                print(f"    ⚠️ Unrecognized content type: {content_type}. Skipping.")
                return None

        # Save the PDF
        with open(filepath, "wb") as f:
            f.write(first_chunk)
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)

        file_size = os.path.getsize(filepath)
        if file_size < 10000:  # Less than 10KB is suspicious
            print(f"    ⚠️ File too small ({file_size} bytes), likely not a real report. Removing.")
            os.remove(filepath)
            return None

        size_mb = file_size / (1024 * 1024)
        print(f"    ✅ Saved: {filename} ({size_mb:.1f} MB)")
        return filepath

    except Exception as e:
        print(f"    ❌ Download error: {e}")
        # Clean up partial downloads
        if os.path.exists(filepath):
            os.remove(filepath)
        return None


# ─── LAYER 4: LLAMA 3.2 EXTRACTION (Reuse existing logic) ───────────────────

def extract_text_from_pdf(pdf_path, max_pages=None):
    """Fallback text extraction via classic fitz."""
    try:
        doc = fitz.open(pdf_path)
        text = ""
        num_pages = len(doc) if max_pages is None else min(len(doc), max_pages)
        for i in range(num_pages):
            text += doc[i].get_text() + "\n"
        return text
    except Exception as e:
        print(f"    ❌ Classic extraction failed: {e}")
        return ""


def find_emissions_pages(pdf_path):
    """
    Scan the ENTIRE PDF to find pages containing emissions data tables.
    Returns a list of high-value page indices.
    """
    doc = fitz.open(pdf_path)
    total_pages = len(doc)
    
    # Keywords that indicate emissions data tables
    emissions_keywords = [
        'scope 1', 'scope 2', 'scope 3', 'total emissions', 
        'ghg emissions', 'metric ton', 'mtco2', 'co2e', 'tco2e',
        'carbon emissions', 'greenhouse gas', 'carbon footprint',
        'direct emissions', 'indirect emissions', 'energy consumption',
        'renewable energy', 'carbon intensity', 'emission reduction'
    ]
    
    # ESG rating keywords  
    esg_keywords = [
        'msci', 'sustainalytics', 'cdp', 'djsi', 'esg rating', 
        'esg score', 'esg grade', 'sustainability rating', 
        'ftse4good', 's&p global', 'carbon disclosure'
    ]
    
    # Score each page by keyword density
    page_scores = []
    for i in range(total_pages):
        page_text = doc[i].get_text().lower()
        score = 0
        for kw in emissions_keywords:
            score += page_text.count(kw) * 2  # emissions keywords worth 2
        for kw in esg_keywords:
            score += page_text.count(kw) * 3  # ESG rating keywords worth 3
        if score > 0:
            page_scores.append((i, score))
    
    # Sort by score (highest first) and take top data pages
    page_scores.sort(key=lambda x: x[1], reverse=True)
    top_data_pages = [p[0] for p in page_scores[:12]]  # Top 12 data-rich pages
    top_data_pages.sort()  # Keep in document order
    
    # Include first 5 pages for context (intro, company name)
    intro_pages = list(range(min(5, total_pages)))
    target_pages = sorted(set(intro_pages + top_data_pages))
    
    print(f"    🎯 Targeted {len(target_pages)} key pages out of {total_pages} total.")
    return target_pages


def analyze_with_gemini(text, context_info):
    """Use Gemini 1.5 Flash to extract factual ESG data from text."""
    prompt = (
        'You are an expert corporate sustainability data analyst.\n'
        'Your task is to extract EXACT figures from this ESG report fragment.\n\n'
        'CRITICAL RULES:\n'
        '1. PAY STRICT ATTENTION TO UNITS IN HEADERS. If a table says "(in thousands)" and the number is 45, you MUST output 45000.\n'
        '2. If a table says "(in millions)" and the number is 1.2, you MUST output 1200000.\n'
        '3. DO NOT capture "Carbon Removals", "Offsets", or "Renewable Energy Credits (RECs)" as Scope 1, 2, or 3.\n'
        '4. Scope 1, 2, and 3 are EMISSIONS (CO2e). Avoid percentages (e.g. 97%) or indices (e.g. 1.2).\n'
        '5. Prioritize "Market-based" Scope 2 emissions over "Location-based" if both exist.\n'
        '6. Return ONLY valid JSON. No markdown, no explanations.\n'
        '7. FRAMEWORK-AWARE EXPECTATIONS (EulerESG style):\n'
        '   - We follow the Greenhouse Gas Protocol (GHGP) Metric Connection Map.\n'
        '   - Relation: CalculatedMetric -> IsCalculatedBy -> Model\n'
        '   - Formula: Total_Emissions = Scope_1 + Scope_2 + Scope_3\n'
        '   - Scope 2 should explicitly prioritize Market-based.\n'
        '   - Ensure that the numbers extracted logically satisfy this relationship if a total is presented.\n\n'
        'Extract this JSON:\n'
        '{\n'
        '  "company_name": "Full official company name",\n'
        '  "report_year": 2024,\n'
        '  "scope1_emissions": "Scope 1 emissions (number only)",\n'
        '  "scope2_emissions": "Scope 2 (Market-based) emissions (number only)",\n'
        '  "scope3_emissions": "Scope 3 emissions (number only)",\n'
        '  "total_emissions": "Total GHG emissions if stated (number only)",\n'
        '  "esg_ratings": "MSCI, CDP, or Sustainalytics ratings found (string)",\n'
        '  "renewable_energy_pct": "Percentage of renewable energy (number only)",\n'
        '  "sector": "Industry sector",\n'
        '  "country": "Headquarters country",\n'
        '  "net_zero_target": "Net zero target year (e.g. 2040)",\n'
        '  "sustainability_summary": "One sentence summary"\n'
        '}\n\n'
        f'Context: {context_info}\n'
        'Report Text:\n'
        + text[:30000]
    )

    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.0, "maxOutputTokens": 2048}
    }

    try:
        response = requests.post(GEMINI_URL, json=body, timeout=120)
        if response.status_code == 200:
            result_data = response.json()
            result = result_data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "").strip()
            # Clean markdown code fences
            result = re.sub(r'```json\s*', '', result)
            result = re.sub(r'```', '', result)
            try:
                return json.loads(result.strip())
            except:
                match = re.search(r'\{.*\}', result, re.DOTALL)
                if match:
                    return json.loads(match.group())
        else:
            print(f"    ❌ Gemini API error {response.status_code}: {response.text[:200]}")
    except Exception as e:
        print(f"    ❌ Gemini error: {e}")

    return None


def regex_extract_emissions(text):
    """
    Pre-extract emissions data using regex patterns.
    This is more reliable than LLM for numerical data in tables.
    Returns a dict of found values.
    """
    results = {}
    text_lower = text.lower()
    
    def find_number_near(keyword_pattern, search_text, window=300):
        """Find a number near a keyword pattern in the text, avoiding years."""
        for match in re.finditer(keyword_pattern, search_text, re.IGNORECASE):
            start = max(0, match.start() - 50)
            end = min(len(search_text), match.end() + window)
            context = search_text[start:end]
            # Look for numbers (with commas, dots, spaces)
            numbers = re.findall(r'[\d,]+(?:\.\d+)?(?:\s*(?:million|billion|mn|bn))?', context)
            
            # Find the best candidate: largest non-year number under 1 billion (to avoid offsets/monetary)
            candidates = []
            for num_str in numbers:
                clean = num_str.strip().lower()
                multiplier = 1
                if 'million' in clean or 'mn' in clean:
                    multiplier = 1_000_000
                    clean = re.sub(r'\s*(million|mn)', '', clean)
                elif 'billion' in clean or 'bn' in clean:
                    multiplier = 1_000_000_000
                    clean = re.sub(r'\s*(billion|bn)', '', clean)
                clean = clean.replace(',', '').replace(' ', '').strip()
                try:
                    val = float(clean)
                    # IGNORE numbers that look like years (2010 - 2050) unless they have decimals
                    if 2010 <= val <= 2050 and '.' not in clean:
                        continue
                    # IGNORE very small numbers (likely indices or percents)
                    if val < 10 and multiplier == 1:
                        continue
                    if 0 < val * multiplier < 1_000_000_000: # Stay under 1B for emissions
                        candidates.append(val * multiplier)
                except:
                    continue
            
            if candidates:
                # Return the FIRST candidate near the keyword (usually the correct one in tables)
                # instead of the max, to avoid hitting a total or offset further down
                return candidates[0]
        return None
    
    # Scope 1 emissions
    s1 = find_number_near(r'scope\s*1\s*(?:emissions?|ghg)?[:\s]*', text_lower)
    if s1:
        results['scope1_emissions'] = s1
    
    # Scope 2 emissions (Try market-based first as it's the standard for net zero)
    s2 = find_number_near(r'scope\s*2\s*market-based\s*(?:emissions?|ghg)?[:\s]*', text_lower)
    if not s2:
        s2 = find_number_near(r'scope\s*2\s*location-based\s*(?:emissions?|ghg)?[:\s]*', text_lower)
    if not s2:
        s2 = find_number_near(r'scope\s*2\s*(?:emissions?|ghg)?[:\s]*', text_lower)
    if s2:
        results['scope2_emissions'] = s2
    
    # Scope 3 emissions
    s3 = find_number_near(r'scope\s*3\s*(?:emissions?|ghg)?[:\s]*', text_lower)
    if s3:
        results['scope3_emissions'] = s3
    
    # Total emissions
    total = find_number_near(r'total\s*(?:ghg|emissions|carbon\s*emissions)[:\s]*', text_lower)
    if total:
        results['total_emissions'] = total
    
    # ESG Ratings
    esg_parts = []
    # MSCI (e.g. AA, AAA, BBB)
    msci = re.search(r'MSCI\s*(?:ESG)?\s*(?:rating|score)?[:\s]*([A-G]{1,3}[+-]?)', text, re.IGNORECASE)
    if msci:
        esg_parts.append(f"MSCI: {msci.group(1).upper()}")
    
    # CDP (e.g. A, A-, B)
    cdp = re.search(r'CDP\s*(?:Climate|Score|Rating)?[:\s]*([A-D][+-]?)', text, re.IGNORECASE)
    if cdp:
        esg_parts.append(f"CDP: {cdp.group(1).upper()}")
    
    # Sustainalytics (usually 0-100 score)
    sustain = re.search(r'Sustainalytics\s*(?:ESG)?\s*(?:risk|score|rating)?[:\s]*(\d+\.?\d*)', text, re.IGNORECASE)
    if sustain:
        esg_parts.append(f"Sustainalytics: {sustain.group(1)}")
    
    # S&P Global (usually 0-100 score)
    sp = re.search(r'S&P\s*(?:Global)?\s*(?:ESG)?\s*(?:score)?[:\s]*(\d+)', text, re.IGNORECASE)
    if sp:
        esg_parts.append(f"S&P Global: {sp.group(1)}")
    
    if esg_parts:
        results['esg_ratings'] = ', '.join(esg_parts)
    
    # Renewable energy percentage
    renew = re.search(r'(\d+(?:\.\d+)?)\s*%\s*(?:of\s*)?(?:renewable|clean)\s*(?:energy|electricity)', text, re.IGNORECASE)
    if renew:
        results['renewable_energy_pct'] = float(renew.group(1))
    
    # Net zero target
    nz = re.search(r'net[\s-]*zero\s*(?:target|goal|by|in)?\s*(?:by|in|:)?\s*(20\d{2})', text, re.IGNORECASE)
    if nz:
        results['net_zero_target'] = nz.group(1)
    
    return results


def save_to_db(data, filename):
    """Save extracted ESG data to the GreenOrb backend. Merges with existing data."""
    company_name = data.get("company_name")
    if not company_name or company_name == "Unknown":
        print(f"    ⚠️ Could not identify company. Skipping DB save.")
        return False

    # Fetch existing data from DB to avoid overwriting good data with nulls
    existing = {}
    try:
        # We'll use the /api/data endpoint to find the existing company
        res = requests.get(f"{API_BASE}/data", timeout=5)
        if res.status_code == 200:
            all_companies = res.json()
            existing = next((c for c in all_companies if c['name'] == company_name), {})
    except:
        pass

    # Parse Scope 1/2/3 emissions
    def parse_number(val):
        if val is None or val == "null" or val == "Unknown":
            return None
        try:
            cleaned = re.sub(r'[^\d.]', '', str(val))
            return float(cleaned) if cleaned else None
        except:
            return None

    s1 = parse_number(data.get("scope1_emissions"))
    s2 = parse_number(data.get("scope2_emissions"))
    s3 = parse_number(data.get("scope3_emissions"))
    total = parse_number(data.get("total_emissions"))
    
    # Merge with existing numbers if current is None
    if s1 is None and existing.get('s1'): s1 = float(existing['s1'])
    if s2 is None and existing.get('s2'): s2 = float(existing['s2'])
    if s3 is None and existing.get('s3'): s3 = float(existing['s3'])
    if total is None and existing.get('co2'): total = float(existing['co2'])

    # If total still None, compute from scopes
    if total is None and any(v is not None for v in [s1, s2, s3]):
        total = sum(v for v in [s1, s2, s3] if v is not None)
    
    # Build ESG string from ratings
    esg_str = data.get("esg_ratings") or data.get("esg_grade")
    if not esg_str or esg_str == "Unknown":
        esg_str = existing.get('esg', "Unknown")

    # Clean report year
    report_year = parse_number(data.get("report_year"))
    if not report_year:
        report_year = existing.get('report_year')

    payload = {
        "name": company_name,
        "sector": data.get("sector") or existing.get("sector", "Unknown"),
        "country": data.get("country") or existing.get("country", "Unknown"),
        "co2": total,
        "esg": esg_str,
        "url": filename,
        "products": data.get("products") or existing.get("products", "Unknown"),
        "methodology": data.get("sustainability_summary") or existing.get("methodology", "Extracted from official ESG Report"),
        "s1": s1 or 0,
        "s2": s2 or 0,
        "s3": s3 or 0,
        "report_year": int(report_year) if report_year else None
    }

    print(f"    📊 Scope 1: {s1 or 'N/A'} | Scope 2: {s2 or 'N/A'} | Scope 3: {s3 or 'N/A'}")
    print(f"    📊 Total CO2: {total or 'N/A'} | ESG: {esg_str}")

    try:
        # Save local JSON result
        json_filename = f"{company_name.replace(' ', '_')}_{report_year or 'Unknown'}.json"
        with open(os.path.join(JSON_RESULTS_DIR, json_filename), "w") as f:
            json.dump(payload, f, indent=2)

        res = requests.post(f"{API_BASE}/scout", json=payload, timeout=10)
        if res.status_code == 200:
            print(f"    ✅ DB updated/merged: {company_name}")
            return True
    except Exception as e:
        print(f"    ❌ DB error: {e}")

    return False


# ─── LAYER 5: RAG INDEXING (Persistent Memory) ──────────────────────────────

def chunk_text(text, chunk_size=1000, overlap=100):
    """Split text into manageable chunks for vector embedding."""
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += (chunk_size - overlap)
    return chunks

def generate_embedding(text):
    """Get vector embedding using Gemini's text-embedding-004 model."""
    body = {
        "model": "models/text-embedding-004",
        "content": {"parts": [{"text": text[:2048]}]}
    }
    try:
        response = requests.post(GEMINI_EMBED_URL, json=body, timeout=60)
        if response.status_code == 200:
            return response.json().get("embedding", {}).get("values")
        else:
            print(f"    ❌ Embedding API error {response.status_code}: {response.text[:200]}")
    except Exception as e:
        print(f"    ❌ Embedding error: {e}")
    return None

def index_pdf_for_rag(filepath, company_name, report_year):
    """Chunk the PDF, embed each chunk, and save to the database for RAG."""
    print(f"    🧠 Indexing report for Corporate Intelligence (RAG)...")
    
    doc = fitz.open(filepath)
    all_chunks = []
    
    for i in range(len(doc)):
        page_text = doc[i].get_text()
        if not page_text.strip():
            continue
            
        chunks = chunk_text(page_text)
        for chunk in chunks:
            all_chunks.append({
                "content": chunk,
                "page": i + 1
            })

    print(f"    🔢 Generating embeddings for {len(all_chunks)} chunks...")
    indexed = 0
    for idx, item in enumerate(all_chunks):
        embedding = generate_embedding(item["content"])
        if embedding:
            # Pushing directly to DB via a new endpoint /api/embeddings
            payload = {
                "company_name": company_name,
                "content": item["content"],
                "embedding": embedding,
                "page_number": item["page"],
                "report_year": report_year,
                "metadata": {"source": os.path.basename(filepath)},
                "is_first_chunk": (idx == 0) # Trigger cleanup on first chunk
            }
            try:
                res = requests.post(f"{API_BASE}/embeddings", json=payload, timeout=10)
                if res.status_code == 200:
                    indexed += 1
            except:
                pass
    
    print(f"    ✅ RAG indexing complete: {indexed}/{len(all_chunks)} chunks stored.")
    return indexed > 0


# ─── FULL PIPELINE ──────────────────────────────────────────────────────────

def process_single_pdf(filepath):
    """Map-Reduce extraction: Markdown conversion → Page-by-page LLM → Merge → Save."""
    filename = os.path.basename(filepath)
    print(f"    📖 Processing {filename} with Markdown AI...")

    # Step 1: Find high-value page indices
    target_pages = find_emissions_pages(filepath)
    
    doc = fitz.open(filepath)
    extracted_data = {}
    
    # New Phase: Spatial Preservation via Docling
    print(f"    🧠 Initializing Docling on {len(target_pages)} individual pages to prevent memory exhaustion...")
    converter = DocumentConverter()
    
    import tempfile
    
    for idx, p in enumerate(target_pages):
        try:
            temp_pdf_path = os.path.join(tempfile.gettempdir(), f"temp_{filename}_page_{p}.pdf")
            mini_doc = fitz.open()
            try:
                mini_doc.insert_pdf(doc, from_page=p, to_page=p)
                mini_doc.save(temp_pdf_path)
            except Exception:
                pass
            finally:
                mini_doc.close()

            print(f"    � Analyzing Page {p + 1} with Docling...")
            result = converter.convert(temp_pdf_path)
            full_tags = result.document.export_to_doctags()
            
            # Sub-chunk if the tags are exceptionally long for Docusing
            def chunk_string(s, length=12000):
                return [s[i:i+length] for i in range(0, len(s), length)]
            
            tag_chunks = chunk_string(full_tags)
            
            for chunk_idx, tag_chunk in enumerate(tag_chunks):
                page_json = analyze_with_gemini(tag_chunk, f"{filename} - Page {p+1} Chunk {chunk_idx+1}")
                
                if page_json:
                    print(f"    📊 P{p+1} Extracted Scopes: S1={page_json.get('scope1_emissions')}, S2={page_json.get('scope2_emissions')}, S3={page_json.get('scope3_emissions')} | Total={page_json.get('total_emissions')}")
                    
                    # Math Audit Step (EulerESG / InternVL2 self-supervision)
                    def parse_num(v):
                        if not v or v == "null" or v == "Unknown": return None
                        cln = re.sub(r'[^\d.]', '', str(v))
                        return float(cln) if cln else None
                        
                    s1_val = parse_num(page_json.get('scope1_emissions'))
                    s2_val = parse_num(page_json.get('scope2_emissions'))
                    s3_val = parse_num(page_json.get('scope3_emissions'))
                    tot_val = parse_num(page_json.get('total_emissions'))
                    
                    if tot_val is not None and any(v is not None for v in [s1_val, s2_val, s3_val]):
                        calc_tot = sum(v for v in [s1_val, s2_val, s3_val] if v is not None)
                        margin = 0.05
                        if calc_tot > 0 and abs(calc_tot - tot_val) / tot_val > margin:
                            print(f"    ⚠️ MATH AUDIT FAILED: sum({calc_tot}) != reported({tot_val}). Triggering Rethink Loop...")
                            rethink_prompt = f"{filename} - Page {p+1} (RETHINK: The previous sums {calc_tot} did not match reported total {tot_val}. Zoom in on the table spatial layout and recalculate based on Metric Connection Map!)"
                            page_json_rethink = analyze_with_gemini(tag_chunk, rethink_prompt)
                            if page_json_rethink:
                                print("    🔄 Rethink Complete. Using revised values.")
                                page_json = page_json_rethink

                    # Merge logic: prioritize non-null, convert strings to numbers
                    for k, v in page_json.items():
                        if v is not None and v != "null" and v != "Unknown" and v != "":
                            val = v
                            if isinstance(v, str) and any(c.isdigit() for c in v) and k.endswith('_emissions'):
                                try:
                                    clean_val = re.sub(r'[^\d.]', '', v)
                                    val = float(clean_val) if '.' in clean_val else int(clean_val)
                                except:
                                    pass
                            
                            if extracted_data.get(k) is None or extracted_data.get(k) == 0 or extracted_data.get(k) == "Unknown":
                                extracted_data[k] = val
                            elif isinstance(val, (int, float)) and val > 0 and (not isinstance(extracted_data[k], (int, float)) or val > extracted_data[k]):
                                extracted_data[k] = val

            # Cleanup
            try:
                if os.path.exists(temp_pdf_path):
                    os.remove(temp_pdf_path)
            except:
                pass

        except Exception as e:
            print(f"    ⚠️ Page {p+1} processing failed: {e}")

    # Step 3: Global Regex Fallback (Hard numbers)
    print(f"    🔬 Running regex safety check on full document text...")
    full_text = extract_text_from_pdf(filepath, max_pages=30)
    regex_data = regex_extract_emissions(full_text)
    
    # Merge regex data as a baseline for emissions
    for k, v in regex_data.items():
        if v is not None and (extracted_data.get(k) is None or extracted_data.get(k) == 0):
            extracted_data[k] = v

    # Final result construction
    company_name = extracted_data.get('company_name', "Unknown Company")
    report_year = extracted_data.get('report_year')
    
    if company_name == "Unknown Company":
        parts = filename.replace(".pdf", "").split(" - ")
        if len(parts) >= 1:
            company_name = parts[0]

    extracted_data['company_name'] = company_name
    print(f"    ✅ Final Identification: {company_name} ({report_year or 'Unknown Year'})")
    
    # Step 4: Save to DB
    save_to_db(extracted_data, filename)

    # Step 5: RAG indexing (100% pages)
    index_pdf_for_rag(filepath, company_name, report_year)
    
    # Step 6: Move to Processed
    import shutil
    target = os.path.join(PROCESSED_DIR, filename)
    shutil.move(filepath, target)
    print(f"    📁 Moved to Processed/")
    return True


def discover_and_process(company_name):
    """Full pipeline for a single company: Search → Download → Extract → Save."""
    print(f"\n{'─' * 60}")
    print(f"🏢 {company_name}")
    print(f"{'─' * 60}")

    # Step 1: Search for ESG report PDF
    url, year = search_esg_report(company_name)

    if not url:
        print(f"    ❌ No ESG report found for {company_name}")
        return False

    # Step 2: If URL is not a PDF, try crawling the page for PDF links
    if not url.lower().endswith(".pdf"):
        print(f"    🌐 URL is not a direct PDF. Crawling page for PDF links...")
        pdf_url = asyncio.run(crawl_for_pdf_link(url, company_name))
        if pdf_url:
            url = pdf_url
        else:
            print(f"    ❌ Could not find a PDF link on the page.")
            return False

    # Step 3: Download PDF
    filepath = download_pdf(url, company_name, year or CURRENT_YEAR - 1)
    if not filepath:
        return False

    # Step 4: Process with Llama 3.2
    return process_single_pdf(filepath)


# ─── MAIN ────────────────────────────────────────────────────────────────────

def get_companies_from_db():
    """Fetch all company names from the Neon database via the API."""
    try:
        res = requests.get(f"{API_BASE}/data", timeout=15)
        if res.status_code == 200:
            data = res.json()
            return [c["name"] for c in data if c.get("name")]
    except Exception as e:
        print(f"❌ Could not fetch companies from DB: {e}")
    return []


def main():
    sys.stdout.reconfigure(encoding='utf-8')

    parser = argparse.ArgumentParser(description="GreenOrb ESG Report Discovery Agent")
    parser.add_argument("--company", type=str, help="Process a single company by name")
    parser.add_argument("--start", type=int, default=0, help="Start from company index N")
    parser.add_argument("--limit", type=int, default=0, help="Process only N companies (0 = all)")
    args = parser.parse_args()

    print("=" * 60)
    print("  🤖 GreenOrb ESG Discovery Agent v1.0")
    print("  Autonomous Report Search → Download → Extract → DB Sync")
    print("=" * 60)

    if args.company:
        # Single company mode
        success = discover_and_process(args.company)
        status = "✅ SUCCESS" if success else "❌ FAILED"
        print(f"\n{status}: {args.company}")
        return

    # Batch mode: get all companies from DB
    print("\n📡 Fetching company list from database...")
    companies = get_companies_from_db()

    if not companies:
        print("❌ No companies found in database. Run the enrichment pipeline first.")
        return

    # Apply filters
    companies = companies[args.start:]
    if args.limit > 0:
        companies = companies[:args.limit]

    print(f"📋 Processing {len(companies)} companies...\n")

    success = 0
    failed = 0
    skipped = 0

    for i, name in enumerate(companies):
        print(f"\n[{i+1}/{len(companies)}]", end="")

        try:
            result = discover_and_process(name)
            if result:
                success += 1
            else:
                failed += 1
        except KeyboardInterrupt:
            print("\n\n⛔ Interrupted by user. Exiting...")
            break
        except Exception as e:
            print(f"    ❌ Unexpected error for {name}: {e}")
            failed += 1

        # Rate limit between companies
        time.sleep(2)

    print("\n" + "=" * 60)
    print(f"  COMPLETE: {success} found, {failed} failed, {skipped} skipped")
    print(f"  out of {len(companies)} companies")
    print("=" * 60)


if __name__ == "__main__":
    main()
