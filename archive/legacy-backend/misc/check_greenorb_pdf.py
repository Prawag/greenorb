import fitz
import os
import sys
sys.stdout.reconfigure(encoding='utf-8')

pdf_path = "Greenorb.md.pdf"
if os.path.exists(pdf_path):
    doc = fitz.open(pdf_path)
    print("Greenorb.md.pdf:")
    print("  Pages:", len(doc))
    print("  First page text snippet:")
    print(doc[0].get_text()[:600])
else:
    print("File not found")
