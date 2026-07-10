import os
import sys
sys.stdout.reconfigure(encoding='utf-8')
import json
import glob
import re
import fitz
import requests
from dotenv import load_dotenv

# Add Backend folder to path so we can import db.js (actually db is JS, we will query via raw requests or node)
# But wait, in Python, we can query Neon DB using psycopg2 or pg8000, or we can just fetch from our local backend API!
# Yes!!! Querying our active local backend API on port 5000 is 100% reliable and doesn't require installing Python postgres libraries!
# Local API is running! We can fetch from http://localhost:5000/api/data

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"), override=True)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY") or "AIzaSyD2IaDVX6JNm8QwW1fr_gXXIQ0C_-Kgt4s"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"
RAW_DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "downloaded_reports")

# Import functions from process_esg_reports.py
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))
try:
    from process_esg_reports import extract_text_from_pdf, build_analyze_prompt, parse_llm_json, analyze_with_groq
except ImportError as e:
    print(f"Import error: {e}")
    sys.exit(1)

def run_gemini_extraction(text, filename):
    prompt = build_analyze_prompt(text)
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.0, "maxOutputTokens": 2048}
    }
    try:
        response = requests.post(GEMINI_URL, json=body, timeout=120)
        if response.status_code == 200:
            result_data = response.json()
            result = result_data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            return parse_llm_json(result, filename)
        else:
            print(f"Gemini API Error (HTTP {response.status_code}): {response.text}")
    except Exception as e:
        print(f"Error calling Gemini: {e}")
    return None

def fetch_stored_record(company_name):
    # Fetch from local backend API
    try:
        res = requests.get("http://localhost:5000/api/data")
        if res.status_code == 200:
            companies = res.json()
            for c in companies:
                if c.get("name").lower().strip() == company_name.lower().strip():
                    return c
    except Exception as e:
        print(f"Error fetching from local API: {e}")
    return None

def main():
    print("=" * 60)
    print("🔬 ESG Extraction Accuracy Checker")
    print("=" * 60)
    
    # Get all processed PDFs
    pdfs = glob.glob(os.path.join(RAW_DATA_DIR, "*.pdf"))
    if not pdfs:
        print("No PDFs found in downloaded_reports/ directory.")
        return
        
    # Prioritize Tata Motors for testing database matching
    target_pdf = None
    for p in pdfs:
        if "tata_motors" in p.lower():
            target_pdf = p
            break
    if not target_pdf:
        for p in pdfs:
            if "apollo_tyres" in p.lower():
                target_pdf = p
                break
    if not target_pdf:
        target_pdf = pdfs[0]
        
    filename = os.path.basename(target_pdf)
    print(f"Selected PDF for test: {filename}")
    
    # 1. Extract text using the optimized stitcher
    text = extract_text_from_pdf(target_pdf)
    if not text:
        print("Failed to extract text from PDF.")
        return
        
    # 2. Run fresh Gemini extraction
    print("\nRunning fresh Gemini extraction...")
    gemini_data = run_gemini_extraction(text, filename)
    if not gemini_data:
        print("Gemini extraction failed. Trying Groq Cloud API fallback...")
        gemini_data = analyze_with_groq(text, filename)
        
    if not gemini_data:
        print("Extraction failed on both Gemini and Groq fallback.")
        return
        
    company_name = gemini_data.get("company_name")
    print(f"Extracted Company Name: {company_name}")
    
    # 3. Retrieve stored database record
    print("\nRetrieving stored database record...")
    db_record = fetch_stored_record(company_name)
    if not db_record:
        print(f"No database record found for '{company_name}'.")
        # Print Gemini output for review
        print(json.dumps(gemini_data, indent=2))
        return
        
    # 4. Compare key fields
    print("\n" + "-" * 50)
    print("📊 COMPARING FIELDS (Database vs Fresh Gemini)")
    print("-" * 50)
    
    # Map DB column names to Gemini payload keys if different
    # DB fields: name, report_year, revenue, profit, ebitda, local_procurement_pct, employee_count, co2, s1, s2, s3, net_zero_year
    # Gemini fields: company_name, report_year, revenue, profit, ebitda, local_procurement_pct, employee_count, co2_estimate, scope_1, scope_2, scope_3, net_zero_target
    
    comparison_keys = [
        ("report_year", "report_year"),
        ("revenue", "revenue"),
        ("profit", "profit"),
        ("ebitda", "ebitda"),
        ("employee_count", "employee_count"),
        ("co2", "co2_estimate"),
        ("s1", "scope_1"),
        ("s2", "scope_2"),
        ("s3", "scope_3"),
    ]
    
    mismatches = 0
    matches = 0
    
    for db_key, gem_key in comparison_keys:
        db_val = db_record.get(db_key)
        gem_val = gemini_data.get(gem_key)
        
        # Normalize comparison (e.g. handle string vs float, null vs None)
        norm_db = str(db_val).strip() if db_val is not None else "null"
        norm_gem = str(gem_val).strip() if gem_val is not None else "null"
        
        # Handle float values that might look slightly different (e.g. 55000.0 vs 55000)
        try:
            if float(norm_db) == float(norm_gem):
                norm_db = norm_gem
        except ValueError:
            pass
            
        status = "✅ MATCH" if norm_db == norm_gem else "❌ MISMATCH"
        if status == "✅ MATCH":
            matches += 1
        else:
            mismatches += 1
            
        print(f"Key: {db_key.upper():<20} | DB: {norm_db:<15} | Gemini: {norm_gem:<15} | {status}")
        
    print("\n" + "-" * 50)
    print(f"Result: {matches} Matches, {mismatches} Mismatches")
    print("-" * 50)
    
    if mismatches > 0:
        print("\n🔍 INVESTIGATING MISMATCHES:")
        print("Let's analyze why these values changed and what solutions exist.")

if __name__ == "__main__":
    main()
