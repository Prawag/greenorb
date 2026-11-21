import sys
sys.stdout.reconfigure(encoding='utf-8')
import os
import json
from process_esg_reports import extract_text_from_pdf, analyze_with_llama

def run_test():
    pdf_path = os.path.join("downloaded_reports", "360_one_wam_ltd._sustainability_report_2024.pdf")
    
    print(f"Extracting {pdf_path}...")
    text = extract_text_from_pdf(pdf_path)
    print(f"Extracted length: {len(text)} characters.")
    
    if text:
        print("Sending to Gemini...")
        data = analyze_with_llama(text, "360_one_wam.pdf")
        print("\n=== EXTRACTED JSON ===\n")
        print(json.dumps(data, indent=4))
    else:
        print("No text extracted.")

if __name__ == "__main__":
    run_test()
