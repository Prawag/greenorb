import os
import fitz

pdf_path = os.path.join("downloaded_reports", "360_one_wam_ltd._sustainability_report_2024.pdf")
doc = fitz.open(pdf_path)

# Visual page 175 is visual page, let's look at page index 176 (which is Page 177 in 1-based index)
page = doc[176]

print("--- RAW TEXT FROM PAGE ---")
print(page.get_text()[:400])

print("\n--- FIND TABLES ---")
try:
    tabs = page.find_tables()
    print(f"Number of tables found: {len(tabs)}")
    for i, tab in enumerate(tabs):
        print(f"\nTable {i+1} as Markdown:")
        print(tab.to_markdown())
except Exception as e:
    print(f"Error finding tables: {e}")
