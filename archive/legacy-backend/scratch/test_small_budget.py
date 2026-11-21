import os
import re
import sys
sys.stdout.reconfigure(encoding='utf-8')
import fitz

pdf_path = os.path.join("downloaded_reports", "360_one_wam_ltd._sustainability_report_2024.pdf")
doc = fitz.open(pdf_path)

cat_financial = ["revenue", "profit", "net income", "budget", "finance"]
cat_emissions = ["scope 1", "scope 2", "scope 3", "ghg", "co2", "emissions", "water", "electricity", "energy", "renewable", "consumption"]
cat_operations = ["facilities", "services", "products", "production", "manufacturing", "lifecycle", "csr", "livelihood", "farmers", "diversity", "training", "location"]

list_financial = []
list_emissions = []
list_operations = []

for i in range(1, len(doc)):
    page = doc[i]
    page_text = page.get_text().strip()
    
    table_markdowns = []
    try:
        tabs = page.find_tables()
        if hasattr(tabs, "tables") and tabs.tables:
            for tab in tabs.tables:
                try:
                    md = tab.to_markdown()
                    if md and md.strip():
                        table_markdowns.append(md.strip())
                except:
                    pass
    except:
        pass
        
    paragraphs = page_text.split('\n\n')
    all_blocks = paragraphs + table_markdowns
    
    for para in all_blocks:
        para_clean = para.strip()
        if not para_clean or len(para_clean) < 30:
            continue
            
        para_lower = para_clean.lower()
        
        matches_fin = any(kw in para_lower for kw in cat_financial)
        matches_ems = any(kw in para_lower for kw in cat_emissions)
        matches_ops = any(kw in para_lower for kw in cat_operations)
        
        if not (matches_fin or matches_ems or matches_ops):
            continue
            
        score = 0
        all_kws = cat_financial + cat_emissions + cat_operations
        for kw in all_kws:
            if kw in para_lower:
                score += 3
                
        if re.search(r'\d', para_clean):
            score *= 2
            
        entry = (score, i + 1, para_clean)
        if matches_fin:
            list_financial.append(entry)
        if matches_ems:
            list_emissions.append(entry)
        if matches_ops:
            list_operations.append(entry)

# Sort
list_financial.sort(key=lambda x: x[0], reverse=True)
list_emissions.sort(key=lambda x: x[0], reverse=True)
list_operations.sort(key=lambda x: x[0], reverse=True)

# Merge
unique_texts = set()
unique_entries = []

def add_to_unique(scored_list, budget, name):
    print(f"\n--- {name} (Budget {budget}) ---")
    for score, page_num, text in scored_list[:budget]:
        snippet = text[:150].replace('\n', ' ')
        print(f"Page {page_num} (Score {score}): {snippet}...")
        if text not in unique_texts:
            unique_texts.add(text)
            unique_entries.append((page_num, text))

add_to_unique(list_financial, 2, "FINANCIAL")
add_to_unique(list_emissions, 4, "EMISSIONS")
add_to_unique(list_operations, 4, "OPERATIONS")

print("\n--- FINAL SELECTED UNIQUE BLOCKS ---")
total_chars = 0
for page_num, text in unique_entries:
    total_chars += len(text)
    print(f"Page {page_num} (length {len(text)})")
    
print(f"\nTotal characters: {total_chars}")
