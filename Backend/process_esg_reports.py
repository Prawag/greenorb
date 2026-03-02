"""
GreenOrb ESG Report Watcher
============================
Scans the `RawData/ESG_Reports/` directory for newly uploaded PDF reports.
Extracts the company name, report year, and ESG metrics explicitly without guessing.
Pushes the factual data into the Neon PostgreSQL database.
"""

import os
import re
import sys
import glob
import json
import time
import shutil
import argparse
import requests
import fitz  # PyMuPDF

OLLAMA_URL = "http://localhost:11434/api/generate"
API_BASE = "http://localhost:5000/api"
RAW_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "RawData", "ESG_Reports")
PROCESSED_DIR = os.path.join(RAW_DATA_DIR, "Processed")

# Ensure directories exist
os.makedirs(RAW_DATA_DIR, exist_ok=True)
os.makedirs(PROCESSED_DIR, exist_ok=True)

# ─── EXTRACTION LOGIC ────────────────────────────────────────────────────────

def extract_text_from_pdf(pdf_path, max_pages=30):
    """Extract text from the first 'max_pages' of the PDF (where summaries usually live)."""
    doc = fitz.open(pdf_path)
    text = ""
    for i in range(min(len(doc), max_pages)):
        text += doc[i].get_text() + "\n"
    # Return at most 20,000 characters to ensure it fits in Llama's context window
    return text[:20000]

def build_analyze_prompt(text):
    return (
        'You are a highly precise corporate data extraction AI. Read the following text extracted from an ESG or Sustainability report.\n'
        'Your job is to identify the company who published this report and pull exact factual figures.\n'
        'IMPORTANT RULES:\n'
        '1. DO NOT GUESS OR ESTIMATE ANY NUMBERS. If a value is not explicitly stated in the text, return "Unknown" or null.\n'
        '2. Return ONLY a valid JSON object. No markdown formatting or explanations.\n\n'
        'Required JSON format:\n'
        '{\n'
        '  "company_name": "The explicitly stated name of the company publishing the report.",\n'
        '  "report_year": "The year this report covers (e.g., 2024 or 2025). Extract from title or introductory text. Return as an integer. If not found, return null.",\n'
        '  "co2_estimate": "The explicit, actual reported annual CO2 or GHG emissions in metric tons. Return as a number. If not explicitly found, return null.",\n'
        '  "esg_grade": "Explicitly reported ESG grade/rating if stated. Otherwise return \\"Unknown\\"",\n'
        '  "products": "A comma-separated list of the company\'s main products or services based on the text.",\n'
        '  "net_zero_target": "The explicitly stated Net zero target year. If not stated, return \\"Unknown\\"",\n'
        '  "sustainability_summary": "One sentence summarizing their primary sustainability milestone mentioned in the text."\n'
        '}\n\n'
        'Report Text:\n'
        + text
    )

def analyze_with_llama(text, filename):
    """Use Llama 3.2 to extract the factual data from the report text."""
    prompt = build_analyze_prompt(text)

    body = {
        "model": "llama3.2",
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.0, "num_ctx": 8192}
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
                # Try regex fallback
                match = re.search(r'\{[^{}]*\}', result, re.DOTALL)
                if match:
                    try:
                        return json.loads(match.group())
                    except:
                        pass
                print(f"    ❌ Failed to parse JSON from Llama for {filename}")
    except Exception as e:
        print(f"    ❌ Llama error for {filename}: {e}")

    return None

def save_to_db(data, filename):
    """Save the extracted ESG data to the GreenOrb backend."""
    company_name = data.get("company_name")
    if not company_name or company_name == "Unknown":
        print(f"    ⚠️ Could not identify company name from {filename}. Skipping DB save.")
        return False

    # Clean CO2 data to ensure it's a number
    co2_val = None
    if data.get("co2_estimate"):
        try:
            co2_str = re.sub(r'[^\d.]', '', str(data["co2_estimate"]))
            co2_val = float(co2_str) if co2_str else None
        except:
            co2_val = None
            
    # Clean report year to ensure integer
    report_year = None
    if data.get("report_year"):
        try:
            year_str = re.sub(r'[^\d]', '', str(data["report_year"]))
            report_year = int(year_str) if year_str else None
        except:
            report_year = None

    payload = {
        "name": company_name,
        "sector": "Unknown", # Can be updated later or inferred
        "country": "Unknown",
        "co2": co2_val,
        "esg": data.get("esg_grade", "Unknown"),
        "url": filename,
        "products": data.get("products", "Unknown"),
        "methodology": data.get("sustainability_summary", "Extracted from explicit ESG Report"),
        "s1": 0,
        "s2": 0,
        "s3": 0,
        "report_year": report_year
    }

    try:
        # 3. Save to Local JSON Result File
        results_dir = os.path.join(RAW_DATA_DIR, "JSON_Results")
        os.makedirs(results_dir, exist_ok=True)
        json_filename = f"{company_name.replace(' ', '_')}_{report_year or 'Unknown'}.json"
        with open(os.path.join(results_dir, json_filename), "w") as f:
            json.dump(payload, f, indent=2)
        print(f"    📂 Saved result to JSON_Results/{json_filename}")

        res = requests.post(f"{API_BASE}/scout", json=payload, timeout=10)
        if res.status_code == 200:
             print(f"    ✅ Saved {company_name} (Year: {report_year}) to DB!")
             return True
        else:
             print(f"    ❌ DB API returned {res.status_code} for {company_name}")
    except Exception as e:
         print(f"    ❌ DB connection error for {company_name}: {e}")

    return False

# ─── MAIN WATCHER LOOP ───────────────────────────────────────────────────────

def main():
    sys.stdout.reconfigure(encoding='utf-8')
    print("=" * 60)
    print("  GreenOrb ESG Report Processor Active")
    print(f"  Watching directory: {RAW_DATA_DIR}")
    print("=" * 60)

    pdfs = glob.glob(os.path.join(RAW_DATA_DIR, "*.pdf"))
    if not pdfs:
        print("\nNo newly uploaded PDFs found in RawData/ESG_Reports/")
        print("Drop some ESG reports there and run again!")
        return

    print(f"\nFound {len(pdfs)} new ESG reports to process.\n")
    
    for pdf in pdfs:
        filename = os.path.basename(pdf)
        print("-" * 60)
        print(f"📄 Processing: {filename}")
        
        # 1. Extract text
        print(f"    Extracting text from PDF (up to 30 pages)...")
        text = extract_text_from_pdf(pdf)
        if not text.strip():
            print(f"    ⚠️ Could not extract any text from {filename}. Skipping.")
            continue
            
        print(f"    Extracted {len(text)} characters.")
        
        # 2. Llama 3.2 Parsing
        print(f"    Analyzing with Llama 3.2 (Strict Factual Mode)...")
        extracted_data = analyze_with_llama(text, filename)
        
        if extracted_data:
            print(f"    Company: {extracted_data.get('company_name')}")
            print(f"    Year: {extracted_data.get('report_year')}")
            print(f"    CO2: {extracted_data.get('co2_estimate')}")
            print(f"    ESG Grade: {extracted_data.get('esg_grade')}")
            
            # 3. Save to DB
            if save_to_db(extracted_data, filename):
                # Move to Processed folder so we don't scan it again
                target_path = os.path.join(PROCESSED_DIR, filename)
                shutil.move(pdf, target_path)
                print(f"    Moved {filename} to Processed/ folder.")
        
        time.sleep(1) # Small pause

    print("\n" + "=" * 60)
    print("  All reports processed.")
    print("=" * 60)

if __name__ == "__main__":
    main()
