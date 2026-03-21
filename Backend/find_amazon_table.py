"""Find page with 'Carbon footprint' in Amazon report."""
import fitz
import os

pdf_path = r'C:\Users\prawa\Desktop\GreenOrb\RawData\2024 - Amazon - ESG Report.pdf'
if not os.path.exists(pdf_path):
    pdf_path = r'C:\Users\prawa\Desktop\GreenOrb\RawData\ESG_Reports\Processed\2024 - Amazon - ESG Report.pdf'

doc = fitz.open(pdf_path)
for i in range(len(doc)):
    text = doc[i].get_text().lower()
    if 'carbon footprint' in text:
        print(f"✅ Found 'Carbon footprint' on Page {i+1} (Index {i})")
        print(text[:300].replace('\n', ' '))
