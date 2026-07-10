"""
GreenOrb ESG Report Watcher
============================
Scans the `downloaded_reports/` directory for newly downloaded PDF reports.
Extracts the company name, report year, and ESG metrics explicitly without guessing.
Pushes the factual data into the Neon PostgreSQL database.
"""

import os
import re
import sys
import glob
import json
import time
import io
import requests
import random
import fitz  # PyMuPDF
import pytesseract
import pdfmux
from PIL import Image
from dotenv import load_dotenv

# Configure Tesseract OCR binary path for Windows
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

# Suppress harmless PyMuPDF graphics/syntax warnings
fitz.TOOLS.mupdf_display_errors(False)

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"), override=True)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY") or "AIzaSyD2IaDVX6JNm8QwW1fr_gXXIQ0C_-Kgt4s"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"
INTERNAL_API_BASE = os.environ.get('INTERNAL_API_BASE', 'http://localhost:5000')
INTERNAL_API_KEY = os.environ.get("INTERNAL_API_KEY", "")
API_BASE = f"{INTERNAL_API_BASE}/api"

RAW_DATA_DIR = os.path.join(os.path.dirname(__file__), "downloaded_reports")
PROCESSED_LOG = os.path.join(RAW_DATA_DIR, "processed.txt")

# Ensure directories exist
os.makedirs(RAW_DATA_DIR, exist_ok=True)

# ─── EXTRACTION LOGIC ────────────────────────────────────────────────────────

def run_page_ocr(page, index):
    """Render a page to image and run Tesseract OCR on it."""
    try:
        # Render page to 150 DPI image in-memory
        pix = page.get_pixmap(dpi=150)
        img_data = pix.tobytes("png")
        img = Image.open(io.BytesIO(img_data))
        
        print(f"      📷 OCR: Scanning page {index+1} image...")
        ocr_text = pytesseract.image_to_string(img)
        return ocr_text.strip()
    except Exception as ocr_err:
        print(f"      ⚠️ OCR failed on page {index+1}: {ocr_err}")
    return ""

def extract_text_from_pdf(pdf_path):
    """Extract ordered text layouts using pdfmux, falling back seamlessly to PyMuPDF/OCR if empty."""
    filename = os.path.basename(pdf_path)
    
    cat_financial = ["revenue", "profit", "net income", "finance", "ebitda", "pat", "turnover", "income statement", "financial summary"]
    cat_emissions = ["scope 1", "scope 2", "scope 3", "ghg", "co2", "emissions", "water", "electricity", "energy", "renewable", "consumption", "tco2e"]
    cat_operations = ["facilities", "services", "products", "production", "manufacturing", "lifecycle", "csr", "location", "employees", "headcount", "procurement"]
    noise_words = ["forward-looking statement", "safe harbor", "board of directors", "forward looking statement"]

    # ─── LAYER A: TRY HIGH-FIDELITY PDFMUX ENGINE FIRST ───
    try:
        print(f"    🧠 Invoking pdfmux structured layout analyzer for {filename}...")
        extracted_layout = pdfmux.extract_text(pdf_path)
        
        if extracted_layout and len(extracted_layout.strip()) > 300:
            seen_paragraphs = set()
            list_financial = []
            list_emissions = []
            list_operations = []
            
            segments = extracted_layout.split('\n\n')
            for segment in segments:
                para_clean = segment.strip()
                if not para_clean or len(para_clean) < 30 or para_clean in seen_paragraphs:
                    continue
                para_lower = para_clean.lower()
                if any(noise in para_lower for noise in noise_words):
                    continue
                
                matches_fin = any(kw in para_lower for kw in cat_financial)
                matches_ems = any(kw in para_lower for kw in cat_emissions)
                matches_ops = any(kw in para_lower for kw in cat_operations)
                if not (matches_fin or matches_ems or matches_ops):
                    continue
                
                digit_count = len(re.findall(r'\d', para_clean))
                if digit_count < 2 and not ("net zero" in para_lower or "carbon" in para_lower):
                    continue
                
                score = 0
                all_kws = cat_financial + cat_emissions + cat_operations
                for kw in all_kws:
                    if kw in para_lower:
                        score += 3
                
                if matches_ems and any(x in para_lower for x in ["total scope 1", "total scope 2", "tco2e", "ghg emissions"]):
                    score += 120  
                if matches_fin and any(x in para_lower for x in ["revenue from operations", "profit after tax", "net profit", "consolidated financial"]):
                    score += 100
                
                if digit_count > 0:
                    score = score * (1 + min(digit_count // 4, 4))
                
                entry = (score, para_clean)
                seen_paragraphs.add(para_clean)
                
                if matches_ems:
                    list_emissions.append(entry)
                elif matches_fin:
                    list_financial.append(entry)
                else:
                    list_operations.append(entry)
            
            list_financial.sort(key=lambda x: x[0], reverse=True)
            list_emissions.sort(key=lambda x: x[0], reverse=True)
            list_operations.sort(key=lambda x: x[0], reverse=True)
            
            cover_page_section = f"--- [COVER CONFIGURATION] ---\n{extracted_layout[:1500]}\n\n"
            financial_section = "".join([f"{p[1]}\n\n" for p in list_financial[:12]])
            emissions_section = "".join([f"{p[1]}\n\n" for p in list_emissions[:12]])
            operations_section = "".join([f"{p[1]}\n\n" for p in list_operations[:12]])
            
            extracted_text = (
                f"<cover_page>\n{cover_page_section}</cover_page>\n\n"
                f"<financials>\n{financial_section}</financials>\n\n"
                f"<emissions>\n{emissions_section}</emissions>\n\n"
                f"<operations>\n{operations_section}</operations>\n\n"
            )
            print(f"    🎯 pdfmux Budget Formatted: Fin: {len(list_financial[:12])} | Ems: {len(list_emissions[:12])} | Ops: {len(list_operations[:12])}")
            return extracted_text
            
        print(f"    ⚠️ pdfmux layout returned insufficient string volume. Routing to native fallback.")
    except Exception as mux_err:
        print(f"    ⚠️ pdfmux execution failed: {mux_err}. Invoking native extraction engines.")

    # ─── LAYER B: RESILIENT PYMUPDF & TESSERACT OCR FALLBACK ENGINE ───
    try:
        doc = fitz.open(pdf_path)
        if len(doc) == 0:
            print(f"    ⚠️ Warning: PDF file is empty or corrupted: {filename}")
            return ""
            
        sample_pages = min(20, len(doc))
        total_sample_chars = 0
        for i in range(sample_pages):
            total_sample_chars += len(doc[i].get_text().strip())
            
        avg_chars_per_page = total_sample_chars / sample_pages if sample_pages > 0 else 0
        is_scanned = avg_chars_per_page < 1500
        
        if is_scanned:
            print(f"    ℹ️ Fallback Core: Scanned PDF profile verified (Avg: {avg_chars_per_page:.1f}). OCR engine active.")
        else:
            print(f"    ℹ️ Fallback Core: High-Density Digital profile verified (Avg: {avg_chars_per_page:.1f}). Block engine active.")

        cover_page_text = doc[0].get_text("text").strip()
        if len(cover_page_text) < 100:
            cover_page_text = run_page_ocr(doc[0], 0)
            
        seen_paragraphs = set()
        list_financial = []
        list_emissions = []
        list_operations = []
        
        max_scan_pages = 50 if is_scanned else len(doc)
        pages_to_scan = min(max_scan_pages, len(doc))
        
        for i in range(1, pages_to_scan):
            page = doc[i]
            blocks = []
            
            page_text_len = len(page.get_text().strip())
            
            if is_scanned or page_text_len < 150:
                ocr_res = run_page_ocr(page, i)
                if ocr_res:
                    blocks = ocr_res.split('\n\n')
            else:
                text_blocks = page.get_text("blocks")
                for b in text_blocks:
                    if isinstance(b, (tuple, list)) and len(b) > 4:
                        txt = str(b[4]).strip()
                        if txt:
                            blocks.append(txt)

            table_markdowns = []
            try:
                tabs = page.find_tables()
                if hasattr(tabs, "tables") and tabs.tables:
                    for tab in tabs.tables:
                        try:
                            md = tab.to_markdown()
                            if md and md.strip():
                                table_markdowns.append(md.strip())
                        except:
                            pass
            except:
                pass
                
            all_segments = blocks + table_markdowns
            
            for para in all_segments:
                para_clean = para.strip()
                if not para_clean or len(para_clean) < 30 or para_clean in seen_paragraphs:
                    continue
                para_lower = para_clean.lower()
                if any(noise in para_lower for noise in noise_words):
                    continue
                
                matches_fin = any(kw in para_lower for kw in cat_financial)
                matches_ems = any(kw in para_lower for kw in cat_emissions)
                matches_ops = any(kw in para_lower for kw in cat_operations)
                if not (matches_fin or matches_ems or matches_ops):
                    continue
                
                digit_count = len(re.findall(r'\d', para_clean))
                if digit_count < 2 and not ("net zero" in para_lower or "carbon" in para_lower):
                    continue
                
                score = 0
                all_kws = cat_financial + cat_emissions + cat_operations
                for kw in all_kws:
                    if kw in para_lower:
                        score += 3
                
                if matches_ems and any(x in para_lower for x in ["total scope 1", "total scope 2", "tco2e", "ghg emissions"]):
                    score += 120  
                if matches_fin and any(x in para_lower for x in ["revenue from operations", "profit after tax", "net profit", "consolidated financial"]):
                    score += 100
                
                if digit_count > 0:
                    score = score * (1 + min(digit_count // 4, 4))
                
                entry = (score, para_clean)
                seen_paragraphs.add(para_clean) 
                
                if matches_ems:
                    list_emissions.append(entry)
                elif matches_fin:
                    list_financial.append(entry)
                else:
                    list_operations.append(entry)
                    
        list_financial.sort(key=lambda x: x[0], reverse=True)
        list_emissions.sort(key=lambda x: x[0], reverse=True)
        list_operations.sort(key=lambda x: x[0], reverse=True)
        
        cover_page_section = f"--- [COVER PAGE] ---\n{cover_page_text[:1500]}\n\n"
        financial_section = "".join([f"{p[1]}\n\n" for p in list_financial[:12]])
        emissions_section = "".join([f"{p[1]}\n\n" for p in list_emissions[:12]])
        operations_section = "".join([f"{p[1]}\n\n" for p in list_operations[:12]])
        
        extracted_text = (
            f"<cover_page>\n{cover_page_section}</cover_page>\n\n"
            f"<financials>\n{financial_section}</financials>\n\n"
            f"<emissions>\n{emissions_section}</emissions>\n\n"
            f"<operations>\n{operations_section}</operations>\n\n"
        )
        print(f"    🎯 Fallback Budget Delivered: Fin Chunks: {len(list_financial[:12])} | Ems Chunks: {len(list_emissions[:12])} | Ops Chunks: {len(list_operations[:12])}")
        doc.close()
        return extracted_text
        
    except Exception as fallback_err:
        print(f"    ❌ Fatal Failure: Both pdfmux and PyMuPDF fallback failed for {filename}: {fallback_err}")
        try:
            if 'doc' in locals() and doc:
                doc.close()
        except:
            pass
        return ""

def build_analyze_prompt(text):
    return (
        'You are a highly precise corporate data extraction AI. Read the following text extracted from an ESG or Sustainability report.\n'
        'Your job is to identify the company who published this report and pull exact factual figures.\n'
        'IMPORTANT RULES:\n'
        '1. DO NOT GUESS OR ESTIMATE ANY NUMBERS EXCEPT FOR LATITUDE/LONGITUDE IF NOT GIVEN. If a value is not explicitly stated in the text, return "Unknown" or null.\n'
        '2. Return ONLY a valid JSON object. No markdown formatting or explanations.\n\n'
        'Required JSON format:\n'
        '{\n'
        '  "company_name": "The explicitly stated name of the company publishing the report.",\n'
        '  "company_sector": "The industry sector of this company (e.g. Financial Services, Energy, Heavy Manufacturing, Technology, Healthcare, Mining, Automotive, Consumer Goods, Telecommunications, Real Estate, Utilities, Chemicals, Oil & Gas). Infer from context.",\n'
        '  "report_year": "The year this report covers (e.g., 2024 or 2025). Extract from title or introductory text. Return as an integer. If not found, return null.",\n'
        '  "co2_estimate": "The explicit, actual reported annual CO2 or GHG emissions in metric tons. Return as a number. If not explicitly found, return null.",\n'
        '  "co2_unit": "The unit of the CO2 figure (e.g. tCO2e, ktCO2e, MtCO2e). If not found, return null.",\n'
        '  "esg_grade": "Explicitly reported ESG grade/rating if stated. Otherwise return \\"Unknown\\"",\n'
        '  "products": "A comma-separated list of the company\'s main products or services based on the text.",\n'
        '  "net_zero_target": "The explicitly stated Net zero target year. If not stated, return \\"Unknown\\"",\n'
        '  "sustainability_summary": "One sentence summarizing their primary sustainability milestone mentioned in the text.",\n'
        '  "water_withdrawal": "Total water consumption/withdrawal in kL or cubic meters. Return as a number. If not found, return null.",\n'
        '  "water_unit": "The unit of the water figure (e.g. kL, m3, ML, cubic meters). If not found, return null.",\n'
        '  "energy_consumption": "Total electricity/energy consumption in MWh, GWh, or GJ. Return as a number. If not found, return null.",\n'
        '  "energy_unit": "The unit of the energy figure (e.g. MWh, GWh, GJ, TJ). If not found, return null.",\n'
        '  "supply_chain_budget": "Total budget or investment allocated to supply chain sustainability/Scope 3 in USD. Return as a number. If not found, return null.",\n'
        '  "revenue": "Total corporate revenue or sales reported for the year in USD or other currency. Return as a number. If not found, return null.",\n'
        '  "profit": "Total net income or profit (PAT) reported for the year. Return as a number. If not found, return null.",\n'
        '  "ebitda": "Total Adjusted EBITDA or EBITDA reported. Return as a number. If not found, return null.",\n'
        '  "local_procurement_pct": "Percentage of procurement spend spent on local suppliers. Return as a number (e.g., 35.0). If not found, return null.",\n'
        '  "employee_count": "Total number of employees or headcount engaged. Return as an integer. If not found, return null.",\n'
        '  "operational_capacity": "Total operational generation or production capacity. Return as a number (e.g. 17550.0). If not found, return null.",\n'
        '  "capacity_unit": "The unit of the operational capacity (e.g. \\"MW\\" or \\"MT\\"). If not found, return null.",\n'
        '  "facilities_list": "A list or text summary of the geographic locations of the company\'s facilities/operations.",\n'
        '  "services": "A description of the types of services the company provides.",\n'
        '  "production_volume": "The number or volume of products manufactured.",\n'
        '  "manufacturing_process": "A summary description of the company\'s manufacturing process.",\n'
        '  "manufacturing_co2": "CO2 emissions specifically produced during the manufacturing phase (Scope 1/2) in metric tons. Return as a number. If not found, return null.",\n'
        '  "lifecycle_co2": "A textual breakdown of CO2 produced during different stages of product manufacturing/lifecycle.",\n'
        '  "facilities": [\n'
        '    {\n'
        '      "facility_name": "Name/location of physical site (e.g. Mundra, Gujarat)",\n'
        '      "facility_type": "Type/category/technology of facility (e.g. Coastal Super-critical Coal Power Plant)",\n'
        '      "lat": "Approximate latitude coordinate (number) based on your geographic database if not explicitly stated.",\n'
        '      "lng": "Approximate longitude coordinate (number) based on your geographic database if not explicitly stated.",\n'
        '      "status": "OPERATIONAL"\n'
        '    }\n'
        '  ]\n'
        '}\n\n'
        'Report Text:\n'
        + text
    )

def parse_llm_json(result, filename):
    result_cleaned = result.strip()
    
    # Strip markdown code fences safely
    if result_cleaned.startswith("```json"):
        result_cleaned = result_cleaned[7:]
    elif result_cleaned.startswith("```"):
        result_cleaned = result_cleaned[3:]
    if result_cleaned.endswith("```"):
        result_cleaned = result_cleaned[:-3]
    result_cleaned = result_cleaned.strip()

    # Fast track standard valid JSON blocks
    try:
        return json.loads(result_cleaned)
    except json.JSONDecodeError:
        pass

    # SELF-HEALING LAYER: Fix trailing truncations or unclosed local model outputs
    # If the response doesn't end with '}' or ']', find where it breaks and heal it
    if not result_cleaned.endswith('}') and not result_cleaned.endswith(']'):
        # Find the absolute last valid key-value delimiter or comma separator
        last_good_index = max(result_cleaned.rfind(','), result_cleaned.rfind('"'), result_cleaned.rfind(':'))
        if last_good_index != -1:
            # Backtrack text up to the last relatively stable character position
            healed_text = result_cleaned[:last_good_index].strip()
            
            # Track bracket state to figure out what needs closing
            bracket_stack = []
            in_string = False
            escape_char = False
            
            for char in healed_text:
                if char == '"' and not escape_char:
                    in_string = not in_string
                elif not in_string:
                    if char in ('{', '['):
                        bracket_stack.append(char)
                    elif char in ('}', ']'):
                        if bracket_stack:
                            bracket_stack.pop()
                escape_char = (char == '\\' and not escape_char)

            # Close unclosed strings safely first
            if in_string:
                healed_text += '"'

            # Append missing structural closing tags in reverse order
            while bracket_stack:
                open_tag = bracket_stack.pop()
                if open_tag == '{':
                    healed_text += '}'
                elif open_tag == '[':
                    healed_text += ']'
            
            try:
                print(f"      🔧 Self-Healed truncated JSON layout for {filename} successfully.")
                return json.loads(healed_text)
            except:
                result_cleaned = healed_text # Fall back to regex if baseline healing fails

    # Fallback to structural balanced bracket extractor
    match = re.search(r'\{.*\}', result_cleaned, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except:
            pass
            
    print(f"    ❌ Critical: Failed to parse or self-heal JSON from AI for {filename}")
    print(f"    RAW SYSTEM RESPONSE: {result}")
    return {}

def isolate_keyword_windows(text, keywords, window_size=300):
    """Extract strict context windows around specific target metrics to reduce model noise."""
    text_clean = " ".join(text.split())
    text_lower = text_clean.lower()
    windows = []
    
    for kw in keywords:
        for match in re.finditer(re.escape(kw.lower()), text_lower):
            start = max(0, match.start() - window_size)
            end = min(len(text_clean), match.end() + window_size)
            windows.append(text_clean[start:end])
            
    # Remove duplicate overlapping matches and limit count to prevent context blowup
    unique_windows = []
    for w in windows:
        if not any(w in other for other in unique_windows):
            unique_windows.append(w)
            
    return "\n---\n".join(unique_windows[:5])

def analyze_with_regex_and_tables(pdf_path, text, filename):
    """Layer 1: Deterministic extraction layer using regex and pdfplumber grid-tables."""
    data = {
        "company_name": None,
        "report_year": None,
        "revenue": None,
        "profit": None,
        "esg_grade": None,
        "net_zero_target": None,
        "co2_estimate": None,
        "co2_unit": None,
        "s1": None,
        "s2": None,
        "s3": None,
        "water_withdrawal": None,
        "water_unit": None,
        "energy_consumption": None,
        "energy_unit": None,
        "facilities_list": None,
        "services": None,
        "products": None,
        "sustainability_summary": "Extracted via High-Precision Regex & Tables"
    }

    # Extract company name from filename
    name_match = re.match(r'^(.*?)_sustainability_report', filename)
    if name_match:
        data["company_name"] = name_match.group(1).replace("_", " ").title()

    # Extract year
    year_match = re.search(r'\b(202[0-9])\b', filename)
    if year_match:
        data["report_year"] = int(year_match.group(1))

    # Extract Net Zero Target year
    nz_match = re.search(r'(?i)net[\s-]?zero.*?(20[3-5][0-9])', text)
    if nz_match:
        try:
            data["net_zero_target"] = int(nz_match.group(1))
        except:
            pass

    # Scan tables via pdfplumber
    try:
        import pdfplumber
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text() or ""
                page_text_lower = page_text.lower()
                
                # Check for scopes or water/energy/financials
                if any(k in page_text_lower for k in ["scope 1", "scope 2", "scope 3", "emissions", "revenue", "profit", "water", "energy"]):
                    tables = page.extract_tables()
                    for table in tables:
                        if not table:
                            continue
                        cleaned_rows = [[str(cell).strip() for cell in row if cell] for row in table if any(row)]
                        for row in cleaned_rows:
                            row_str = " | ".join(row).lower()
                            
                            # Scope 1
                            if "scope 1" in row_str or "scope1" in row_str:
                                for cell in row:
                                    cell_clean = cell.replace(",", "").strip()
                                    num_match = re.search(r'^\b\d+(?:\.\d+)?\b$', cell_clean)
                                    if num_match:
                                        val = float(num_match.group())
                                        if val > 10 and not data["s1"]:
                                            data["s1"] = val
                            # Scope 2
                            if "scope 2" in row_str or "scope2" in row_str:
                                for cell in row:
                                    cell_clean = cell.replace(",", "").strip()
                                    num_match = re.search(r'^\b\d+(?:\.\d+)?\b$', cell_clean)
                                    if num_match:
                                        val = float(num_match.group())
                                        if val > 10 and not data["s2"]:
                                            data["s2"] = val
                            # Scope 3
                            if "scope 3" in row_str or "scope3" in row_str:
                                for cell in row:
                                    cell_clean = cell.replace(",", "").strip()
                                    num_match = re.search(r'^\b\d+(?:\.\d+)?\b$', cell_clean)
                                    if num_match:
                                        val = float(num_match.group())
                                        if val > 10 and not data["s3"]:
                                            data["s3"] = val
    except Exception as e:
        print(f"    ⚠️ pdfplumber table extraction failed: {e}")

    # Fallback to precise regex matching on clean text
    # Scope 1 Regex
    if not data["s1"]:
        s1_match = re.search(r'(?i)scope\s*1\s*(?:direct)?\s*(?:ghg)?\s*emissions?\s*(?:location-based|market-based)?\s*[:\-]?\s*([\d,]+(?:\.\d+)?)', text)
        if s1_match:
            try:
                data["s1"] = float(s1_match.group(1).replace(",", ""))
            except:
                pass

    # Scope 2 Regex
    if not data["s2"]:
        s2_match = re.search(r'(?i)scope\s*2\s*(?:indirect)?\s*(?:ghg)?\s*emissions?\s*(?:location-based|market-based)?\s*[:\-]?\s*([\d,]+(?:\.\d+)?)', text)
        if s2_match:
            try:
                data["s2"] = float(s2_match.group(1).replace(",", ""))
            except:
                pass

    # Scope 3 Regex
    if not data["s3"]:
        s3_match = re.search(r'(?i)scope\s*3\s*(?:other\s*indirect)?\s*(?:ghg)?\s*emissions?\s*[:\-]?\s*([\d,]+(?:\.\d+)?)', text)
        if s3_match:
            try:
                data["s3"] = float(s3_match.group(1).replace(",", ""))
            except:
                pass

    # Derive CO2 estimate from Scope 1 and Scope 2
    if data["s1"] or data["s2"]:
        s1_val = data["s1"] or 0.0
        s2_val = data["s2"] or 0.0
        data["co2_estimate"] = s1_val + s2_val

    # Revenue Regex
    rev_match = re.search(r'(?i)revenue.*?\$?([\d,]+\.?\d*)\s*(million|billion|crore)?', text)
    if rev_match:
        try:
            val = float(rev_match.group(1).replace(',', ''))
            mult = rev_match.group(2)
            if mult:
                mult_lower = mult.lower()
                if 'billion' in mult_lower: val *= 1000000000.0
                elif 'million' in mult_lower: val *= 1000000.0
                elif 'crore' in mult_lower: val *= 10000000.0
            data["revenue"] = val
        except:
            pass

    # Profit Regex
    prof_match = re.search(r'(?i)profit.*?\$?([\d,]+\.?\d*)\s*(million|billion|crore)?', text)
    if prof_match:
        try:
            val = float(prof_match.group(1).replace(',', ''))
            mult = prof_match.group(2)
            if mult:
                mult_lower = mult.lower()
                if 'billion' in mult_lower: val *= 1000000000.0
                elif 'million' in mult_lower: val *= 1000000.0
                elif 'crore' in mult_lower: val *= 10000000.0
            data["profit"] = val
        except:
            pass

    return data

def analyze_with_ollama(text, filename):
    """Use Local Ollama with an intelligent sliding-window strategy to extract data safely."""
    print(f"    ⚠️ Falling back to Local Ollama (llama3.2) for {filename}...")
    
    # Clean up the raw text to save space
    text_clean = re.sub(r'\n+', '\n', text).strip()
    total_length = len(text_clean)

    # FIX: Smart text distribution based on targeted context isolation windows
    cover = text_clean[:5000]
    
    financials_kws = ["revenue", "profit", "net income", "ebitda", "pat", "turnover", "financial summary"]
    financials = isolate_keyword_windows(text_clean, financials_kws, 400)
    if not financials.strip():
        financials = text_clean[5000:25000] if total_length > 25000 else text_clean[5000:]
        
    emissions_kws = ["scope 1", "scope 2", "scope 3", "ghg", "co2", "emissions", "water", "electricity", "energy", "consumption", "tco2e"]
    emissions = isolate_keyword_windows(text_clean, emissions_kws, 400)
    if not emissions.strip():
        emissions = text_clean[-30000:-5000] if total_length > 35000 else text_clean
        
    operations_kws = ["facilities", "services", "products", "manufacturing", "lifecycle", "csr", "location", "employees", "headcount", "procurement"]
    operations = isolate_keyword_windows(text_clean, operations_kws, 400)
    if not operations.strip():
        operations = text_clean[15000:45000] if total_length > 45000 else text_clean

    def run_pass(pass_num, prompt_template):
        # FIX: Expand context to 8192 so Llama 3 can actually read the data tables
        body = {
            "model": "llama3.2",
            "prompt": prompt_template,
            "stream": False,
            "format": "json",
            "options": {
                "temperature": 0.0,  # Dropped to 0.0 for deterministic factual extraction
                "repeat_penalty": 1.1,
                "num_ctx": 8192,  # Crucial for Llama 3 processing complex PDF segments
                "num_predict": 2048  # Prevent early truncation of JSON payload
            }
        }
        try:
            response = requests.post("http://localhost:11434/api/generate", json=body, timeout=300)
            if response.status_code == 200:
                result = response.json().get("response", "")
                parsed = parse_llm_json(result, filename)
                return parsed if isinstance(parsed, dict) else {}
            else:
                print(f"      ❌ Pass {pass_num} returned status code {response.status_code}")
        except Exception as e:
            print(f"      ❌ Pass {pass_num} Request error: {e}")
        return {}

    prompt_1 = (
        "You are an expert ESG Data Analyst. Read the provided text and extract ONLY the requested keys into a flat JSON object.\n"
        "IMPORTANT: If a metric is not explicitly present in the text, you MUST return null. Do not include template sentences, instructions, or fallback values.\n"
        "Treat Markdown tables as the primary source of truth for numeric values.\n\n"
        "JSON Format:\n"
        "{\n"
        '  "company_name": null,\n'
        '  "company_sector": null,\n'
        '  "report_year": null,\n'
        '  "revenue": null,\n'
        '  "profit": null,\n'
        '  "esg_grade": null,\n'
        '  "net_zero_target": null\n'
        "}\n\n"
        f"Text:\n{cover}\n\n{financials}"
    )

    prompt_2 = (
        "You are an expert ESG Data Analyst specializing in extracting carbon emissions metrics. "
        "Read the text and extract ONLY the requested keys into a flat JSON object. Return clean numbers as float/int numbers (no commas, no text suffixes).\n"
        "IMPORTANT: If a specific metric is not mentioned in the text, you MUST return null. Do not include template sentences, instructions, or fallback values.\n\n"
        "JSON Format:\n"
        "{\n"
        '  "co2_estimate": null,\n'
        '  "co2_unit": null,\n'
        '  "scope_1": null,\n'
        '  "scope_2": null,\n'
        '  "scope_3": null,\n'
        '  "water_withdrawal": null,\n'
        '  "water_unit": null,\n'
        '  "energy_consumption": null,\n'
        '  "energy_unit": null\n'
        "}\n\n"
        f"Text:\n{emissions}"
    )

    prompt_3 = (
        "You are an expert ESG Data Analyst. Read the provided text and extract ONLY the requested keys into a flat JSON object.\n"
        "IMPORTANT: If a metric is not present, you MUST return null. Do not include template sentences, instructions, or fallback values.\n\n"
        "JSON Format:\n"
        "{\n"
        '  "facilities_list": null,\n'
        '  "services": null,\n'
        '  "products": null,\n'
        '  "production_volume": null,\n'
        '  "manufacturing_process": null,\n'
        '  "manufacturing_co2": null,\n'
        '  "lifecycle_co2": null,\n'
        '  "sustainability_summary": null,\n'
        '  "ebitda": null,\n'
        '  "local_procurement_pct": null,\n'
        '  "employee_count": null\n'
        "}\n\n"
        f"Text:\n{operations}"
    )

    # Execute the three passes sequentially
    print("      👉 Pass 1: Extracting Identity & Financials...")
    res_1 = run_pass(1, prompt_1)
    
    print("      👉 Pass 2: Extracting Emissions & Resources...")
    res_2 = run_pass(2, prompt_2)
    
    print("      👉 Pass 3: Extracting Operations & Services...")
    res_3 = run_pass(3, prompt_3)

    # Merge everything together cleanly into one unified output payload
    merged = {**res_1, **res_2, **res_3}
    
    # Normalize scope key names
    if "scope_1" in merged: merged["s1"] = merged.pop("scope_1")
    if "scope_2" in merged: merged["s2"] = merged.pop("scope_2")
    if "scope_3" in merged: merged["s3"] = merged.pop("scope_3")
    
    # ─── Hybrid Regex Fallback Engine ───
    clean_text = re.sub(r'\s+', ' ', text)
    
    if not merged.get("company_name") or merged.get("company_name") == "Unknown":
        name_match = re.match(r'^([a-z0-9_.-]+?)(?:_sustainability|_report|\.pdf)', filename, re.IGNORECASE)
        if name_match:
            merged["company_name"] = name_match.group(1).replace('_', ' ').replace('.', ' ').strip().title()
            
    if not merged.get("report_year"):
        year_match = re.search(r'(?:20\d{2})', filename)
        if year_match:
            merged["report_year"] = int(year_match.group(0))
            
    if not merged.get("revenue"):
        rev_match = re.search(r'revenue\s+(?:(?:of\s+)?(?:rs\.?\s*)?crores?\s+)?(?:\(rs\.?\s*crore(?:s)?\)\s*)?([\d,.]+)', clean_text, re.IGNORECASE)
        if rev_match:
            try:
                merged["revenue"] = float(rev_match.group(1).replace(',', ''))
            except:
                pass
                
    if not merged.get("profit"):
        pat_match = re.search(r'profit\s+after\s+tax\s*(?:\(rs\.?\s*crore(?:s)?\)\s*)?([\d,.]+)', clean_text, re.IGNORECASE)
        if pat_match:
            try:
                merged["profit"] = float(pat_match.group(1).replace(',', ''))
            except:
                pass

    if not merged.get("employee_count"):
        emp_match = re.search(r'total\s+employees\s*(?:\(permanent\))?\s*([\d,.]+)', clean_text, re.IGNORECASE)
        if emp_match:
            try:
                merged["employee_count"] = int(emp_match.group(1).replace(',', ''))
            except:
                pass
                
    return merged

def execute_rest_api_call(url, headers=None, json_payload=None, timeout=60):
    """Executes a raw HTTP POST call with robust exponential backoff for 429 rate limits."""
    max_attempts = 4
    base_delay = 15  # Progressive delay scale factor
    
    for attempt in range(max_attempts):
        try:
            res = requests.post(url, headers=headers, json=json_payload, timeout=timeout)
            
            # Handle rate limit explicitly before reading payload
            if res.status_code == 429:
                delay = (base_delay * (2 ** attempt)) + random.uniform(1, 5)
                print(f"      ⚠️ HTTP 429 (Rate Limit). Backing off for {delay:.1f}s (Attempt {attempt+1}/{max_attempts})...")
                time.sleep(delay)
                continue
                
            # Let standard HTTP errors (like 401, 500, etc.) break out cleanly
            res.raise_for_status()
            return res.json()
            
        except requests.exceptions.RequestException as req_err:
            # Catch timeouts or socket dropouts and retry them too
            print(f"      ⚠️ Request issue on attempt {attempt+1}: {req_err}")
            delay = (base_delay * (2 ** attempt)) + random.uniform(1, 3)
            time.sleep(delay)
            
    print("    ❌ All cloud API retry attempts exhausted.")
    return None

def analyze_with_groq(text, filename):
    """Use Groq Cloud API (Llama 3.3 70B / 3.1 8B) as fallback, retrying on 429 rate limits."""
    groq_key = os.environ.get("GROQ_API_KEY")
    if not groq_key:
        return None

    print(f"    ⚡ Gemini rate-limited or consensusing. Querying Groq Cloud API for {filename}...")
    prompt = build_analyze_prompt(text)
    
    headers = {
        "Authorization": f"Bearer {groq_key}",
        "Content-Type": "application/json"
    }
    
    body = {
        "model": "llama-3.3-70b-versatile",
        "messages": [
            {"role": "system", "content": "You are a precise corporate ESG data extraction assistant. Return ONLY valid JSON matching the schema precisely."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.0,
        "response_format": {"type": "json_object"}
    }
    
    # Try Llama 3.3 70B first
    groq_data = execute_rest_api_call("https://api.groq.com/openai/v1/chat/completions", headers=headers, json_payload=body, timeout=60)
    if groq_data:
        try:
            result = groq_data.get("choices", [{}])[0].get("message", {}).get("content", "")
            return parse_llm_json(result, filename)
        except Exception as e:
            print(f"      ⚠️ Failed to parse Groq 70B payload: {e}")
            
    # Try lightweight Llama 3.1 8B as secondary
    print("      ⚠️ Groq 70B unavailable. Trying Groq 8B fallback...")
    body["model"] = "llama-3.1-8b-instant"
    groq_data_8b = execute_rest_api_call("https://api.groq.com/openai/v1/chat/completions", headers=headers, json_payload=body, timeout=60)
    if groq_data_8b:
        try:
            result = groq_data_8b.get("choices", [{}])[0].get("message", {}).get("content", "")
            return parse_llm_json(result, filename)
        except Exception:
            pass
            
    return None

def run_gemini_extraction_direct(text, filename):
    """Direct query to Gemini 2.0 Flash without fallback, retrying on 429 rate limits."""
    prompt = build_analyze_prompt(text)
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.0, "maxOutputTokens": 2048}
    }
    
    gemini_data = execute_rest_api_call(GEMINI_URL, json_payload=body, timeout=120)
    if gemini_data:
        try:
            result = gemini_data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            return parse_llm_json(result, filename)
        except Exception as e:
            print(f"      ⚠️ Failed to parse Gemini payload: {e}")
    return None

def run_dual_extraction_consensus(text, filename):
    """Run both Gemini and Groq side-by-side, log conflicts, and resolve using a consensus engine."""
    print("    🔬 Running Dual-Model Consensus Extraction...")
    
    # 1. Run both models
    gemini_res = run_gemini_extraction_direct(text, filename)
    groq_res = analyze_with_groq(text, filename)
    
    if not gemini_res and not groq_res:
        print("    ❌ Both Gemini and Groq failed. Falling back to local Ollama...")
        return analyze_with_ollama(text, filename)
        
    if gemini_res and not groq_res:
        print("    ⚠️ Groq failed. Using Gemini extraction.")
        return gemini_res
        
    if groq_res and not gemini_res:
        print("    ⚠️ Gemini failed. Using Groq extraction.")
        return groq_res
        
    # 2. Both succeeded! Compare values and build a consensus payload
    print("    ✅ Both models responded. Evaluating consensus...")
    consensus = {}
    mismatch_log_path = os.path.join(RAW_DATA_DIR, "mismatch_logs.json")
    
    # Merge keys using consensus rules
    keys = list(set(list(gemini_res.keys()) + list(groq_res.keys())))
    mismatched_keys = {}
    
    # Standard keys to evaluate for conflicts
    conflict_keys = [
        "report_year", "revenue", "profit", "ebitda", "employee_count", 
        "co2_estimate", "scope_1", "scope_2", "scope_3"
    ]
    
    for key in keys:
        val_gem = gemini_res.get(key)
        val_groq = groq_res.get(key)
        
        # If they match, use the value
        if val_gem == val_groq:
            consensus[key] = val_gem
        elif key not in conflict_keys:
            # For descriptive strings/arrays, prefer Gemini's detail
            consensus[key] = val_gem if val_gem is not None else val_groq
        else:
            # Conflict detected!
            mismatched_keys[key] = {"gemini": val_gem, "groq": val_groq}
            
            # Resolve conflict using Hybrid Regex Fallback matches
            # We run the regex parser on the text for this key if available
            regex_resolved = False
            clean_text = re.sub(r'\s+', ' ', text)
            
            if key == "revenue":
                rev_match = re.search(r'revenue\s+(?:(?:of\s+)?(?:rs\.?\s*)?crores?\s+)?(?:\(rs\.?\s*crore(?:s)?\)\s*)?([\d,.]+)', clean_text, re.IGNORECASE)
                if rev_match:
                    try:
                        regex_val = float(rev_match.group(1).replace(',', ''))
                        if val_gem == regex_val:
                            consensus[key] = val_gem
                            regex_resolved = True
                        elif val_groq == regex_val:
                            consensus[key] = val_groq
                            regex_resolved = True
                    except:
                        pass
            elif key == "profit":
                pat_match = re.search(r'profit\s+after\s+tax\s*(?:\(rs\.?\s*crore(?:s)?\)\s*)?([\d,.]+)', clean_text, re.IGNORECASE)
                if pat_match:
                    try:
                        regex_val = float(pat_match.group(1).replace(',', ''))
                        if val_gem == regex_val:
                            consensus[key] = val_gem
                            regex_resolved = True
                        elif val_groq == regex_val:
                            consensus[key] = val_groq
                            regex_resolved = True
                    except:
                        pass
            elif key == "employee_count":
                emp_match = re.search(r'total\s+employees\s*(?:\(permanent\))?\s*([\d,.]+)', clean_text, re.IGNORECASE)
                if emp_match:
                    try:
                        regex_val = int(emp_match.group(1).replace(',', ''))
                        if val_gem == regex_val:
                            consensus[key] = val_gem
                            regex_resolved = True
                        elif val_groq == regex_val:
                            consensus[key] = val_groq
                            regex_resolved = True
                    except:
                        pass
            
            # Fallback if regex did not resolve the mismatch: prefer Gemini
            if not regex_resolved:
                consensus[key] = val_gem if val_gem is not None else val_groq
                
    # 3. Log conflicts to mismatch_logs.json for "fine-tuning" and prompt updates
    if mismatched_keys:
        print(f"    🔍 Mismatches detected on keys: {list(mismatched_keys.keys())}. Logging conflict.")
        log_entry = {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "filename": filename,
            "company_name": consensus.get("company_name"),
            "mismatches": mismatched_keys
        }
        
        # Read existing mismatch logs
        existing_logs = []
        if os.path.exists(mismatch_log_path):
            try:
                with open(mismatch_log_path, "r") as f:
                    content = f.read().strip()
                    if content:
                        existing_logs = json.loads(content)
            except:
                pass
                
        existing_logs.append(log_entry)
        
        # Write back updated logs
        try:
            with open(mismatch_log_path, "w") as f:
                json.dump(existing_logs, f, indent=2)
        except Exception as e:
            print(f"      ⚠️ Failed to write mismatch log: {e}")
            
    # Remap scope keys to db schema
    if "scope_1" in consensus: consensus["s1"] = consensus["scope_1"]
    if "scope_2" in consensus: consensus["s2"] = consensus["scope_2"]
    if "scope_3" in consensus: consensus["s3"] = consensus["scope_3"]
    
    return consensus

def analyze_with_llama(text, filename):
    """Run dual extraction consensus by default to ensure 100% accuracy."""
    return run_dual_extraction_consensus(text, filename)

def save_to_db(data, filename):
    """Save the extracted ESG data to the GreenOrb backend with safety mappings."""
    if not data or not isinstance(data, dict):
        print(f"    ⚠️ Invalid data dictionary passed for {filename}. Skipping DB save.")
        return False

    company_name = data.get("company_name")
    if not company_name or company_name == "Unknown":
        print(f"    ⚠️ Could not identify company name from {filename}. Skipping DB save.")
        return False

    def clean_numeric_field(val, unit_val=None):
        if val is None:
            return None
        if isinstance(val, (int, float)):
            num_val = float(val)
        else:
            s = str(val).strip()
            if not s or s.lower() in ("null", "none", "unknown", "n/a", "na", "-"):
                return None
                
            multiplier = 1.0
            s_lower = s.lower()
            if "billion" in s_lower:
                multiplier = 1000000000.0
            elif "million" in s_lower:
                multiplier = 1000000.0
            elif "crore" in s_lower:
                multiplier = 10000000.0
            elif "lakh" in s_lower:
                multiplier = 100000.0
                
            # FIX: Strip formatting commas out globally first so numbers don't get truncated!
            s_uncommad = s.replace(",", "")
            
            # Isolate only the first valid decimal chunk to ignore parentheses or years
            numeric_match = re.search(r'[-+]?\d*\.\d+|\d+', s_uncommad)
            if not numeric_match:
                return None
                
            s_clean = numeric_match.group()
            try:
                num_val = float(s_clean) * multiplier
            except:
                return None

        # Unit Normalization Layer
        if unit_val and isinstance(unit_val, str):
            unit_clean = unit_val.strip().lower()
            # Verify unit string isn't an instruction description template
            if len(unit_clean) < 15:
                # CO2 Normalization to standard Metric Tonnes (tCO2e)
                if any(k in unit_clean for k in ["ktco2e", "kt", "kilo-tonne", "thousand"]):
                    num_val *= 1000.0
                elif any(m in unit_clean for m in ["mtco2e", "mt", "million tonne"]):
                    num_val *= 1000000.0
                # Energy Normalization to standard MWh
                elif unit_clean == "gj":
                    num_val /= 3.6  # 1 MWh = 3.6 GJ
                elif unit_clean == "tj":
                    num_val = (num_val * 1000.0) / 3.6  # 1 TJ = 1000 GJ
                elif unit_clean == "gwh":
                    num_val *= 1000.0  # 1 GWh = 1000 MWh
                # Water Normalization to standard cubic meters (m3) / kL
                elif any(w in unit_clean for w in ["ml", "million liter", "megaliter"]):
                    num_val *= 1000.0  # 1 ML = 1000 kL / m3

        return num_val

    # Clean CO2 data to ensure it's a number
    co2_val = clean_numeric_field(data.get("co2_estimate"), data.get("co2_unit"))
            
    # Clean report year to ensure integer
    report_year = None
    if data.get("report_year"):
        try:
            year_match = re.search(r'\d{4}', str(data["report_year"]))
            report_year = int(year_match.group()) if year_match else None
        except:
            report_year = None

    static_url = f"{INTERNAL_API_BASE}/downloaded_reports/{filename}"

    # FIX BUG A: Map from both LLM key formats (scope_1 and s1) for safety
    payload = {
        "name": company_name,
        "sector": data.get("company_sector", "Unknown"),
        "country": "Unknown",
        "co2": co2_val,
        "esg": data.get("esg_grade", "Unknown"),
        "url": static_url,
        "products": data.get("products", "Unknown"),
        "methodology": data.get("sustainability_summary", "Extracted from explicit ESG Report"),
        "s1": clean_numeric_field(data.get("scope_1") or data.get("s1"), data.get("co2_unit")),
        "s2": clean_numeric_field(data.get("scope_2") or data.get("s2"), data.get("co2_unit")),
        "s3": clean_numeric_field(data.get("scope_3") or data.get("s3"), data.get("co2_unit")),
        "report_year": report_year,
        "water_withdrawal": clean_numeric_field(data.get("water_withdrawal"), data.get("water_unit")),
        "energy_consumption": clean_numeric_field(data.get("energy_consumption"), data.get("energy_unit")),
        "supply_chain_budget": clean_numeric_field(data.get("supply_chain_budget")),
        "revenue": clean_numeric_field(data.get("revenue")),
        "profit": clean_numeric_field(data.get("profit")),
        "facilities_list": data.get("facilities_list"),
        "services": data.get("services"),
        "production_volume": str(data.get("production_volume")) if data.get("production_volume") is not None else None,
        "manufacturing_process": data.get("manufacturing_process"),
        "manufacturing_co2": clean_numeric_field(data.get("manufacturing_co2")),
        "lifecycle_co2": clean_numeric_field(data.get("lifecycle_co2")),
        "ebitda": clean_numeric_field(data.get("ebitda")),
        "local_procurement_pct": clean_numeric_field(data.get("local_procurement_pct")),
        "employee_count": clean_numeric_field(data.get("employee_count")),
        "operational_capacity": clean_numeric_field(data.get("operational_capacity")),
        "capacity_unit": data.get("capacity_unit"),
        "facilities": data.get("facilities", [])
    }

    try:
        headers = {"x-internal-key": INTERNAL_API_KEY} if INTERNAL_API_KEY else {}
        res = requests.post(f"{API_BASE}/scout", json=payload, headers=headers, timeout=30)
        if res.status_code == 200:
             print(f"    ✅ Saved {company_name} (Year: {report_year}) to DB!")
             return True
        else:
             print(f"    ❌ DB API returned {res.status_code} for {company_name}: {res.text}")
    except Exception as e:
         print(f"    ❌ DB connection error for {company_name}: {e}")

    return False

# ─── MAIN WATCHER LOOP ───────────────────────────────────────────────────────

def main():
    sys.stdout.reconfigure(encoding='utf-8')
    print("=" * 60)
    print("  GreenOrb ESG Report Processor Active (Continuous Mode)")
    print(f"  Watching directory: {RAW_DATA_DIR}")
    print("=" * 60)
    
    # Touch the log file if it doesn't exist
    if not os.path.exists(PROCESSED_LOG):
        open(PROCESSED_LOG, "w").close()

    while True:
        # Load already processed files
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
                
                # 1. Extract text
                print(f"    Extracting text from PDF...")
                text = extract_text_from_pdf(pdf)
                

                if not text or not text.strip():
                    print(f"    ⚠️ Could not extract any text from {filename}. Skipping.")
                    continue
                    
                print(f"    Extracted {len(text)} characters.")
                
                # 2. Layer 1: Attempt Deterministic/Regex & Table Extraction
                print(f"    🔬 Running Layer 1: Deterministic Regex & Table parsing...")
                deterministic_data = analyze_with_regex_and_tables(pdf, text, filename)
                
                # Check if we have successfully extracted the critical metrics
                has_scopes = deterministic_data.get("s1") is not None or deterministic_data.get("s2") is not None
                has_financials = deterministic_data.get("revenue") is not None or deterministic_data.get("profit") is not None
                
                # 3. Layer 2: LLM Fallback (Only run on missing metrics!)
                if not (has_scopes and has_financials) or deterministic_data.get("report_year") is None:
                    print(f"    ⚠️ Missing critical metrics. Triggering Layer 2: Local LLM Fallback (llama3.2)...")
                    extracted_data = analyze_with_ollama(text, filename)
                    print("🔍 DEBUG RAW LLM DICT:", json.dumps(extracted_data, indent=2))
                    
                    # Merge LLM output into the deterministic output, keeping high-confidence regex/table values first!
                    for k, v in extracted_data.items():
                        if deterministic_data.get(k) is None and v is not None and v != "":
                            deterministic_data[k] = v
                else:
                    print(f"    ✅ All critical metrics resolved deterministically. Skipping LLM fallback!")
                    
                extracted_data = deterministic_data
                
                if extracted_data:
                    print(f"    Company: {extracted_data.get('company_name')}")
                    print(f"    Year: {extracted_data.get('report_year')}")
                    print(f"    CO2: {extracted_data.get('co2_estimate')}")
                    print(f"    ESG Grade: {extracted_data.get('esg_grade')}")
                    
                    # Health Check: Count how many values are non-null
                    filled_keys = [k for k, v in extracted_data.items() if v is not None and v != ""]
                    print(f"    [Health Check] Extracted {len(filled_keys)} out of {len(extracted_data)} metrics.")
                    
                    if len(filled_keys) <= 1:
                        print(f"    ⚠️ Critical Alert: Output is nearly empty for {filename}. Checking logic fallback.")
                    
                    # 4. Save to DB
                    success = save_to_db(extracted_data, filename)
                    if success:
                        with open(PROCESSED_LOG, "a") as f:
                            f.write(filename + "\n")
                else:
                    print(f"    ⚠️ Skipping marking as processed due to AI failure.")
                
                time.sleep(2) # Small pause to respect AI rate limits
                
        else:
            # Silent wait when nothing is found
            pass

        # Wait 30 seconds before checking again
        time.sleep(30)

if __name__ == "__main__":
    main()
