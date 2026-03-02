import os
import glob
import json
import time
import requests
import fitz  # PyMuPDF

OLLAMA_URL = "http://localhost:11434/api/generate"
API_URL = "http://localhost:5000/api/scout"
RAW_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "RawData")

PROMPT = """You are a highly precise data extraction AI. Read the following text and extract ANY companies mentioned along with their sector, country, and main products/services/focus.
Return ONLY a valid JSON array of objects. Do not wrap it in markdown. If no companies are found, return an empty array [].
Format:
[
  {
    "name": "Company Name",
    "sector": "Sector (e.g. Technology, Energy)",
    "country": "Country (if mentioned)",
    "products": "Brief summary of products/services"
  }
]

Text:
"""

def extract_text_from_pdf(filepath):
    print(f"📄 Processing {os.path.basename(filepath)}...")
    doc = fitz.open(filepath)
    text = ""
    for page in doc:
        text += page.get_text()
    return text

def chunk_text(text, chunk_size=3000):
    words = text.split()
    chunks = []
    current_chunk = []
    current_len = 0
    for word in words:
        if current_len + len(word) > chunk_size:
            chunks.append(" ".join(current_chunk))
            current_chunk = [word]
            current_len = len(word)
        else:
            current_chunk.append(word)
            current_len += len(word) + 1
    if current_chunk:
        chunks.append(" ".join(current_chunk))
    return chunks

def extract_companies(chunk):
    body = {
        "model": "llama3.2",
        "prompt": PROMPT + chunk,
        "stream": False,
        "options": {"temperature": 0.1}
    }
    
    try:
        response = requests.post(OLLAMA_URL, json=body, timeout=120)
        if response.status_code == 200:
            result = response.json().get("response", "")
            # Clean up potential markdown formatting from Ollama
            result = result.strip()
            if result.startswith("```json"):
                result = result[7:]
            if result.startswith("```"):
                result = result[3:]
            if result.endswith("```"):
                result = result[:-3]
            
            try:
                companies = json.loads(result.strip())
                if isinstance(companies, list):
                    return companies
            except json.JSONDecodeError:
                print(f"⚠️ Failed to parse JSON from Ollama. Output was: {result[:100]}...")
    except Exception as e:
        print(f"❌ Error communicating with Ollama: {e}")
    return []

def save_to_db(company):
    payload = {
        "name": company.get("name"),
        "sector": company.get("sector", "Unknown"),
        "country": company.get("country", "Unknown"),
        "products": company.get("products", "Unknown"),
        "co2": None,
        "esg": "N/A",
        "url": "N/A",
        "methodology": "From Bulk PDF Ingest",
        "s1": 0,
        "s2": 0,
        "s3": 0
    }
    
    try:
        res = requests.post(API_URL, json=payload)
        if res.status_code == 200:
            print(f"✅ Saved to DB: {company.get('name')}")
        else:
            print(f"⚠️ DB API returned {res.status_code} for {company.get('name')}")
    except Exception as e:
        print(f"❌ DB connection error: {e}")

def main():
    import sys
    sys.stdout.reconfigure(encoding='utf-8')

    if not os.path.exists(RAW_DATA_DIR):
        os.makedirs(RAW_DATA_DIR)
        print(f"Created {RAW_DATA_DIR}. Please add PDFs.")
        return

    pdfs = glob.glob(os.path.join(RAW_DATA_DIR, "*.pdf"))
    if not pdfs:
        print("No PDFs found in RawData folder. Add some and run again!")
        return

    for pdf in pdfs:
        text = extract_text_from_pdf(pdf)
        print(f"Total extracted text: {len(text)} characters.")
        
        chunks = chunk_text(text)
        print(f"Split into {len(chunks)} chunks for Llama 3.2 processing.")
        
        for i, chunk in enumerate(chunks):
            print(f"🧠 Processing chunk {i+1}/{len(chunks)}...")
            companies = extract_companies(chunk)
            if companies:
                for c in companies:
                    # Basic validation
                    if "name" in c and len(c["name"]) > 2:
                        save_to_db(c)
            time.sleep(1) # Small pause to let LLM breathe

    print("🎉 Bulk Ingestion Complete!")

if __name__ == "__main__":
    main()
