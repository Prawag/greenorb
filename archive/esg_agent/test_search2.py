from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup
import time
import urllib.parse

def search_ddg(query):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
        page = context.new_page()
        
        url = 'https://html.duckduckgo.com/html/'
        print(f'Searching DDG: {query}')
        page.goto(url)
        page.fill('#search_form_input_homepage', query)
        page.click('#search_button_homepage')
        page.wait_for_selector('.result__url', timeout=10000)
        
        html = page.content()
        soup = BeautifulSoup(html, 'html.parser')
        links = []
        for a in soup.find_all('a', class_='result__url'):
            href = a.get('href', '')
            if href.startswith('http') and '.pdf' in href.lower():
                links.append(href)
        browser.close()
        return list(set(links))

print(search_ddg('NVIDIA ESG report 2024 filetype:pdf'))
