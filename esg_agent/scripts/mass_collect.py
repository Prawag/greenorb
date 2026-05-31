"""Mass ESG Document Collector.
Iterates through all companies in the DB, finds ESG PDFs, downloads them, and saves metadata.
Does NOT run the LLM extraction phase to save costs.
"""
import os
import sys
import asyncio
import random
import uuid
from loguru import logger

# Ensure we can import from core
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.database import SessionLocal
from core.models import Company, Document
from modules.discovery import find_best_esg_url
from modules.scraper import scrape_and_download

async def mass_collect():
    db = SessionLocal()
    try:
        companies = db.query(Company).all()
        logger.info(f"Found {len(companies)} companies in DB to process.")
        
        for company in companies:
            # Check if this company already has documents
            existing_docs = db.query(Document).filter(Document.company_id == company.id).count()
            if existing_docs > 0:
                logger.info(f"Skipping {company.name} - already has {existing_docs} documents.")
                continue
                
            logger.info(f"Processing: {company.name} (Domain: {company.domain}, Industry: {company.industry})")
            
            # 1. Discover Candidate URLs (known direct links first, then domain-based)
            from modules.discovery import search_esg_urls
            candidates = search_esg_urls(company.name)
            
            # Also add domain-based paths using the REAL domain from the DB
            if company.domain and not candidates:
                domain = company.domain.replace("www.", "")
                domain_paths = [
                    f"https://www.{domain}/sustainability",
                    f"https://www.{domain}/esg",
                    f"https://www.{domain}/corporate-responsibility",
                    f"https://www.{domain}/about/sustainability",
                ]
                for dp in domain_paths:
                    candidates.append({"url": dp, "title": f"Domain-based URL for {company.name}", "score": 15})
            
            if not candidates:
                logger.warning(f"No ESG URL found for {company.name}.")
                await asyncio.sleep(random.uniform(1, 2))
                continue
                
            # 2. Scrape and Download (Try top 3 candidates only for speed)
            downloads = []
            for candidate in candidates[:3]:
                esg_url = candidate["url"]
                logger.info(f"Scraping {esg_url} for PDFs...")
                downloads = await scrape_and_download(company.name, esg_url, company.industry or "Unknown")
                if downloads:
                    logger.info(f"Success! Found PDFs at {esg_url}")
                    break
                else:
                    logger.info(f"No PDFs at {esg_url}, trying next candidate...")

            
            if not downloads:
                logger.warning(f"No PDFs downloaded for {company.name}.")
            else:
                # 3. Store metadata in DB
                for dl in downloads:
                    # Check for duplicate hash
                    existing = db.query(Document).filter(
                        Document.company_id == company.id,
                        Document.content_hash == dl["content_hash"]
                    ).first()
                    
                    if not existing:
                        doc = Document(
                            id=uuid.uuid4(),
                            company_id=company.id,
                            url=dl["source_url"],
                            title=dl["title"],
                            report_type="sustainability_report", # Best guess
                            local_path=dl["local_path"],
                            content_hash=dl["content_hash"]
                        )
                        db.add(doc)
                
                db.commit()
                logger.success(f"Saved {len(downloads)} documents for {company.name} to DB.")
                
            # Random delay to prevent IP bans
            delay = random.uniform(3, 7)
            logger.info(f"Sleeping for {delay:.2f} seconds to avoid bans...")
            await asyncio.sleep(delay)
            
    except Exception as e:
        logger.error(f"Mass collection failed: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(mass_collect())
