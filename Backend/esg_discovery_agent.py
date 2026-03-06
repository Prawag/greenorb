"""
GreenOrb ESG Report Discovery Agent
=====================================
Autonomous agent that searches the internet for official company
sustainability/ESG reports, downloads the PDFs, and processes them
through the existing Llama 3.2 pipeline.

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

# ─── CONFIG ──────────────────────────────────────────────────────────────────

OLLAMA_URL = "http://localhost:11434/api/generate"
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

def extract_text_from_pdf(pdf_path, max_pages=30):
    """Extract text from the first N pages of a PDF."""
    doc = fitz.open(pdf_path)
    text = ""
    for i in range(min(len(doc), max_pages)):
        text += doc[i].get_text() + "\n"
    return text[:20000]


def analyze_with_llama(text, filename):
    """Use Llama 3.2 to extract factual ESG data from the report text."""
    prompt = (
        'You are a highly precise corporate data extraction AI. Read the following text extracted from an ESG or Sustainability report.\n'
        'Your job is to identify the company who published this report and pull exact factual figures.\n'
        'IMPORTANT RULES:\n'
        '1. DO NOT GUESS OR ESTIMATE ANY NUMBERS. If a value is not explicitly stated in the text, return "Unknown" or null.\n'
        '2. Return ONLY a valid JSON object. No markdown formatting or explanations.\n\n'
        'Required JSON format:\n'
        '{\n'
        '  "company_name": "The explicitly stated name of the company publishing the report.",\n'
        '  "report_year": "The year this report covers (e.g., 2024 or 2025). Return as an integer. If not found, return null.",\n'
        '  "co2_estimate": "The explicit reported annual CO2 or GHG emissions in metric tons. Return as a number. If not explicitly found, return null.",\n'
        '  "esg_grade": "Explicitly reported ESG grade/rating if stated. Otherwise return \\"Unknown\\"",\n'
        '  "products": "A comma-separated list of the company\'s main products or services based on the text.",\n'
        '  "sector": "The industry sector of the company (e.g., Energy, Banking, Technology, Consumer, Healthcare, Manufacturing).",\n'
        '  "country": "The headquarters country of the company.",\n'
        '  "net_zero_target": "The explicitly stated Net zero target year. If not stated, return \\"Unknown\\"",\n'
        '  "sustainability_summary": "One sentence summarizing their primary sustainability milestone mentioned in the text."\n'
        '}\n\n'
        'Report Text:\n'
        + text
    )

    body = {
        "model": "llama3.2",
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.0, "num_ctx": 8192}
    }

    try:
        response = requests.post(OLLAMA_URL, json=body, timeout=180)
        if response.status_code == 200:
            result = response.json().get("response", "")
            result = result.strip()

            # Clean markdown code fences
            if result.startswith("```json"):
                result = result[7:]
            if result.startswith("```"):
                result = result[3:]
            if result.endswith("```"):
                result = result[:-3]

            try:
                return json.loads(result.strip())
            except json.JSONDecodeError:
                match = re.search(r'\{[^{}]*\}', result, re.DOTALL)
                if match:
                    try:
                        return json.loads(match.group())
                    except:
                        pass
                print(f"    ❌ Failed to parse Llama JSON for {filename}")
    except Exception as e:
        print(f"    ❌ Llama error for {filename}: {e}")

    return None


def save_to_db(data, filename):
    """Save extracted ESG data to the GreenOrb backend."""
    company_name = data.get("company_name")
    if not company_name or company_name == "Unknown":
        print(f"    ⚠️ Could not identify company. Skipping DB save.")
        return False

    # Clean CO2 data
    co2_val = None
    if data.get("co2_estimate"):
        try:
            co2_str = re.sub(r'[^\d.]', '', str(data["co2_estimate"]))
            co2_val = float(co2_str) if co2_str else None
        except:
            co2_val = None

    # Clean report year
    report_year = None
    if data.get("report_year"):
        try:
            year_str = re.sub(r'[^\d]', '', str(data["report_year"]))
            report_year = int(year_str) if year_str else None
        except:
            report_year = None

    payload = {
        "name": company_name,
        "sector": data.get("sector", "Unknown"),
        "country": data.get("country", "Unknown"),
        "co2": co2_val,
        "esg": data.get("esg_grade", "Unknown"),
        "url": filename,
        "products": data.get("products", "Unknown"),
        "methodology": data.get("sustainability_summary", "Extracted from official ESG Report"),
        "s1": 0,
        "s2": 0,
        "s3": 0,
        "report_year": report_year
    }

    try:
        # Save local JSON result
        json_filename = f"{company_name.replace(' ', '_')}_{report_year or 'Unknown'}.json"
        with open(os.path.join(JSON_RESULTS_DIR, json_filename), "w") as f:
            json.dump(payload, f, indent=2)
        print(f"    📂 JSON saved: {json_filename}")

        res = requests.post(f"{API_BASE}/scout", json=payload, timeout=10)
        if res.status_code == 200:
            print(f"    ✅ DB updated: {company_name} (Year: {report_year})")
            return True
        else:
            print(f"    ❌ DB API returned {res.status_code}")
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
    """Get vector embedding for a chunk of text using Ollama's nomic-embed-text."""
    body = {
        "model": "nomic-embed-text",
        "prompt": text
    }
    try:
        response = requests.post("http://localhost:11434/api/embeddings", json=body, timeout=60)
        if response.status_code == 200:
            return response.json().get("embedding")
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
    for item in all_chunks:
        embedding = generate_embedding(item["content"])
        if embedding:
            # Pushing directly to DB via a new endpoint /api/embeddings
            payload = {
                "company_name": company_name,
                "content": item["content"],
                "embedding": embedding,
                "page_number": item["page"],
                "report_year": report_year,
                "metadata": {"source": os.path.basename(filepath)}
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
    """Extract text → Llama 3.2 → Save to DB → RAG Indexing."""
    filename = os.path.basename(filepath)

    print(f"    📖 Extracting text from PDF...")
    text = extract_text_from_pdf(filepath)
    if not text.strip():
        print(f"    ⚠️ No text extracted from {filename}")
        return False

    print(f"    🤖 Analyzing with Llama 3.2 (Strict Factual Mode)...")
    data = analyze_with_llama(text, filename)

    if data:
        company_name = data.get('company_name')
        report_year = data.get('report_year')
        
        print(f"    Company: {company_name}")
        print(f"    Year: {report_year}")
        print(f"    CO2: {data.get('co2_estimate')}")
        print(f"    ESG: {data.get('esg_grade')}")

        if save_to_db(data, filename):
            # NEW: RAG Indexing
            index_pdf_for_rag(filepath, company_name, report_year)
            
            # Move to Processed
            import shutil
            target = os.path.join(PROCESSED_DIR, filename)
            shutil.move(filepath, target)
            print(f"    📁 Moved to Processed/")
            return True

    return False


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
