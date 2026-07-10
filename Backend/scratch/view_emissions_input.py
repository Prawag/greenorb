import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.stdout.reconfigure(encoding='utf-8')
import re
from process_esg_reports import extract_text_from_pdf

pdf_path = os.path.join("downloaded_reports", "aavas_financiers_ltd._sustainability_report_2024.pdf")
text = extract_text_from_pdf(pdf_path)

def get_tag_content(tag_name):
    match = re.search(f"<{tag_name}>(.*?)</{tag_name}>", text, re.DOTALL)
    return match.group(1).strip() if match else ""

cover = get_tag_content("cover_page")
emissions = get_tag_content("emissions")

print("--- COVER PAGE ---")
print(cover[:1000])

print("\n--- EMISSIONS SEGMENT ---")
print(emissions)
