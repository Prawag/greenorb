import os
import fitz

pdf_path = os.path.join("downloaded_reports", "360_one_wam_ltd._sustainability_report_2024.pdf")
doc = fitz.open(pdf_path)

search_terms = ["Clients on boarded digitally", "lives impacted through CSR efforts", "Building Sustainable Farmer Producer Companies", "Providing an Alternate Livelihood"]

for term in search_terms:
    found = False
    for i in range(len(doc)):
        text = doc[i].get_text()
        if term.lower() in text.lower():
            print(f"Term '{term}' found on absolute PDF Page {i + 1}")
            found = True
            break
    if not found:
        print(f"Term '{term}' NOT found anywhere in the PDF!")
