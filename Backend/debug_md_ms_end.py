"""Print Markdown for LAST 20 pages of Microsoft."""
import pymupdf4llm
import fitz
import os

pdf_path = r'C:\Users\prawa\Desktop\GreenOrb\RawData\2025-Microsoft-Environmental-Sustainability-Report.pdf'
if not os.path.exists(pdf_path):
    pdf_path = r'C:\Users\prawa\Desktop\GreenOrb\RawData\ESG_Reports\Processed\2025-Microsoft-Environmental-Sustainability-Report.pdf'

doc = fitz.open(pdf_path)
total = len(doc)
start = max(0, total - 20)
pages = list(range(start, total))

md = pymupdf4llm.to_markdown(pdf_path, pages=pages)
with open("microsoft_appendix_test.md", "w", encoding="utf-8") as f:
    f.write(md)
print(f"✅ Markdown for pages {start+1}-{total} written to microsoft_appendix_test.md")
