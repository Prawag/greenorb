import os
import re
import sys
import glob
import json
import time
import io
import requests
import statistics
import fitz
import pymupdf4llm
import pytesseract
from PIL import Image
from dotenv import load_dotenv

pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
fitz.TOOLS.mupdf_display_errors(False)
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"), override=True)

INTERNAL_API_BASE = os.environ.get('INTERNAL_API_BASE', 'http://localhost:5000')
INTERNAL_API_KEY = os.environ.get("INTERNAL_API_KEY", "")
API_BASE = f"{INTERNAL_API_BASE}/api"
RAW_DATA_DIR = os.path.join(os.path.dirname(__file__), "downloaded_reports")
PROCESSED_LOG = os.path.join(RAW_DATA_DIR, "processed.txt")

OLLAMA_URL = "http://localhost:11434/api/generate"

def identify_esg_data_pages(pdf_path):
    """Stage 1: Heuristic Page Router"""
    doc = fitz.open(pdf_path)
    candidate_pages = []
    keywords = ["scope", "tco2e", "gri", "sasb", "appendix", "performance data", "emissions", "ghg", "water", "waste", "energy"]
    
    for i in range(min(len(doc), 150)): # Check first 150 pages max to save time
        page = doc[i]
        text = page.get_text("text").lower()
        
        # Check if scanned
        if len(text.strip()) < 100 and len(page.get_images()) > 0:
            candidate_pages.append((i, True)) # True = scanned
            continue
            
        kw_hits = sum(1 for kw in keywords if kw in text)
        digit_count = len(re.findall(r'\d', text))
        
        # High numeric density (e.g. tables) or keyword hits
        if kw_hits >= 2 or (kw_hits >= 1 and digit_count > 30):
            candidate_pages.append((i, False)) # False = digital
            
    doc.close()
    
    # Always include cover page
    if not any(p[0] == 0 for p in candidate_pages):
        candidate_pages.insert(0, (0, False))
        
    return candidate_pages

def extract_markdown_with_pymupdf4llm(pdf_path):
    """Stage 2: Targeted Markdown Extraction"""
    candidates = identify_esg_data_pages(pdf_path)
    if not candidates:
        return ""
        
    doc = fitz.open(pdf_path)
    final_text = []
    
    # Use pymupdf4llm for digital pages to get clean markdown tables
    digital_pages = [p[0] for p in candidates if not p[1]]
    if digital_pages:
        try:
            md_text = pymupdf4llm.to_markdown(pdf_path, pages=digital_pages)
            final_text.append(md_text)
        except Exception as e:
            print(f"    ⚠️ pymupdf4llm error: {e}")
            
    # Use OCR for scanned pages
    scanned_pages = [p[0] for p in candidates if p[1]]
    for i in scanned_pages:
        try:
            page = doc[i]
            pix = page.get_pixmap(dpi=150)
            img = Image.open(io.BytesIO(pix.tobytes("png")))
            ocr_text = pytesseract.image_to_string(img)
            final_text.append(f"\n\n--- OCR PAGE {i} ---\n\n{ocr_text}")
        except Exception as e:
            print(f"    ⚠️ OCR error on page {i}: {e}")
            
    doc.close()
    return "\n".join(final_text)

def chunk_markdown(text, chunk_size=6000, overlap=1000):
    """Split text into overlapping chunks"""
    if len(text) <= chunk_size:
        return [text]
    chunks = []
    i = 0
    while i < len(text):
        chunks.append(text[i:i+chunk_size])
        i += chunk_size - overlap
    return chunks[:5] # Max 5 chunks to prevent infinite loops / too many calls

def analyze_chunk_with_ollama(chunk_text, company_name_hint, year_hint):
    """Layer 3: Constrained LLM Extraction (Ollama)"""
    prompt = f"""You are an ESG data extraction AI. Extract the requested metrics strictly from the text.
RULES:
1. NEVER guess or estimate. If missing, return null.
2. Return ONLY a valid JSON object. No markdown wrapping, no text.
3. NEVER return 0 unless the text explicitly says zero.
4. Extract raw values. If reported in "thousands", extract the number and specify the unit as "thousand tonnes".

JSON SCHEMA:
{{
  "company_name": "String",
  "report_year": "Integer",
  "scope_1": "Float (GRI 305-1)",
  "scope_2": "Float (GRI 305-2)",
  "scope_3": "Float (GRI 305-3)",
  "energy_consumption": "Float (GRI 302-1)",
  "water_withdrawal": "Float (GRI 303-3)",
  "waste_generated": "Float (GRI 306-3)",
  "revenue": "Float",
  "profit": "Float",
  "unit_emissions": "String (e.g. tCO2e, ktCO2e)",
  "unit_energy": "String (e.g. GJ, MWh)",
  "unit_water": "String (e.g. ML, kL)",
  "unit_waste": "String (e.g. tonnes, metric tons)",
  "unit_financial": "String (e.g. USD, INR Crores)"
}}

HINTS: Company likely '{company_name_hint}', Year likely {year_hint}.

TEXT TO ANALYZE:
{chunk_text[:7000]}
"""
    try:
        res = requests.post(OLLAMA_URL, json={
            "model": "llama3.2",
            "prompt": prompt,
            "stream": False,
            "format": "json",
            "options": {"temperature": 0.0, "num_ctx": 8192}
        }, timeout=45)
        res.raise_for_status()
        return json.loads(res.json().get("response", "{}"))
    except Exception as e:
        print(f"    ⚠️ Ollama chunk failed: {e}")
        return {}

def normalize_value(val_str, unit_str, metric_type):
    """Layer 5: Deterministic Unit Normalization"""
    if val_str is None: return None
    try:
        # Strip commas and find first float
        val_clean = str(val_str).replace(",", "").strip()
        matches = re.findall(r"[-+]?\d*\.\d+|\d+", val_clean)
        if not matches: return None
        v = float(matches[0])
        
        u = str(unit_str).lower() if unit_str else ""
        
        # Textual multipliers in value string itself
        if "million" in val_clean.lower() or " mn " in val_clean.lower(): v *= 1_000_000
        if "billion" in val_clean.lower() or " bn " in val_clean.lower(): v *= 1_000_000_000
        if "crore" in val_clean.lower(): v *= 10_000_000
        if "lakh" in val_clean.lower(): v *= 100_000
        if "thousand" in val_clean.lower() or "000" in val_clean.lower(): v *= 1_000

        if metric_type == "emissions":
            if "kt" in u or "kilo" in u or "000 t" in u or "thousand" in u: v *= 1000
            elif "mt" in u or "mega" in u or "million" in u: v *= 1_000_000
            
        elif metric_type == "energy":
            if "pj" in u: v *= 1_000_000 # GJ base
            elif "tj" in u: v *= 1_000
            elif "twh" in u: v *= 3_600_000
            elif "gwh" in u: v *= 3_600
            elif "mwh" in u: v *= 3.6
            elif "kwh" in u: v *= 0.0036
            elif "mj" in u: v *= 0.001
            
        elif metric_type == "water":
            if "kl" in u or "m3" in u or "cubic meter" in u: v *= 0.001 # ML base
            elif "million m3" in u or "million cubic" in u: v *= 1000
            
        elif metric_type == "financial":
            if "crore" in u: v *= 10_000_000
            elif "lakh" in u: v *= 100_000
            elif "million" in u or " mn" in u: v *= 1_000_000
            elif "billion" in u or " bn" in u: v *= 1_000_000_000
            
        return round(v, 2)
    except:
        return None

def merge_extraction_results(chunk_results):
    """Layer 4: Multi-Chunk Median Aggregation"""
    merged = {}
    
    numeric_keys = ["scope_1", "scope_2", "scope_3", "energy_consumption", "water_withdrawal", "waste_generated", "revenue", "profit"]
    string_keys = ["company_name", "report_year", "unit_emissions", "unit_energy", "unit_water", "unit_waste", "unit_financial"]
    
    # Take first non-null for strings
    for k in string_keys:
        merged[k] = next((r.get(k) for r in chunk_results if r.get(k)), None)
        
    # Take median for numerics to reject outliers/hallucinations
    for k in numeric_keys:
        vals = []
        for r in chunk_results:
            v = r.get(k)
            if v is not None and str(v).strip() != "":
                try:
                    vals.append(float(str(v).replace(",", "")))
                except: pass
        if vals:
            merged[k] = statistics.median(vals)
        else:
            merged[k] = None
            
    return merged

def extract_from_pdf_full(pdf_path, filename):
    print(f"    Extracting Markdown via pymupdf4llm...")
    text = extract_markdown_with_pymupdf4llm(pdf_path)
    if not text:
        return None
        
    # Regex fallback for identity
    company_hint = re.sub(r'_sustainability_report.*\.pdf', '', filename).replace('_', ' ').title()
    year_match = re.search(r'\b(202[0-9])\b', filename)
    year_hint = year_match.group(1) if year_match else "2024"
    
    chunks = chunk_markdown(text)
    print(f"    Running Ollama on {len(chunks)} chunks...")
    
    chunk_results = []
    for i, chunk in enumerate(chunks):
        res = analyze_chunk_with_ollama(chunk, company_hint, year_hint)
        if res: chunk_results.append(res)
        
    merged = merge_extraction_results(chunk_results)
    
    # Normalization
    final_data = {
        "company_name": merged.get("company_name") or company_hint,
        "report_year": merged.get("report_year") or year_hint,
        "s1": normalize_value(merged.get("scope_1"), merged.get("unit_emissions"), "emissions"),
        "s2": normalize_value(merged.get("scope_2"), merged.get("unit_emissions"), "emissions"),
        "s3": normalize_value(merged.get("scope_3"), merged.get("unit_emissions"), "emissions"),
        "energy_consumption": normalize_value(merged.get("energy_consumption"), merged.get("unit_energy"), "energy"),
        "water_withdrawal": normalize_value(merged.get("water_withdrawal"), merged.get("unit_water"), "water"),
        "revenue": normalize_value(merged.get("revenue"), merged.get("unit_financial"), "financial"),
        "profit": normalize_value(merged.get("profit"), merged.get("unit_financial"), "financial")
    }
    
    # Layer 6: Validation Engine
    if final_data.get("s1") and final_data.get("s2"):
        final_data["co2"] = round(final_data["s1"] + final_data["s2"], 2)
    else:
        final_data["co2"] = None
        
    # Sanity checks
    if final_data.get("s1") and final_data["s1"] > 1e9: final_data["s1"] = None # Unit error likely
    if final_data.get("report_year"):
        try:
            yr = int(final_data["report_year"])
            if yr < 2018 or yr > 2026: final_data["report_year"] = year_hint
        except: final_data["report_year"] = year_hint
        
    return final_data

def save_to_db(data, filename):
    if not data or not data.get("company_name"):
        return False
        
    payload = data.copy()
    payload["name"] = payload.pop("company_name")
    payload["url"] = f"{INTERNAL_API_BASE}/downloaded_reports/{filename}"
    payload["sector"] = "Unknown"
    payload["country"] = "Unknown"
    
    try:
        res = requests.post(
            f"{API_BASE}/scout", 
            json=payload, 
            headers={"x-internal-key": INTERNAL_API_KEY},
            timeout=30
        )
        if res.status_code in (200, 201):
            return True
        else:
            print(f"    ❌ DB API returned {res.status_code}: {res.text}")
    except Exception as e:
        print(f"    ❌ DB connection error: {e}")
    return False

def main():
    sys.stdout.reconfigure(encoding='utf-8')
    print("=" * 60)
    print("  GreenOrb ESG Report Processor Active (v2 Ollama Mode)")
    print("=" * 60)
    
    if not os.path.exists(PROCESSED_LOG):
        open(PROCESSED_LOG, "w").close()

    while True:
        with open(PROCESSED_LOG, "r") as f:
            processed_set = set([line.strip() for line in f.readlines()])

        pdfs = glob.glob(os.path.join(RAW_DATA_DIR, "*.pdf"))
        new_pdfs = [p for p in pdfs if os.path.basename(p) not in processed_set]

        if new_pdfs:
            print(f"\nFound {len(new_pdfs)} new ESG reports to process.\n")
            
            for pdf in new_pdfs:
                filename = os.path.basename(pdf)
                print("-" * 60)
                print(f"📄 Processing: {filename}")
                
                extracted_data = extract_from_pdf_full(pdf, filename)
                
                if extracted_data:
                    print(f"    Company: {extracted_data.get('company_name')}")
                    print(f"    Year: {extracted_data.get('report_year')}")
                    print(f"    CO2: {extracted_data.get('co2')}")
                    print(f"    Scope 1: {extracted_data.get('s1')}")
                    print(f"    Scope 2: {extracted_data.get('s2')}")
                    print(f"    Revenue: {extracted_data.get('revenue')}")
                    
                    filled_keys = [k for k, v in extracted_data.items() if v is not None and str(v).strip() != ""]
                    print(f"    [Health Check] Extracted {len(filled_keys)} out of {len(extracted_data)} metrics.")
                    
                    if save_to_db(extracted_data, filename):
                        with open(PROCESSED_LOG, "a") as f:
                            f.write(filename + "\n")
                else:
                    print(f"    ⚠️ Failed to extract data.")
                
                time.sleep(2)
        else:
            pass

        time.sleep(10)

if __name__ == "__main__":
    main()
