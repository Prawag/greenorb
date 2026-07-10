import os
import fitz

pdf_path = os.path.join("downloaded_reports", "360_one_wam_ltd._sustainability_report_2024.pdf")
doc = fitz.open(pdf_path)
page = doc[176]

try:
    tabs = page.find_tables()
    print("Number of tables:", len(tabs.tables))
    for i, tab in enumerate(tabs.tables):
        print(f"\n--- Table {i+1} ---")
        print(tab.to_markdown())
except Exception as e:
    print("Error:", e)
