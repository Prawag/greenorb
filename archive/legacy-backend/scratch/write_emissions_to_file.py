import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.stdout.reconfigure(encoding='utf-8')
from process_esg_reports import extract_text_from_pdf

pdf_path = os.path.join("downloaded_reports", "aavas_financiers_ltd._sustainability_report_2024.pdf")
text = extract_text_from_pdf(pdf_path)

import re
match = re.search(f"<emissions>(.*?)</emissions>", text, re.DOTALL)
content = match.group(1).strip() if match else ""

with open("scratch/emissions_content.txt", "w", encoding="utf-8") as f:
    f.write(content)
print("Saved to scratch/emissions_content.txt")
print("Total lines:", len(content.splitlines()))
