import sys
sys.stdout.reconfigure(encoding='utf-8')
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from process_esg_reports import extract_text_from_pdf

pdf_path = os.path.join("downloaded_reports", "360_one_wam_ltd._sustainability_report_2024.pdf")
text = extract_text_from_pdf(pdf_path)

print("Character length:", len(text))
print("Word count:", len(text.split()))

print("\n--- FIRST 2000 CHARACTERS ---")
print(text[:2000])

print("\n--- LAST 2000 CHARACTERS ---")
print(text[-2000:])
