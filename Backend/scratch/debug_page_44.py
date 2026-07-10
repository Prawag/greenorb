import os
import re
import fitz

pdf_path = os.path.join("downloaded_reports", "360_one_wam_ltd._sustainability_report_2024.pdf")
doc = fitz.open(pdf_path)

# Let's inspect page index 43 (visual page 42 is doc[43])
page = doc[43]
print("--- Page Index 43 blocks ---")
paragraphs = page.get_text().split('\n\n')
print(f"Number of paragraphs: {len(paragraphs)}")

cat_operations = ["facilities", "services", "products", "production", "manufacturing", "lifecycle", "csr", "livelihood", "farmers", "diversity", "training", "location"]

for i, para in enumerate(paragraphs):
    para_clean = para.strip()
    para_lower = para_clean.lower()
    matches_ops = any(kw in para_lower for kw in cat_operations)
    
    score = 0
    all_kws = ["revenue", "profit", "net income", "budget", "finance",
               "scope 1", "scope 2", "scope 3", "ghg", "co2", "emissions", "water", "electricity", "energy", "renewable", "consumption",
               "facilities", "services", "products", "production", "manufacturing", "lifecycle", "csr", "livelihood", "farmers", "diversity", "training", "location"]
    for kw in all_kws:
        if kw in para_lower:
            score += 3
            
    if re.search(r'\d', para_clean):
        score *= 2
        
    print(f"Block {i+1} (matches ops: {matches_ops}, score: {score}): {para_clean[:100]}...")
