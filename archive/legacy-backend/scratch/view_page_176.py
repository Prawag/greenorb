import os
import fitz

pdf_path = os.path.join("downloaded_reports", "360_one_wam_ltd._sustainability_report_2024.pdf")
doc = fitz.open(pdf_path)

page = doc[175] # Index 175 is Page 176

print("--- RAW TEXT FROM PAGE 176 ---")
print(page.get_text()[:600])

print("\n--- FIND TABLES ON PAGE 176 ---")
try:
    tabs = page.find_tables()
    print(f"Number of tables: {len(tabs.tables)}")
    for i, tab in enumerate(tabs.tables):
        print(f"\nTable {i+1} as Markdown:")
        print(tab.to_markdown())
except Exception as e:
    print("Error:", e)
