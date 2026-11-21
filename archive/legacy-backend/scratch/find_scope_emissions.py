import os
import sys
import fitz
import re

pdf_filename = "tata_motors_ltd._sustainability_report_2024.pdf"
pdf_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "downloaded_reports", pdf_filename)

if not os.path.exists(pdf_path):
    print("PDF not found")
    sys.exit(1)

doc = fitz.open(pdf_path)

print("Searching for carbon / emissions terminology:")
keywords = ["scope", "emissions", "co2", "ghg", "tco2", "carbon"]

for i, page in enumerate(doc):
    text = page.get_text()
    clean = re.sub(r'\s+', ' ', text)
    for kw in keywords:
        matches = list(re.finditer(r'([^.]{0,100}' + kw + r'[^.]{0,100})', clean, re.IGNORECASE))
        if matches:
            print(f"Page {i+1} matches for '{kw}':")
            for m in matches[:3]:
                print(f"  - ...{m.group(1).strip()}...")
            print("-" * 40)
