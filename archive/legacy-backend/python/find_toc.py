import os
import sys
sys.stdout.reconfigure(encoding='utf-8')
import fitz

pdf_path = os.path.join("downloaded_reports", "360_one_wam_ltd._sustainability_report_2024.pdf")
doc = fitz.open(pdf_path)

for i in range(min(15, len(doc))):
    text = doc[i].get_text()
    if "contents" in text.lower():
        print(f"Table of Contents found on absolute PDF Page {i + 1}")
        print("--- CONTENT ---")
        print(text[:1000])
        print("="*60)
