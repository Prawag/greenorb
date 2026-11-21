import os
import re
import sys
sys.stdout.reconfigure(encoding='utf-8')
import fitz

pdf_path = os.path.join("downloaded_reports", "360_one_wam_ltd._sustainability_report_2024.pdf")
doc = fitz.open(pdf_path)

# Define categories
cat_financial = ["revenue", "profit", "net income", "budget", "finance"]
cat_emissions = ["scope 1", "scope 2", "scope 3", "ghg", "co2", "emissions", "water", "electricity", "energy", "renewable", "consumption"]
cat_operations = ["facilities", "services", "products", "production", "manufacturing", "lifecycle", "csr", "livelihood", "farmers", "diversity", "training", "location"]

list_financial = []
list_emissions = []
list_operations = []

for i in range(1, len(doc)):
    page_text = doc[i].get_text()
    paragraphs = page_text.split('\n\n')
    
    for para in paragraphs:
        para_clean = para.strip()
        if not para_clean or len(para_clean) < 30:
            continue
            
        para_lower = para_clean.lower()
        
        # Scoring
        score = 0
        matches_fin = any(kw in para_lower for kw in cat_financial)
        matches_ems = any(kw in para_lower for kw in cat_emissions)
        matches_ops = any(kw in para_lower for kw in cat_operations)
        
        if not (matches_fin or matches_ems or matches_ops):
            continue
            
        # Calculate a basic score based on keyword matches
        all_kws = cat_financial + cat_emissions + cat_operations
        for kw in all_kws:
            if kw in para_lower:
                score += 3
                
        # Digit multiplier
        digit_count = len(re.findall(r'\d', para_clean))
        if digit_count > 0:
            score = score * (1 + min(digit_count // 5, 3))
            
        # Add to corresponding lists
        entry = (score, i + 1, para_clean)
        if matches_fin:
            list_financial.append(entry)
        if matches_ems:
            list_emissions.append(entry)
        if matches_ops:
            list_operations.append(entry)

# Sort each list
list_financial.sort(key=lambda x: x[0], reverse=True)
list_emissions.sort(key=lambda x: x[0], reverse=True)
list_operations.sort(key=lambda x: x[0], reverse=True)

print("--- SELECTED FINANCIAL PARAGRAPHS (Top 3) ---")
for s, p, txt in list_financial[:3]:
    print(f"Page {p} (Score {s}): {txt[:150].replace('\n', ' ')}...")
    
print("\n--- SELECTED EMISSIONS PARAGRAPHS (Top 8) ---")
for s, p, txt in list_emissions[:8]:
    print(f"Page {p} (Score {s}): {txt[:150].replace('\n', ' ')}...")
    
print("\n--- SELECTED OPERATIONS PARAGRAPHS (Top 8) ---")
# Check if page 40 (visual page 38) is in here
page_40_selected = False
for s, p, txt in list_operations[:8]:
    if p == 40:
        page_40_selected = True
    print(f"Page {p} (Score {s}): {txt[:150].replace('\n', ' ')}...")
    
print(f"\nWas Page 40 selected in Operations? {page_40_selected}")
