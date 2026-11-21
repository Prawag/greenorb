import os
import re
import fitz

pdf_path = os.path.join("downloaded_reports", "360_one_wam_ltd._sustainability_report_2024.pdf")
doc = fitz.open(pdf_path)

critical_keywords = ["scope 1", "scope 2", "scope 3", "ghg", "co2", "revenue", "profit", "net income"]
quantifiable_keywords = ["emissions", "facilities", "water", "electricity consumption", "manufacturing", "production", "budget", "target"]
general_keywords = ["sustainability", "environmental", "energy", "renewable", "waste", "hazardous", "supply chain"]

page_num = 40
page_text = doc[page_num - 1].get_text() # Page 40 is index 39
page_lower = page_text.lower()

score = 0
for kw in critical_keywords:
    if kw in page_lower:
        score += 5
for kw in quantifiable_keywords:
    if kw in page_lower:
        score += 3
for kw in general_keywords:
    if kw in page_lower:
        score += 1
        
digit_count = len(re.findall(r'\d', page_text))
if digit_count > 0:
    multiplier = (1 + min(digit_count // 5, 5))
    final_score = score * multiplier
else:
    multiplier = 1
    final_score = score

print(f"Page {page_num} Text Sample:")
print(page_text[:300].replace('\n', ' '))
print(f"\nKeywords matched: {[kw for kw in critical_keywords + quantifiable_keywords + general_keywords if kw in page_lower]}")
print(f"Digit count: {digit_count}")
print(f"Multiplier: {multiplier}")
print(f"Base Score: {score}")
print(f"Final Score: {final_score}")
