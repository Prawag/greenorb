import os
import re
import sys
sys.stdout.reconfigure(encoding='utf-8')
import fitz

pdf_path = os.path.join("downloaded_reports", "360_one_wam_ltd._sustainability_report_2024.pdf")
doc = fitz.open(pdf_path)

critical_keywords = ["scope 1", "scope 2", "scope 3", "ghg", "co2", "revenue", "profit", "net income"]
quantifiable_keywords = ["emissions", "facilities", "water", "electricity consumption", "manufacturing", "production", "budget", "target"]
general_keywords = ["sustainability", "environmental", "energy", "renewable", "waste", "hazardous", "supply chain"]

page_scores = []

for i in range(1, len(doc)):
    page_text = doc[i].get_text()
    page_lower = page_text.lower()
    
    score = 0
    # Calculate score based on keyword occurrences
    for kw in critical_keywords:
        if kw in page_lower:
            score += 5
    for kw in quantifiable_keywords:
        if kw in page_lower:
            score += 3
    for kw in general_keywords:
        if kw in page_lower:
            score += 1
            
    # Multiply by number of digit occurrences to favor data pages
    digit_count = len(re.findall(r'\d', page_text))
    if digit_count > 0:
        score = score * (1 + min(digit_count // 5, 5)) # Cap multiplier at 6x
        
    if score > 0:
        page_scores.append((score, i + 1, page_text))

# Sort pages by score descending
page_scores.sort(key=lambda x: x[0], reverse=True)

print("Top 10 Scoring Pages:")
for score, page_num, text in page_scores[:10]:
    print(f"Page {page_num} - Score: {score}")
    print(f"Sample: {text[:200].replace('\n', ' ')}\n")
