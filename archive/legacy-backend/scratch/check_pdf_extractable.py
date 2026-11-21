import os
import sys
import fitz

pdf_filename = "tata_motors_ltd._sustainability_report_2024.pdf"
pdf_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "downloaded_reports", pdf_filename)

if not os.path.exists(pdf_path):
    print("PDF not found")
    sys.exit(1)

doc = fitz.open(pdf_path)
print(f"Total pages: {len(doc)}")

# Check character counts per page
char_counts = [len(page.get_text().strip()) for page in doc]
print("Character counts for first 20 pages:")
print(char_counts[:20])

# Let's print the full text of page 5
print("\n--- Page 5 Text ---")
print(doc[4].get_text().strip()[:2000])

# Let's print the full text of page 22
print("\n--- Page 22 Text ---")
print(doc[21].get_text().strip()[:2000])
