import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.stdout.reconfigure(encoding='utf-8')
import fitz
import re

pdf_path = os.path.join("downloaded_reports", "aavas_financiers_ltd._sustainability_report_2024.pdf")
doc = fitz.open(pdf_path)

cat_emissions = ["scope 1", "scope 2", "scope 3", "ghg", "co2", "emissions", "water", "electricity", "energy", "renewable", "consumption"]
noise_words = [
    "forward-looking statement", "table of contents", "gri index", 
    "safe harbor", "independent assurance", "board of directors",
    "index", "appendix", "disclosure index"
]

scored_pages = []

for i in range(1, len(doc)):
    page = doc[i]
    page_text = page.get_text().strip()
    
    # Check tables
    tabs = page.find_tables()
    table_markdowns = []
    if hasattr(tabs, "tables") and tabs.tables:
        for tab in tabs.tables:
            md = tab.to_markdown()
            if md and md.strip():
                table_markdowns.append(md.strip())
                
    paragraphs = page_text.split('\n\n')
    all_blocks = paragraphs + table_markdowns
    
    for para in all_blocks:
        para_clean = para.strip()
        if not para_clean or len(para_clean) < 30:
            continue
            
        para_lower = para_clean.lower()
        
        # Noise check
        has_noise = any(noise in para_lower for noise in noise_words)
        
        # Emissions match
        matches_ems = any(kw in para_lower for kw in cat_emissions)
        
        if matches_ems:
            score = 0
            for kw in cat_emissions:
                if kw in para_lower:
                    score += 3
            digit_count = len(re.findall(r'\d', para_clean))
            if digit_count > 0:
                score = score * (1 + min(digit_count // 5, 3))
            
            scored_pages.append({
                "page": i + 1,
                "score": score,
                "has_noise": has_noise,
                "snippet": para_clean[:200].replace('\n', ' ')
            })

scored_pages.sort(key=lambda x: x["score"], reverse=True)
print("=== SCORED EMISSIONS BLOCKS (Top 25) ===")
for item in scored_pages[:25]:
    print(f"Page {item['page']} | Score: {item['score']} | Noise: {item['has_noise']} | Snippet: {item['snippet']}")
