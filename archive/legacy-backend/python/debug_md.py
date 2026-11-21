"""Print Markdown for Page 84 (Index 83)."""
import pymupdf4llm
import os

pdf_path = r'C:\Users\prawa\Desktop\GreenOrb\RawData\2025-Microsoft-Environmental-Sustainability-Report.pdf'
if not os.path.exists(pdf_path):
    pdf_path = r'C:\Users\prawa\Desktop\GreenOrb\RawData\ESG_Reports\Processed\2025-Microsoft-Environmental-Sustainability-Report.pdf'

md = pymupdf4llm.to_markdown(pdf_path, pages=[83])
print(md)
