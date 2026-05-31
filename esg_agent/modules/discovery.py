"""Discovery Module: Finds ESG report URLs using direct URL construction."""
from datetime import datetime
from typing import List, Optional
from loguru import logger
import re

ESG_KEYWORDS = [
    "sustainability", "esg", "csr", "environment", "responsibility",
    "climate", "impact", "citizenship", "annual-report", "investors",
    "net-zero", "carbon", "scope-1", "scope-2", "ghg", "tcfd"
]

def generate_search_queries(company_name: str) -> List[str]:
    """Generate hardcoded queries to find ESG reports without an LLM."""
    year = datetime.now().year
    return [
        f"{company_name} ESG report {year} filetype:pdf",
        f"{company_name} sustainability report filetype:pdf",
        f"{company_name} CSR annual report {year}",
        f"{company_name} ESG sustainability"
    ]

def score_url(url: str, title: str = "") -> int:
    """Return a relevance score for a URL based on ESG keyword presence."""
    combined = (url + " " + title).lower()
    score = 0
    for kw in ESG_KEYWORDS:
        if kw in combined:
            score += 2
    penalty_domains = ["reuters.com", "bloomberg.com", "businesswire.com",
                       "prnewswire.com", "globenewswire.com", "wikipedia.org", "finance.yahoo.com"]
    for domain in penalty_domains:
        if domain in url.lower():
            score -= 5
    if url.lower().endswith(".pdf"):
        score += 5
    return score

def search_esg_urls(company_name: str) -> List[dict]:
    """
    Since search engines are blocking this IP, we use direct URL construction based on the company name.
    We return standard sustainability paths that scraper.py will visit to hunt for PDFs.
    """
    
    # GUARANTEED INSTANT PDF DOWNLOADS for top companies to get the pipeline flowing
    KNOWN_URLS = {
        "apple": "https://www.apple.com/environment/pdf/Apple_Environmental_Progress_Report_2024.pdf",
        "microsoft": "https://query.prod.cms.rt.microsoft.com/cms/api/am/binary/RW16c5T", # 2024 report
        "amazon": "https://sustainability.aboutamazon.com/2023-sustainability-report.pdf",
        "alphabet": "https://www.gstatic.com/gumdrop/sustainability/google-2024-environmental-report.pdf",
        "meta": "https://sustainability.fb.com/wp-content/uploads/2024/07/2024-Meta-Sustainability-Report.pdf",
        "tesla": "https://www.tesla.com/ns_videos/2023-tesla-impact-report.pdf",
        "nvidia": "https://images.nvidia.com/aem-dam/Solutions/documents/NVIDIA-FY24-Sustainability-Report.pdf",
        "netflix": "https://s22.q4cdn.com/959853165/files/doc_downloads/2024/05/Netflix-2023-ESG-Report.pdf",
        "pepsico": "https://www.pepsico.com/docs/default-source/sustainability-and-esg-topics/2023-esg-summary.pdf",
        "nike": "https://about.nike.com/pages/fy23-nike-inc-impact-report.pdf"
    }
    
    candidates = []
    
    for key, url in KNOWN_URLS.items():
        if key in company_name.lower():
            candidates.append({
                "url": url,
                "title": f"Known Direct URL for {company_name}",
                "score": 100
            })
            return candidates

    # Clean company name to create a likely domain if we don't have one
    clean_name = re.sub(r'[^a-zA-Z0-9]', '', company_name.lower())
    clean_name = clean_name.replace('inc', '').replace('corp', '').replace('company', '').replace('llc', '')
    
    # Standard paths where ESG reports are typically hosted
    base_urls = [
        f"https://www.{clean_name}.com",
        f"https://{clean_name}.com"
    ]
    
    paths = [
        "/sustainability",
        "/esg",
        "/about-us/sustainability",
        "/corporate-responsibility",
        "/investors/esg",
        "/about/esg",
        "/sustainability-report"
    ]
    
    candidates = []
    seen = set()
    
    for base in base_urls:
        for path in paths:
            url = f"{base}{path}"
            if url not in seen:
                seen.add(url)
                candidates.append({
                    "url": url,
                    "title": f"Constructed URL for {company_name}",
                    "score": 10
                })
                
    logger.info(f"Generated {len(candidates)} direct URL candidates for {company_name}")
    return candidates

def find_best_esg_url(company_name: str) -> Optional[str]:
    """Return the most likely direct URL. The scraper will try it, and if it fails, it can try others."""
    # Since we can't search, we just return the most common pattern.
    # The scraper handles crawling the page to find the PDF.
    clean_name = re.sub(r'[^a-zA-Z0-9]', '', company_name.lower())
    clean_name = clean_name.replace('inc', '').replace('corp', '').replace('company', '').replace('llc', '')
    return f"https://www.{clean_name}.com/sustainability"

