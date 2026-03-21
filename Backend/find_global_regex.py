"""Find any numbers near 'Scope 1' in the whole Microsoft PDF."""
import fitz
import re
import os

pdf_path = r'C:\Users\prawa\Desktop\GreenOrb\RawData\2025-Microsoft-Environmental-Sustainability-Report.pdf'
if not os.path.exists(pdf_path):
    pdf_path = r'C:\Users\prawa\Desktop\GreenOrb\RawData\ESG_Reports\Processed\2025-Microsoft-Environmental-Sustainability-Report.pdf'

doc = fitz.open(pdf_path)
full_text = ""
for page in doc:
    full_text += page.get_text() + "\n"

# Search for "Scope 1" followed by a number within 100 chars
matches = re.findall(r'Scope 1.{0,100}?(\d{1,3}(?:,\d{3})*(?:\.\d+)?)', full_text, re.IGNORECASE | re.DOTALL)
print(f"Scope 1 matches: {matches}")

# Search for "Scope 2" followed by a number
matches2 = re.findall(r'Scope 2.{0,100}?(\d{1,3}(?:,\d{3})*(?:\.\d+)?)', full_text, re.IGNORECASE | re.DOTALL)
print(f"Scope 2 matches: {matches2}")
