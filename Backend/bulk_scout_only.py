import sys
import os
import re
import time
import warnings
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
from duckduckgo_search import DDGS

warnings.filterwarnings("ignore")

DOWNLOAD_DIR = "./downloaded_reports"
INTERNAL_API_BASE = os.environ.get('INTERNAL_API_BASE', 'http://localhost:5000')
STATIC_URL_BASE = f"{INTERNAL_API_BASE}/downloaded_reports"
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

# Realistic browser headers to bypass basic bot checks
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}

SESSION = requests.Session()
SESSION.headers.update(HEADERS)


def score_link(href: str, text: str) -> int:
    """Score a link on how likely it is to be a 2024 ESG/sustainability PDF."""
    score = 0
    href_lower = href.lower()
    text_lower = text.lower()

    if ".pdf" in href_lower:
        score += 50
    if "sustainability" in href_lower or "sustainability" in text_lower:
        score += 20
    if "esg" in href_lower or "esg" in text_lower:
        score += 20
    if "report" in href_lower or "report" in text_lower:
        score += 15
    if "2024" in href_lower or "2024" in text_lower:
        score += 30
    if "impact" in href_lower or "impact" in text_lower:
        score += 10
    if "environment" in href_lower or "environment" in text_lower:
        score += 10

    # Penalize old years and noise
    for yr in ["2020", "2021", "2022", "2023"]:
        if yr in href_lower or yr in text_lower:
            score -= 40
    for noise in ["twitter", "linkedin", "facebook", "privacy", "cookie", "terms", "instagram"]:
        if noise in href_lower:
            score -= 100

    return score


def warm_up_session(url: str):
    """Visit the site's homepage to establish a cookie session before downloading."""
    try:
        parsed = urlparse(url)
        homepage = f"{parsed.scheme}://{parsed.netloc}"
        SESSION.get(homepage, timeout=15)
    except Exception:
        pass


def download_pdf(url: str, filepath: str) -> bool:
    """Directly download a PDF from a URL using requests."""
    try:
        # Warm up session cookies from the domain homepage first
        warm_up_session(url)
        resp = SESSION.get(url, timeout=30, allow_redirects=True, stream=True)
        content_type = resp.headers.get("content-type", "").lower()

        if resp.status_code == 200 and ("pdf" in content_type or url.lower().endswith(".pdf")):
            with open(filepath, "wb") as f:
                for chunk in resp.iter_content(chunk_size=8192):
                    f.write(chunk)
            size = os.path.getsize(filepath)
            if size > 10000:  # Must be at least 10KB — reject empty/error pages
                print(f"[OK] Downloaded {size // 1024}KB PDF from: {url}")
                return True
            else:
                os.remove(filepath)
                print(f"[WARN] File too small ({size} bytes), likely an error page.")
                return False
        else:
            print(f"[WARN] Not a PDF (status={resp.status_code}, type={content_type}): {url}")
            return False
    except Exception as e:
        print(f"[WARN] Download failed: {e}")
        return False


def hunt_pdf_on_page(page_url: str) -> str | None:
    """Scrape an IR/sustainability landing page and return the best PDF link."""
    try:
        resp = SESSION.get(page_url, timeout=20)
        if resp.status_code != 200:
            return None
        soup = BeautifulSoup(resp.text, "html.parser")
        best_link = None
        highest_score = 20  # Minimum threshold to qualify

        for a_tag in soup.find_all("a", href=True):
            href = a_tag["href"]
            text = a_tag.get_text(strip=True)
            absolute_url = urljoin(page_url, href)
            s = score_link(absolute_url, text)
            if s > highest_score:
                highest_score = s
                best_link = absolute_url

        if best_link:
            print(f"[HUNT] Link Hunter found: {best_link} (score={highest_score})")
        return best_link
    except Exception as e:
        print(f"[WARN] Page scrape failed: {e}")
        return None


import urllib.parse
import random

PROXIES_POOL = []

def get_free_proxies():
    """Fetch 400+ fresh free proxies from proxyscrape."""
    global PROXIES_POOL
    if PROXIES_POOL:
        return
    try:
        print("[PROXY] Fetching fresh free proxy list...")
        resp = requests.get(
            "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all",
            timeout=10
        )
        if resp.status_code == 200:
            PROXIES_POOL = [p for p in resp.text.splitlines() if p.strip()]
            print(f"[PROXY] Successfully loaded {len(PROXIES_POOL)} proxies.")
    except Exception as e:
        print(f"[WARN] Failed to load proxies: {e}")

def search_for_company(company_name: str) -> str | None:
    """Find the best ESG report URL using Yahoo Search (bypasses IP bans)."""
    queries = [
        f"{company_name} sustainability report 2024 filetype:pdf",
        f"{company_name} ESG report 2024",
    ]

    for query in queries:
        print(f"[SEARCH] Querying Yahoo for: {query}")
        try:
            time.sleep(2)  # Small delay to be polite
            url = f"https://search.yahoo.com/search?p={requests.utils.quote(query)}"
            resp = requests.get(url, headers=HEADERS, timeout=10)
            if resp.status_code == 200:
                soup = BeautifulSoup(resp.text, "html.parser")
                
                # Extract the hidden organic URLs from Yahoo's redirect links
                organic_urls = []
                for a in soup.find_all("a"):
                    href = a.get("href", "")
                    if "RU=" in href:
                        try:
                            # Extract everything between RU= and /RK=
                            real_url = urllib.parse.unquote(href.split("RU=")[1].split("/RK=")[0])
                            if "yahoo.com" not in real_url:
                                organic_urls.append(real_url)
                        except IndexError:
                            continue
                
                # Check for direct PDF matches first
                for r_url in organic_urls:
                    if ".pdf" in r_url.lower():
                        print(f"[FOUND] Yahoo found direct PDF: {r_url}")
                        return r_url
                        
                # If no PDF found on first pass, just return the first good organic result
                if organic_urls:
                    print(f"[FOUND] Yahoo found organic link: {organic_urls[0]}")
                    return organic_urls[0]
                    
        except Exception as e:
            print(f"[WARN] Yahoo search failed for {company_name}: {e}")

    # Fallback to direct domain guessing
    domain = company_name.lower().replace(" ", "").replace("&", "and").replace(",", "").replace(".", "")
    guesses = [
        f"https://www.{domain}.com/sustainability",
        f"https://www.{domain}.com/esg",
        f"https://www.{domain}.com/corporate-responsibility",
    ]
    for guess in guesses:
        try:
            resp = requests.head(guess, headers=HEADERS, timeout=5, allow_redirects=True)
            if resp.status_code == 200:
                print(f"[GUESS] Found live page: {guess}")
                return guess
        except Exception:
            continue

    return None


def main():
    if len(sys.argv) < 2:
        print("Usage: python bulk_scout_only.py <company_name>")
        sys.exit(1)

    company_name = sys.argv[1]
    pdf_filename = f"{company_name.lower().replace(' ', '_').replace('&', 'and')}_sustainability_report_2024.pdf"
    file_path = os.path.join(DOWNLOAD_DIR, pdf_filename)

    # Skip if already downloaded
    if os.path.exists(file_path) and os.path.getsize(file_path) > 10000:
        static_url = f"{STATIC_URL_BASE}/{pdf_filename}"
        print(f"STATIC_URL_RESULT: {static_url}")
        sys.exit(0)

    print(f"[SEARCH] Searching for: {company_name}")
    target_url = search_for_company(company_name)

    if not target_url:
        print(f"[FAIL] No URL found for {company_name}")
        sys.exit(1)

    # Phase 1: Try direct download if it looks like a PDF
    if ".pdf" in target_url.lower():
        if download_pdf(target_url, file_path):
            static_url = f"{STATIC_URL_BASE}/{pdf_filename}"
            print(f"STATIC_URL_RESULT: {static_url}")
            sys.exit(0)

    # Phase 2: Scrape the landing page for a PDF link
    print(f"[SCRAPE] Scraping landing page: {target_url}")
    pdf_link = hunt_pdf_on_page(target_url)

    if pdf_link and ".pdf" in pdf_link.lower():
        if download_pdf(pdf_link, file_path):
            static_url = f"{STATIC_URL_BASE}/{pdf_filename}"
            print(f"STATIC_URL_RESULT: {static_url}")
            sys.exit(0)

    # Phase 3: Try IR/sustainability subpages directly as last resort
    domain_guess = company_name.lower().replace(" ", "").replace("&", "and").replace(",", "").replace(".", "")
    fallback_urls = [
        f"https://www.{domain_guess}.com/sustainability",
        f"https://www.{domain_guess}.com/esg",
        f"https://www.{domain_guess}.com/corporate-responsibility",
        f"https://www.{domain_guess}.com/investor-relations",
    ]
    for fb_url in fallback_urls:
        try:
            fb_pdf = hunt_pdf_on_page(fb_url)
            if fb_pdf and ".pdf" in fb_pdf.lower():
                if download_pdf(fb_pdf, file_path):
                    static_url = f"{STATIC_URL_BASE}/{pdf_filename}"
                    print(f"STATIC_URL_RESULT: {static_url}")
                    sys.exit(0)
        except Exception:
            continue

    print(f"[FAIL] Could not download PDF for {company_name}")
    sys.exit(1)


if __name__ == "__main__":
    main()
