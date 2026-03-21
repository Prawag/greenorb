"""Print Markdown for Amazon Page 24 (Index 23)."""
import pymupdf4llm
import os

pdf_path = r'C:\Users\prawa\Desktop\GreenOrb\RawData\2024 - Amazon - ESG Report.pdf'
if not os.path.exists(pdf_path):
    pdf_path = r'C:\Users\prawa\Desktop\GreenOrb\RawData\ESG_Reports\Processed\2024 - Amazon - ESG Report.pdf'

md = pymupdf4llm.to_markdown(pdf_path, pages=[23])
print(md)
