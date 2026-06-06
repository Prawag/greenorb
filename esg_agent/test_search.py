from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup
import time
import urllib.parse

def search_bing(query):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
        page = context.new_page()
        encoded_query = urllib.parse.quote(query)
        url = f'https://www.bing.com/search?q={encoded_query}'
        print(f'Searching: {url}')
        page.goto(url, wait_until='domcontentloaded')
        time.sleep(2)
        html = page.content()
        soup = BeautifulSoup(html, 'html.parser')
        links = []
        for a in soup.find_all('a', href=True):
            href = a['href']
            if href.startswith('http') and '.pdf' in href.lower():
                links.append(href)
        browser.close()
        return list(set(links))

print(search_bing('NVIDIA ESG report 2024 filetype:pdf'))
