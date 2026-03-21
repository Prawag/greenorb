"""Find the emissions table page in Microsoft report."""
import fitz
import os

pdf_path = r'C:\Users\prawa\Desktop\GreenOrb\RawData\2025-Microsoft-Environmental-Sustainability-Report.pdf'
if not os.path.exists(pdf_path):
    pdf_path = r'C:\Users\prawa\Desktop\GreenOrb\RawData\ESG_Reports\Processed\2025-Microsoft-Environmental-Sustainability-Report.pdf'

doc = fitz.open(pdf_path)
for i in range(len(doc)):
    text = doc[i].get_text().lower()
    # Looking for a data table with recent years and unit
    if 'scope 1' in text and ('2023' in text or '2024' in text) and ('metric tons' in text or 'mtco2e' in text):
        print(f"✅ Potential table on Page {i+1} (Index {i})")
        # Print lines that look like table rows
        for line in doc[i].get_text().split('\n'):
            if 'scope' in line.lower() or 'total' in line.lower():
                print(f"  {line[:100]}")
