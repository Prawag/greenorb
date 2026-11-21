"""Script to fetch S&P 500 companies from Wikipedia and ingest into database."""
import os
import sys
import uuid
from loguru import logger
from bs4 import BeautifulSoup
import httpx

# Ensure we can import from core
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.database import SessionLocal
from core.models import Company

WIKI_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"

def fetch_sp500():
    logger.info("Fetching S&P 500 companies from Wikipedia...")
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    response = httpx.get(WIKI_URL, headers=headers)
    response.raise_for_status()
    
    soup = BeautifulSoup(response.text, 'lxml')
    table = soup.find('table', {'id': 'constituents'})
    
    companies = []
    for row in table.find_all('tr')[1:]:  # Skip header
        cols = row.find_all('td')
        if len(cols) >= 4:
            ticker = cols[0].text.strip()
            name = cols[1].text.strip()
            industry = cols[3].text.strip()
            # Try to build a basic domain based on the name (just a heuristic, won't be perfect)
            # A real system might use Clearbit API, but we're going zero-cost.
            clean_name = name.lower().replace(" ", "").replace(",", "").replace(".", "").replace("inc", "").replace("corp", "").replace("company", "")
            domain = f"{ticker.lower()}.com"
            
            companies.append({
                "name": name,
                "domain": domain,
                "industry": industry,
                "country": "USA"
            })
            
    logger.info(f"Successfully parsed {len(companies)} companies.")
    return companies

NIFTY_WIKI_URL = "https://en.wikipedia.org/wiki/NIFTY_50"

def fetch_nifty50():
    logger.info("Fetching NIFTY 50 companies from Wikipedia...")
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    response = httpx.get(NIFTY_WIKI_URL, headers=headers)
    response.raise_for_status()
    
    soup = BeautifulSoup(response.text, 'lxml')
    table = soup.find('table', {'id': 'constituents'})
    
    companies = []
    if table:
        for row in table.find_all('tr')[1:]:  # Skip header
            cols = row.find_all('td')
            if len(cols) >= 3:
                name = cols[0].text.strip()
                ticker = cols[1].text.strip()
                industry = cols[2].text.strip()
                
                domain = f"{ticker.lower().replace('.ns', '')}.com"
                
                companies.append({
                    "name": name,
                    "domain": domain,
                    "industry": industry,
                    "country": "India"
                })
                
    logger.info(f"Successfully parsed {len(companies)} NIFTY 50 companies.")
    return companies

def ingest_companies(companies):
    db = SessionLocal()
    added = 0
    try:
        for c in companies:
            # Check if domain exists to prevent duplicates
            existing = db.query(Company).filter(Company.name == c["name"]).first()
            if not existing:
                db.add(Company(
                    id=uuid.uuid4(),
                    name=c["name"],
                    domain=c["domain"],
                    industry=c["industry"],
                    country=c["country"]
                ))
                added += 1
        db.commit()
        logger.success(f"Ingested {added} new companies into the database.")
    except Exception as e:
        logger.error(f"Error during ingestion: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    companies = fetch_sp500()
    ingest_companies(companies)
    
    nifty_companies = fetch_nifty50()
    ingest_companies(nifty_companies)
