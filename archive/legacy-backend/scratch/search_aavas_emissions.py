import os
import sys
sys.stdout.reconfigure(encoding='utf-8')
import fitz

pdf_path = os.path.join("downloaded_reports", "aavas_financiers_ltd._sustainability_report_2024.pdf")
doc = fitz.open(pdf_path)

for i in range(len(doc)):
    text = doc[i].get_text()
    if "scope 1" in text.lower():
        print(f"\n================ PAGE {i+1} ================")
        print(text[:1200]) # print first 1200 chars safely
