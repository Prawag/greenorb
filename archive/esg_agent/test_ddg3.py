import httpx
from bs4 import BeautifulSoup
import urllib.parse

def search_ddg_html(query):
    url = 'https://html.duckduckgo.com/html/'
    data = {'q': query}
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Content-Type': 'application/x-www-form-urlencoded'
    }
    response = httpx.post(url, data=data, headers=headers)
    print(f"Status: {response.status_code}")
    soup = BeautifulSoup(response.text, 'html.parser')
    for a in soup.find_all('a', class_='result__url'):
        print(a.get('href'))

search_ddg_html('NVIDIA ESG report 2024 filetype:pdf')
