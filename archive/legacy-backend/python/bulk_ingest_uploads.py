import os
import re
import json
import shutil
import requests
import fitz
from esg_discovery_agent import (
    process_single_pdf, 
    RAW_DATA_DIR, 
    PROCESSED_DIR, 
    OLLAMA_URL,
    extract_text_from_pdf
)

# Folder containing the raw user uploads
UPLOADS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "RawData")

def extract_naming_info(text, filename):
    """Ask Llama 3.2 specifically for the naming components: Company, Report Type, Year."""
    prompt = (
        f"Analyze the following text from a PDF file named '{filename}'.\n"
        "Identify the following three pieces of information for renaming the file:\n"
        "1. Company Name (Full official name)\n"
        "2. Report Type (e.g., Sustainability Report, ESG Report, Annual Report, Environmental Progress Report)\n"
        "3. Year (The year the report covers, e.g., 2024 or 2025)\n\n"
        "Return ONLY a JSON object with keys: 'company', 'type', 'year'.\n"
        "If unsure about 'type', use 'ESG Report'. If unsure about 'year', use '2025'.\n\n"
        "Text Sample:\n" + text[:5000]
    )
    
    body = {
        "model": "llama3.2",
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.0}
    }
    
    try:
        res = requests.post(OLLAMA_URL, json=body, timeout=60)
        if res.status_code == 200:
            result = res.json().get("response", "").strip()
            # Clean markdown
            result = re.sub(r'```json\n?|\n?```', '', result)
            return json.loads(result)
    except Exception as e:
        print(f"    ❌ Naming extraction error: {e}")
    return None

def main():
    print("="*60)
    print("  🚀 GreenOrb Bulk Ingest & Rename Utility")
    print("="*60)
    
    # 1. List all PDFs in RawData (not in subfolders)
    pdf_files = [f for f in os.listdir(UPLOADS_DIR) if f.lower().endswith(".pdf")]
    
    if not pdf_files:
        print("    📭 No new PDFs found in RawData folder.")
        return

    print(f"    📂 Found {len(pdf_files)} PDFs to process.\n")

    for f in pdf_files:
        filepath = os.path.join(UPLOADS_DIR, f)
        print(f"▶️ Processing: {f}")
        
        try:
            # 2. Extract text for naming (first few pages)
            text = extract_text_from_pdf(filepath, max_pages=5)
            
            # 3. Get naming components
            info = extract_naming_info(text, f)
            
            if info and info.get("company") and info.get("company") != "Unknown":
                company = info.get("company").replace("/", "-").replace("\\", "-")
                rep_type = info.get("type", "ESG Report").replace("/", "-").replace("\\", "-")
                year = info.get("year", "2025")
                new_filename = f"{company} - {rep_type} - {year}.pdf"
            else:
                # Fallback: Use original name but ensure it's in the right folder for processing
                print(f"    ⚠️ Could not determine precise name from first 5 pages. Proceeding with original name...")
                new_filename = f
            
            new_filename = re.sub(r'[<>:"/\\|?*]', '', new_filename) # Final safety scrub
            new_path = os.path.join(RAW_DATA_DIR, new_filename)
            
            # Copy to the ingestion folder
            if not os.path.exists(new_path):
                shutil.copy2(filepath, new_path)
            
            # 5. Trigger full processing (ESG Extraction [30 pages] + RAG Indexing + Move to Processed)
            print(f"    ⚙️ Triggering full ESG pipeline (Context analysis + RAG)...")
            success = process_single_pdf(new_path)
            
            if success:
                print(f"    ✅ Successfully ingested {new_filename}")
                # 6. Cleanup original file from uploads
                if os.path.exists(filepath):
                    os.remove(filepath)
            else:
                print(f"    ❌ Failed to process {new_filename}. Moving to Processed/Failed for review.")
                # We move it to Processed even if it fails extraction, so it shows up in reports
                # but we'll flag it as failed.
                failed_folder = os.path.join(PROCESSED_DIR, "Failed")
                os.makedirs(failed_folder, exist_ok=True)
                if os.path.exists(new_path):
                    shutil.move(new_path, os.path.join(failed_folder, os.path.basename(new_path)))

        except Exception as e:
            print(f"    ❌ Error processing {f}: {e}")

    print("\n" + "="*60)
    print("  🏁 Bulk Ingestion Complete")
    print("="*60)

if __name__ == "__main__":
    main()
