"""  """"""
GreenOrb Company Enrichment Pipeline
=====================================
Reads the Forbes Top 2000 PDF, extracts company names + metadata,
then uses Crawl4AI + Llama 3.2 to discover products, services,
and sustainability data for each company. Saves everything to the
Neon PostgreSQL database via the Express API.

Usage:
    python enrich_companies.py [--start N] [--limit N]

Arguments:
    --start N   Start from company rank N (default: 1)
    --limit N   Process only N companies (default: all)
"""

import os
import re
import sys
import json
import time
import argparse
import requests
import fitz  # PyMuPDF

OLLAMA_URL = "http://localhost:11434/api/generate"
API_BASE = "http://localhost:5000/api"
RAW_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "RawData")
FORBES_PDF = os.path.join(RAW_DATA_DIR, "Forbes Top 2000 - 2025.pdf")

# ─── STEP 1: Parse the Forbes PDF ────────────────────────────────────────────

def parse_forbes_pdf(filepath):
    """Extract structured company data from the Forbes Top 2000 PDF."""
    doc = fitz.open(filepath)
    companies = []

    for page in doc:
        text = page.get_text()
        lines = [l.strip() for l in text.split("\n") if l.strip()]

        # Skip header lines
        i = 0
        while i < len(lines):
            # Look for a line that is just a number (rank)
            if lines[i].isdigit():
                rank = int(lines[i])
                # Next lines: name, country, industry, sales, profit, assets, market_value
                if i + 7 <= len(lines):
                    name = lines[i + 1]
                    country = lines[i + 2]
                    industry = lines[i + 3]
                    sales = lines[i + 4]
                    profit = lines[i + 5]
                    assets = lines[i + 6]
                    market_value = lines[i + 7] if i + 7 < len(lines) else "N/A"

                    companies.append({
                        "rank": rank,
                        "name": name,
                        "country": country,
                        "sector": industry,
                        "sales": sales,
                        "profit": profit,
                        "assets": assets,
                        "market_cap": market_value,
                    })
                    i += 8
                else:
                    i += 1
            else:
                i += 1

    return companies

# ─── STEP 2: Use Crawl4AI to find sustainability info ────────────────────────

def get_wikipedia_summary(company_name):
    """Fetch the Wikipedia summary for the company to provide context to the LLM."""
    try:
        query = requests.utils.quote(str(company_name))
        headers = {
            "User-Agent": "GreenOrbEnrichment/1.0 (https://github.com/Prawag/greenorb; student@example.com) python-requests/2.x"
        }
        
        # Ask Wikipedia directly for the article extract based on the name, following redirects
        extract_url = f"https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&redirects=1&titles={query}&format=json"
        
        res = requests.get(extract_url, headers=headers, timeout=10)
        if res.status_code == 200:
            data = res.json()
             # Print any redirects that happened
            if "redirects" in data.get("query", {}):
                print(f"    [Wiki] Redirected {data['query']['redirects'][0]['from']} -> {data['query']['redirects'][0]['to']}")
                
            pages = data.get("query", {}).get("pages", {})
            for page_id, page_data in pages.items():
                if str(page_id) != "-1": # -1 means page missing
                    extract = page_data.get("extract", "")
                    if extract:
                        return extract[:4000] # Truncate for LLM window
            print(f"    [Wiki] Page not found for '{company_name}'")
        else:
             print(f"    [Wiki] Search API returned {res.status_code}")
    except Exception as e:
        print(f"    [Wiki] Fetch failed for {company_name}: {e}")

    return None

# ─── STEP 3: Use Llama 3.2 to extract structured data ────────────────────────

def build_enrich_prompt(company, web_context):
    """Build the enrichment prompt for Llama 3.2."""
    return (
        'You are a business intelligence AI. Given the following information about a company, extract the data requested.\n'
        'Return ONLY a valid JSON object (no markdown fences). IMPORTANT: Do not guess or estimate data. Only return actual documented data, otherwise return "Unknown".\n\n'
        'Required JSON format:\n'
        '{"products": "Comma-separated list of main products or services based on the text", '
        '"co2_estimate": "Actual reported annual CO2 emissions in metric tons if explicitly stated. IMPORTANT: Do NOT estimate. If not stated, return \\"Unknown\\"", '
        '"esg_grade": "Explicitly reported ESG grade if stated. IMPORTANT: Do NOT estimate. If not stated, return \\"Unknown\\"", '
        '"net_zero_target": "Explicitly stated Net zero target year. IMPORTANT: Do NOT estimate. If not stated, return \\"Unknown\\"", '
        '"sustainability_summary": "One sentence summarizing their sustainability initiatives if mentioned in the context, otherwise return \\"Unknown\\""}\n\n'
        'Company: ' + company["name"] + '\n'
        'Industry: ' + company["sector"] + '\n'
        'Country: ' + company["country"] + '\n'
        'Market Cap: ' + company["market_cap"] + '\n\n'
        'Additional context from Wikipedia:\n' + web_context
    )

def enrich_with_llama(company, web_context="No web data available."):
    """Use Llama 3.2 to extract products, services, and sustainability data."""
    prompt = build_enrich_prompt(company, web_context)

    body = {
        "model": "llama3.2",
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.1, "num_ctx": 8192}
    }

    try:
        response = requests.post(OLLAMA_URL, json=body, timeout=120)
        if response.status_code == 200:
            result = response.json().get("response", "")
            result = result.strip()
            # Clean markdown code fences if present
            if result.startswith("```json"):
                result = result[7:]
            if result.startswith("```"):
                result = result[3:]
            if result.endswith("```"):
                result = result[:-3]

            try:
                return json.loads(result.strip())
            except json.JSONDecodeError:
                # Try to find JSON in the response
                match = re.search(r'\{[^{}]*\}', result, re.DOTALL)
                if match:
                    try:
                        return json.loads(match.group())
                    except:
                        pass
                print(f"    Failed to parse Llama output for {company['name']}")
    except Exception as e:
        print(f"    Llama error for {company['name']}: {e}")

    return None

# ─── STEP 4: Save to Database ────────────────────────────────────────────────

def save_to_db(company, enrichment):
    """Push enriched company data to the Express backend."""
    # Parse CO2 estimate
    co2_val = None
    if enrichment and enrichment.get("co2_estimate", "Unknown") != "Unknown":
        try:
            co2_str = re.sub(r'[^\d.]', '', str(enrichment["co2_estimate"]))
            co2_val = float(co2_str) if co2_str else None
        except:
            co2_val = None

    payload = {
        "name": company["name"],
        "sector": company["sector"],
        "country": company["country"],
        "co2": co2_val,
        "esg": enrichment.get("esg_grade", "Unknown") if enrichment else "Unknown",
        "url": "N/A",
        "products": enrichment.get("products", "Unknown") if enrichment else "Unknown",
        "methodology": f"Forbes 2000 Rank #{company['rank']} | Market Cap: {company['market_cap']}",
        "s1": 0,
        "s2": 0,
        "s3": 0,
    }

    try:
        res = requests.post(f"{API_BASE}/scout", json=payload, timeout=10)
        if res.status_code == 200:
            return True
        else:
            print(f"    DB API returned {res.status_code} for {company['name']}")
    except Exception as e:
        print(f"    DB error for {company['name']}: {e}")

    return False

# ─── MAIN ────────────────────────────────────────────────────────────────────

def main():
    sys.stdout.reconfigure(encoding='utf-8')

    parser = argparse.ArgumentParser(description="GreenOrb Forbes 2000 Enrichment Pipeline")
    parser.add_argument("--start", type=int, default=1, help="Start from rank N")
    parser.add_argument("--limit", type=int, default=0, help="Process only N companies (0 = all)")
    parser.add_argument("--skip-crawl", action="store_true", help="Skip web crawling, use LLM knowledge only")
    args = parser.parse_args()

    if not os.path.exists(FORBES_PDF):
        print(f"Forbes PDF not found at: {FORBES_PDF}")
        print("Please place 'Forbes Top 2000 - 2025.pdf' in the RawData/ folder.")
        return

    # Step 1: Parse PDF
    print("=" * 60)
    print("  GreenOrb Forbes 2000 Enrichment Pipeline")
    print("=" * 60)
    print(f"\nParsing Forbes PDF...")
    companies = parse_forbes_pdf(FORBES_PDF)
    print(f"Found {len(companies)} companies in the PDF.\n")

    # Filter by start/limit
    filtered = [c for c in companies if c["rank"] >= args.start]
    if args.limit > 0:
        filtered = filtered[:args.limit]

    print(f"Processing {len(filtered)} companies (starting from rank {args.start})...")
    print("-" * 60)

    saved = 0
    failed = 0

    for i, company in enumerate(filtered):
        print(f"\n[{i+1}/{len(filtered)}] #{company['rank']} {company['name']} ({company['country']}, {company['sector']})")

        # Step 2: Crawl (optional)
        web_context = "No web data available. Use your general knowledge."
        if not args.skip_crawl:
            print(f"    Fetching Wikipedia summary for context...")
            crawled = get_wikipedia_summary(company["name"])
            if crawled:
                web_context = crawled
                print(f"    Got {len(web_context)} chars of Wikipedia data.")
            else:
                print(f"    No Wikipedia data found, using LLM knowledge only.")

        # Step 3: Enrich with Llama
        print(f"    Extracting products/services with Llama 3.2...")
        enrichment = enrich_with_llama(company, web_context)

        if enrichment:
            print(f"    Products: {enrichment.get('products', 'N/A')[:80]}...")
            print(f"    ESG: {enrichment.get('esg_grade', 'N/A')} | CO2: {enrichment.get('co2_estimate', 'N/A')}")

        # Step 4: Save
        if save_to_db(company, enrichment):
            print(f"    Saved to DB!")
            saved += 1
        else:
            failed += 1

        # Small pause between companies
        time.sleep(0.5)

    print("\n" + "=" * 60)
    print(f"  COMPLETE: {saved} saved, {failed} failed out of {len(filtered)}")
    print("=" * 60)

if __name__ == "__main__":
    main()
