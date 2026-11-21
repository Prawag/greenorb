"""LangChain tool wrapper for the discovery module."""
from langchain.tools import tool
from loguru import logger
from modules.discovery import find_best_esg_url, search_esg_urls


@tool
def discover_esg_page(company_name: str) -> str:
    """Discover the best ESG/sustainability report page URL for a company.
    Input: company name (e.g. 'Microsoft' or 'Tata Steel').
    Returns: the URL of the best ESG page found, or an error message."""
    logger.info(f"[TOOL] discover_esg_page called for: {company_name}")
    url = find_best_esg_url(company_name)
    if url:
        return f"Found ESG page for {company_name}: {url}"
    return f"Could not find ESG page for {company_name}. Try a more specific company name."


@tool
def search_esg_pages(company_name: str) -> str:
    """Search for multiple ESG/sustainability report page URLs for a company.
    Returns up to 10 candidate URLs with scores."""
    logger.info(f"[TOOL] search_esg_pages called for: {company_name}")
    candidates = search_esg_urls(company_name)
    if not candidates:
        return f"No ESG URLs found for {company_name}"
    lines = [f"- {c['url']} (score={c['score']}, title={c['title']})" for c in candidates]
    return f"Found {len(candidates)} candidate URLs for {company_name}:\n" + "\n".join(lines)
