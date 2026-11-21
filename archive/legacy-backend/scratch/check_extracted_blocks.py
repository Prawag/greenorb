import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.stdout.reconfigure(encoding='utf-8')
import fitz
import re
from process_esg_reports import extract_text_from_pdf

pdf_path = os.path.join("downloaded_reports", "aavas_financiers_ltd._sustainability_report_2024.pdf")
text = extract_text_from_pdf(pdf_path)

print("=== EXTRACTED SECTIONS IN THE PROMPT ===")
for tag in ["cover_page", "financials", "emissions", "operations"]:
    match = re.search(f"<{tag}>(.*?)</{tag}>", text, re.DOTALL)
    content = match.group(1).strip() if match else ""
    print(f"\n[{tag.upper()}] (Length: {len(content)} chars)")
    # Find any page numbers like "31", "34", etc.
    pages = re.findall(r'(?:^|\n)(\d+)(?:\n|$)', content)
    print("Detected page numbers in section:", sorted(list(set(pages))))
    # Print first 200 characters and last 200 characters
    if content:
        print("  Start:", content[:200].replace('\n', ' '))
        print("  End:", content[-200:].replace('\n', ' '))
