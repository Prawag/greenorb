import os
import fitz

pdf_path = os.path.join("downloaded_reports", "360_one_wam_ltd._sustainability_report_2024.pdf")
doc = fitz.open(pdf_path)

for i in range(len(doc)):
    text = doc[i].get_text()
    if "scope 1" in text.lower():
        print(f"Page {i+1} mentions Scope 1:")
        for line in text.split('\n'):
            if "scope 1" in line.lower() or "scope 2" in line.lower() or "emissions" in line.lower():
                print(f"  {line.strip()}")
