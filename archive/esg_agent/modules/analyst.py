"""Analyst Module: Filters PDF pages heuristically before LLM processing."""
from typing import List, Set
from loguru import logger

TARGET_KEYWORDS = {
    # =========================================================================
    # 1. ENVIRONMENTAL PILLAR (Emissions, Climate, Energy, Water, & Waste)
    # =========================================================================
    "scope 1", "scope 2", "scope 3", "ghg", "greenhouse gas", "greenhouse gases",
    "emissions", "co2", "co2e", "carbon footprint", "carbon neutral", "net zero",
    "decarbonization", "methane", "ch4", "sf6", "global warming potential", "gwp",
    "renewable energy", "electricity consumption", "megawatt", "mwh", "gigajoule",
    "energy intensity", "fuel consumption", "solar", "wind", "hydroelectric",
    "water withdrawal", "water consumption", "water discharge", "water stress",
    "effluents", "wastewater", "hazardous waste", "non-hazardous waste", 
    "recycling rate", "landfill diversion", "circular economy", "biodiversity",
    "deforestation", "spills", "environmental incidents", "climate risk",

    # =========================================================================
    # 2. SOCIAL PILLAR (Workforce, Diversity, Health & Safety, Human Rights)
    # =========================================================================
    "diversity", "inclusion", "dei", "gender ratio", "female representation",
    "underrepresented", "pay gap", "equal remuneration", "employee turnover",
    "attrition rate", "new hires", "training hours", "upskilling", 
    "health and safety", "injury rate", "ltifr", "lost time", "fatalities",
    "osha", "human rights", "child labor", "forced labor", "modern slavery",
    "collective bargaining", "union", "freedom of association", 
    "supply chain audit", "supplier code of conduct", "community investment",

    # =========================================================================
    # 3. GOVERNANCE PILLAR (Board structure, Ethics, Compliance)
    # =========================================================================
    "board of directors", "board independence", "board diversity", "ceo pay ratio",
    "executive compensation", "remuneration", "audit committee", "shareholder",
    "voting rights", "proxy", "business ethics", "anti-corruption", "bribery",
    "whistleblower", "compliance", "data privacy", "cybersecurity", 
    "gdpr", "insider trading", "political contributions", "lobbying",

    # =========================================================================
    # 4. COMPANY & FINANCIAL CONTROLS (To tie ESG numbers to Business Value)
    # =========================================================================
    "revenue", "ebitda", "ebit", "operating income", "net profit", "gross margin",
    "capex", "capital expenditure", "opex", "operating expenditure", 
    "total assets", "market capitalization", "sustainable finance", 
    "green bond", "social bond", "esg linked loan", "r&d investment",

    # =========================================================================
    # 5. REGULATORY FRAMEWORKS & REPORTING STANDARDS (Data Indexes/Appendices)
    # =========================================================================
    "gri index", "global reporting initiative", "sasb", "tcfd", "tnfd",
    "materiality matrix", "materiality assessment", "issb", "csrd", "esrs",
    "sfdr", "brsr", "cdp score", "un sdgs", "assurance statement", 
    "independent auditor", "limited assurance", "reasonable assurance"
}

def filter_relevant_pages(text_blocks: List[dict], context_window: int = 1) -> List[dict]:
    """
    Scans text blocks for ESG keywords.
    Returns only the text blocks from relevant pages, including adjacent context pages.
    """
    relevant_pages: Set[int] = set()
    
    # 1. Identify all pages containing keywords
    for block in text_blocks:
        text_lower = block["text"].lower()
        if any(kw in text_lower for kw in TARGET_KEYWORDS):
            relevant_pages.add(block["page"])
            
    if not relevant_pages:
        logger.warning("No pages contained TARGET_KEYWORDS. Agent may return empty results.")
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


async def extract_metrics_with_swarm(company_name: str, pdf_text_blocks: List[dict]) -> dict:
    """
    Passes filtered PDF blocks to the MiroFish swarm intelligence engine
    for dynamic, resilient extraction.
    """
    from modules.mirofish_adapter import run_swarm_extraction
    
    # Pre-filter blocks to reduce token load and target carbon sections
    relevant_blocks = filter_relevant_pages(pdf_text_blocks, context_window=1)
    
    if not relevant_blocks:
        logger.warning(f"No relevant pages found for {company_name}. Sending raw blocks to swarm.")
        # Fallback to sending up to 30 pages from the middle of the report
        mid_idx = len(pdf_text_blocks) // 2
        start = max(0, mid_idx - 15)
        relevant_blocks = pdf_text_blocks[start:start+30]
        
    metrics = await run_swarm_extraction(
        company_name=company_name,
        pdf_text_blocks=relevant_blocks
    )
    
    return metrics or {}
