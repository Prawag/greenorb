"""Print Markdown for first 30 pages of Microsoft."""
import pymupdf4llm
import os

pdf_path = r'C:\Users\prawa\Desktop\GreenOrb\RawData\2025-Microsoft-Environmental-Sustainability-Report.pdf'
if not os.path.exists(pdf_path):
    pdf_path = r'C:\Users\prawa\Desktop\GreenOrb\RawData\ESG_Reports\Processed\2025-Microsoft-Environmental-Sustainability-Report.pdf'

md = pymupdf4llm.to_markdown(pdf_path, pages=list(range(30)))
with open("microsoft_md_test.md", "w", encoding="utf-8") as f:
    f.write(md)
print("✅ Markdown written to microsoft_md_test.md")
