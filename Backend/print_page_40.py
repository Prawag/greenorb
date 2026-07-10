import os
import sys
sys.stdout.reconfigure(encoding='utf-8')
import fitz

pdf_path = os.path.join("downloaded_reports", "360_one_wam_ltd._sustainability_report_2024.pdf")
doc = fitz.open(pdf_path)

page_num = 40
page_text = doc[page_num - 1].get_text()

print(f"--- PAGE {page_num} RAW TEXT ---")
print(repr(page_text))
print("\n--- SPLIT BY \\n\\n ---")
for i, block in enumerate(page_text.split('\n\n')):
    print(f"Block {i+1} (length {len(block)}):")
    print(repr(block))
    print("-"*40)
