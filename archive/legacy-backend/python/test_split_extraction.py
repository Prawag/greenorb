import os
import sys
sys.stdout.reconfigure(encoding='utf-8')
import json
import requests
from process_esg_reports import extract_text_from_pdf, analyze_with_ollama

def run_test():
    pdf_path = os.path.join("downloaded_reports", "360_one_wam_ltd._sustainability_report_2024.pdf")
    text = extract_text_from_pdf(pdf_path)
    
    print("Running analyze_with_ollama...")
    merged = analyze_with_ollama(text, "360_one_wam_ltd._sustainability_report_2024.pdf")
    
    print("\n=== FINAL MERGED JSON ===")
    print(json.dumps(merged, indent=4))

if __name__ == "__main__":
    run_test()
