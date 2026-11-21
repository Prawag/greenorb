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

# Let's search for pages containing "Scope 1" or "Scope 2" or "EBITDA" or "Revenue"
matches = {
    "scope 1": [],
    "ebitda": [],
    "revenue": [],
    "local procurement": []
}

for i in range(len(doc)):
    text = doc[i].get_text()
    for kw in matches.keys():
        if kw in text.lower():
            matches[kw].append(i + 1)

print("\nKeyword page matches:")
for kw, pages in matches.items():
    print(f"  {kw}: pages {pages[:15]} (Total {len(pages)} pages)")

# Print sample text from a page matching "scope 1" and "ebitda"
scope1_pages = matches["scope 1"]
if scope1_pages:
    print(f"\n--- Sample Text from Page {scope1_pages[0]} (Scope 1 match) ---")
    print(doc[scope1_pages[0] - 1].get_text()[:1500])

ebitda_pages = matches["ebitda"]
if ebitda_pages:
    print(f"\n--- Sample Text from Page {ebitda_pages[0]} (EBITDA match) ---")
    print(doc[ebitda_pages[0] - 1].get_text()[:1500])
