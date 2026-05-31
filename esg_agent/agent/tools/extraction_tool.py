"""LangChain tool wrapper for the scraper module."""
import asyncio
from langchain.tools import tool
from loguru import logger
from modules.scraper import scrape_and_download


def _run_async(coro):
    """Run an async coroutine from sync context safely."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if loop and loop.is_running():
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as pool:
            return pool.submit(asyncio.run, coro).result()
    else:
        return asyncio.run(coro)


@tool
def download_esg_reports(company_name: str, esg_page_url: str) -> str:
    """Scrape the ESG page to find PDF links and download them.
    Inputs: company_name, esg_page_url (from discover_esg_page tool).
    Returns: summary of downloaded files."""
    logger.info(f"[TOOL] download_esg_reports called for: {company_name}")
    results = _run_async(scrape_and_download(company_name, esg_page_url))
    if not results:
        return f"No ESG PDF reports found on {esg_page_url}"
    summary = "\n".join([f"- {r['title']} -> {r['local_path']}" for r in results])
    return f"Downloaded {len(results)} report(s):\n{summary}"
