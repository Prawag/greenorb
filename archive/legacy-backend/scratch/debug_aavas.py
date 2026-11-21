import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.stdout.reconfigure(encoding='utf-8')
from process_esg_reports import extract_text_from_pdf

pdf_path = os.path.join("downloaded_reports", "aavas_financiers_ltd._sustainability_report_2024.pdf")
text = extract_text_from_pdf(pdf_path)

print("Character length:", len(text))
print("--- FULL EXTRACTED TEXT ---")
print(text[:4000])
