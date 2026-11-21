import os
import sys
import fitz
import re

pdf_filename = "tata_motors_ltd._sustainability_report_2024.pdf"
pdf_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "downloaded_reports", pdf_filename)

if not os.path.exists(pdf_path):
    print("PDF not found")
    sys.exit(1)

doc = fitz.open(pdf_path)

# Extract full text
full_text = ""
for page in doc:
    full_text += page.get_text() + "\n"

# Clean text (normalize whitespace)
clean_text = re.sub(r'\s+', ' ', full_text)

print("--- Testing Regex Extraction ---")

# 1. Revenue
rev_match = re.search(r'revenue\s+(?:(?:of\s+)?(?:rs\.?\s*)?crores?\s+)?(?:\(rs\.?\s*crore(?:s)?\)\s*)?([\d,.]+)', clean_text, re.IGNORECASE)
if rev_match:
    print(f"Revenue: {rev_match.group(1)}")
else:
    # Try another pattern
    rev_match2 = re.search(r'revenue\s+.*?([\d,.]+)\s*(?:crore|billion|million)', clean_text, re.IGNORECASE)
    if rev_match2:
        print(f"Revenue (Pattern 2): {rev_match2.group(1)}")
    else:
        print("Revenue: Not found")

# 2. Profit / PAT
pat_match = re.search(r'profit\s+after\s+tax\s*(?:\(rs\.?\s*crore(?:s)?\)\s*)?([\d,.]+)', clean_text, re.IGNORECASE)
if pat_match:
    print(f"PAT: {pat_match.group(1)}")
else:
    pat_match2 = re.search(r'pat\s+.*?([\d,.]+)\s*(?:crore|billion|million)', clean_text, re.IGNORECASE)
    if pat_match2:
        print(f"PAT (Pattern 2): {pat_match2.group(1)}")
    else:
        print("PAT: Not found")

# 3. Employees
emp_match = re.search(r'total\s+employees\s*(?:\(permanent\))?\s*([\d,.]+)', clean_text, re.IGNORECASE)
if emp_match:
    print(f"Employees: {emp_match.group(1)}")
else:
    print("Employees: Not found")

# 4. Renewable Energy %
re_match = re.search(r'renewable\s+energy\s*(?:\(re\s*100\))?\s*.*?(\d+)\s*%', clean_text, re.IGNORECASE)
if re_match:
    print(f"Renewable Energy: {re_match.group(1)}%")
else:
    print("Renewable Energy: Not found")
