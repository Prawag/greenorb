"""Find page with 'Scope 1' in Microsoft report."""
import fitz
import os

pdf_path = r'C:\Users\prawa\Desktop\GreenOrb\RawData\2025-Microsoft-Environmental-Sustainability-Report.pdf'
if not os.path.exists(pdf_path):
    pdf_path = r'C:\Users\prawa\Desktop\GreenOrb\RawData\ESG_Reports\Processed\2025-Microsoft-Environmental-Sustainability-Report.pdf'

doc = fitz.open(pdf_path)
for i in range(len(doc)):
    text = doc[i].get_text().lower()
    if 'scope 1' in text and 'scope 2' in text and 'scope 3' in text:
        print(f"✅ Found all 3 scopes on Page {i+1} (Index {i})")
        # Print a snippet
        print(text[:500].replace('\n', ' '))
