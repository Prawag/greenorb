"""Extraction Module: Playwright scraper to find and download ESG PDFs."""
import asyncio
import hashlib
import re
from pathlib import Path
from typing import List
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup
from loguru import logger
from playwright.async_api import async_playwright, TimeoutError as PWTimeout

from core.config import settings

PDF_RELEVANCE_PATTERNS = [
    r"sustain", r"esg", r"csr", r"environment", r"responsib",
    r"annual.?report", r"impact", r"climate", r"scope", r"ghg"
]

COOKIE_BUTTON_SELECTORS = [
    "button:has-text('Accept')",
    "button:has-text('Accept All')",
    "button:has-text('I Accept')",
    "button:has-text('Agree')",
    "button:has-text('Got it')",
    "[id*='cookie'] button",
    "[class*='cookie'] button",
    "[id*='consent'] button",
]


def is_esg_pdf_link(href: str, link_text: str) -> bool:
    """Return True if this link likely points to an ESG PDF report."""
    combined = (href + " " + link_text).lower()
    return href.lower().endswith(".pdf") and any(
        re.search(p, combined) for p in PDF_RELEVANCE_PATTERNS
    )


async def dismiss_cookie_banner(page) -> None:
    """Try each cookie button selector and click the first one found."""
    for selector in COOKIE_BUTTON_SELECTORS:
        try:
            btn = page.locator(selector).first
            if await btn.is_visible(timeout=2000):
                await btn.click()
                logger.debug(f"Dismissed cookie banner with selector: {selector}")
                await asyncio.sleep(1)
                return
        except Exception:
            continue


async def find_pdf_links_on_page(url: str) -> List[dict]:
    """Navigate to url with Playwright, dismiss cookies, extract all PDF links."""
    pdf_links = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (compatible; ESGBot/1.0; +https://yourorg.com/bot)"
        )
        page = await context.new_page()
        try:
            await page.goto(url, wait_until="networkidle", timeout=30000)
            await dismiss_cookie_banner(page)
            await asyncio.sleep(2)
            html = await page.content()
            soup = BeautifulSoup(html, "lxml")
            for a_tag in soup.find_all("a", href=True):
                href = a_tag["href"].strip()
                text = a_tag.get_text(strip=True)
                absolute_href = urljoin(url, href)
                if is_esg_pdf_link(href, text):
                    score = sum(
                        1 for pat in PDF_RELEVANCE_PATTERNS
                        if re.search(pat, (href + text).lower())
                    )
                    pdf_links.append({"href": absolute_href, "text": text, "score": score})
        except PWTimeout:
            logger.warning(f"Playwright timed out on {url}")
        except Exception as e:
            logger.error(f"Scraper error on {url}: {e}")
        finally:
            await browser.close()
    pdf_links.sort(key=lambda x: x["score"], reverse=True)
    logger.info(f"Found {len(pdf_links)} ESG PDF links on {url}")
    return pdf_links


def compute_file_hash(path: Path) -> str:
    sha256 = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


def build_local_filename(company_name: str, url: str, industry: str = "Unknown") -> Path:
    year_match = re.search(r"(20\d{2})", url)
    year = year_match.group(1) if year_match else "unknown"
    safe_company = re.sub(r"[^a-zA-Z0-9]", "_", company_name.lower())
    safe_industry = re.sub(r"[^a-zA-Z0-9]", "_", industry.lower())
    filename = f"{year}_esg.pdf"
    return settings.download_dir / safe_industry / safe_company / filename


async def download_pdf(url: str, dest_path: Path) -> bool:
    """Download a PDF using httpx with realistic headers, falling back to Playwright on 403."""
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    
    HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "application/pdf,application/octet-stream,*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": url,
    }
    
    # Attempt 1: httpx with real browser headers (fast, works for most)
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=90) as client:
            async with client.stream("GET", url, headers=HEADERS) as response:
                if response.status_code == 403:
                    logger.info(f"Got 403 on httpx, trying Playwright fallback for {url}")
                    raise Exception("403 — try Playwright")
                response.raise_for_status()
                with open(dest_path, "wb") as f:
                    async for chunk in response.aiter_bytes(chunk_size=8192):
                        f.write(chunk)
        # Validate it's actually a PDF
        if dest_path.stat().st_size < 5000:
            logger.warning(f"File too small ({dest_path.stat().st_size} bytes), likely not a PDF: {url}")
            dest_path.unlink()
            return False
        with open(dest_path, "rb") as f:
            magic = f.read(5)
        if magic != b'%PDF-':
            logger.warning(f"Not a valid PDF (magic bytes: {magic!r}): {url}")
            dest_path.unlink()
            return False
        size_mb = dest_path.stat().st_size / (1024 * 1024)
        logger.info(f"Downloaded {dest_path.name} ({size_mb:.2f} MB) via httpx")
        return True
    except Exception as e:
        if dest_path.exists():
            dest_path.unlink()
        if "403" not in str(e):
            logger.error(f"Download failed for {url}: {e}")
            return False
    
    # Attempt 2: Playwright fallback for 403 sites
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent=HEADERS["User-Agent"],
                accept_downloads=True
            )
            page = await context.new_page()
            response = await page.goto(url, wait_until="load", timeout=60000)
            if response and response.status == 200:
                body = await response.body()
                if len(body) > 10000 and body[:5] == b'%PDF-':
                    with open(dest_path, "wb") as f:
                        f.write(body)
                    size_mb = dest_path.stat().st_size / (1024 * 1024)
                    logger.info(f"Downloaded {dest_path.name} ({size_mb:.2f} MB) via Playwright fallback")
                    await browser.close()
                    return True
            await browser.close()
        return False
    except Exception as e:
        logger.error(f"Playwright fallback also failed for {url}: {e}")
        if dest_path.exists():
            dest_path.unlink()
        return False


async def scrape_and_download(company_name: str, esg_page_url: str, industry: str = "Unknown") -> List[dict]:
    """Full workflow: visit page -> find PDFs -> download each -> return metadata."""
    
    pdf_links = []
    # If the URL is already a direct PDF link (or a known PDF endpoint), bypass HTML parsing
    if esg_page_url.lower().endswith('.pdf') or "binary" in esg_page_url.lower() or "uploads" in esg_page_url.lower():
        pdf_links = [{"href": esg_page_url, "text": f"{company_name} ESG Report", "score": 100}]
        logger.info(f"Direct PDF detected: {esg_page_url}")
    else:
        pdf_links = await find_pdf_links_on_page(esg_page_url)
        
    if not pdf_links:
        logger.warning(f"No ESG PDFs found on {esg_page_url}")
        return []
    results = []
    for link in pdf_links[:3]:
        dest = build_local_filename(company_name, link["href"], industry)
        success = await download_pdf(link["href"], dest)
        if success:
            results.append({
                "local_path": str(dest),
                "source_url": link["href"],
                "content_hash": compute_file_hash(dest),
                "title": link["text"] or dest.stem
            })
        await asyncio.sleep(settings.request_delay_seconds)
    return results
