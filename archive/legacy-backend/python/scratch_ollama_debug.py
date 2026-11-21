import os
import sys
sys.stdout.reconfigure(encoding='utf-8')
import json
import requests
from process_esg_reports import extract_text_from_pdf, build_analyze_prompt

pdf_path = os.path.join("downloaded_reports", "360_one_wam_ltd._sustainability_report_2024.pdf")
text = extract_text_from_pdf(pdf_path)

# Let's try different truncation lengths
truncated_text = text[:15000] # Safe 15k limit

prompt = build_analyze_prompt(truncated_text)

body = {
    "model": "llama3",
    "prompt": prompt,
    "stream": False,
    "format": "json"
}

print("Sending to Ollama (Raw Mode)...")
try:
    response = requests.post("http://localhost:11434/api/generate", json=body, timeout=300)
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        raw_res = response.json().get("response", "")
        print("--- RAW RESPONSE ---")
        print(raw_res)
    else:
        print(response.text)
except Exception as e:
    print(f"Error: {e}")
