"""Analyst Module: Filters PDF pages heuristically before LLM processing."""
from typing import List, Set
from loguru import logger

CARBON_KEYWORDS = [
    "scope 1", "scope 2", "scope 3", "ghg", "greenhouse gas", 
    "co2e", "tco2e", "carbon footprint", "emissions", "carbon intensity"
]

def filter_relevant_pages(text_blocks: List[dict], context_window: int = 1) -> List[dict]:
    """
    Scans text blocks for carbon/emissions keywords.
    Returns only the text blocks from relevant pages, including adjacent context pages.
    """
    relevant_pages: Set[int] = set()
    
    # 1. Identify all pages containing keywords
    for block in text_blocks:
        text_lower = block["text"].lower()
        if any(kw in text_lower for kw in CARBON_KEYWORDS):
            relevant_pages.add(block["page"])
            
    if not relevant_pages:
        logger.warning("No pages contained Carbon/GHG keywords. Agent may return empty results.")
        return []

    # 2. Expand to include context window (e.g., +/- 1 page)
    expanded_pages: Set[int] = set()
    for page in relevant_pages:
        for p in range(page - context_window, page + context_window + 1):
            if p > 0:
                expanded_pages.add(p)
                
    logger.info(f"Targeted {len(relevant_pages)} pages. Expanded to {len(expanded_pages)} pages with context.")

    # 3. Filter the original blocks
    filtered_blocks = [b for b in text_blocks if b["page"] in expanded_pages]
    
    return filtered_blocks
