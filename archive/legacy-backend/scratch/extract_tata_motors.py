import os
import sys
import json

# Add parent directory to path to import process_esg_reports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from process_esg_reports import extract_text_from_pdf, analyze_with_ollama, save_to_db

def run():
    sys.stdout.reconfigure(encoding='utf-8')
    print("=" * 70)
    print("Manual ESG Extraction for Tata Motors Ltd. (2024 Report)")
    print("=" * 70)

    pdf_filename = "tata_motors_ltd._sustainability_report_2024.pdf"
    pdf_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "downloaded_reports", pdf_filename)

    if not os.path.exists(pdf_path):
        print(f"❌ PDF not found at: {pdf_path}")
        return

    print(f"1. Extracting text from {pdf_path}...")
    text = extract_text_from_pdf(pdf_path)
    if not text:
        print("❌ FAILED to extract text from PDF.")
        return
    print(f"✅ Extracted {len(text)} characters of text.")

    print("\n2. Analyzing text with Llama 3 (Ollama)...")
    extracted_data = analyze_with_ollama(text, pdf_filename)

    if not extracted_data:
        print("❌ FAILED to parse data from AI.")
        return

    print("\n3. Extracted JSON Result:")
    print(json.dumps(extracted_data, indent=2))

    print("\n4. Saving to Neon Database...")
    success = save_to_db(extracted_data, pdf_filename)
    if success:
        print("✅ Saved successfully to database!")
    else:
        print("❌ FAILED to save to database.")

if __name__ == "__main__":
    run()
