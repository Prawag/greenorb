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
    # 1. Fetch all companies in a short-lived session, prioritizing Indian companies
    db_init = SessionLocal()
    try:
        from sqlalchemy import case
        # Process India first, then everything else
        companies_data = db_init.query(Company).order_by(
            case((Company.country == 'India', 0), else_=1)
        ).all()
        # Keep just the essential data to avoid detached instance errors
        companies = [{"id": c.id, "name": c.name, "domain": c.domain, "industry": c.industry, "country": c.country} for c in companies_data]
    finally:
        db_init.close()

    logger.info(f"Found {len(companies)} companies in DB to process (Indian prioritized).")
    
    for comp in companies:
        db = SessionLocal()
        try:
            # Check if this company already has documents
            existing_docs = db.query(Document).filter(Document.company_id == comp["id"]).count()
            if existing_docs > 0:
                logger.info(f"Skipping {comp['name']} - already has {existing_docs} documents.")
                continue
                
            logger.info(f"Processing: {comp['name']} (Country: {comp.get('country')}, Industry: {comp['industry']})")
            
            # 1. Discover Candidate URLs
            from modules.discovery import search_esg_urls
            # If it's an Indian company, search specifically for BRSR (Business Responsibility and Sustainability Report)
            search_query = f"{comp['name']} BRSR" if comp.get("country") == "India" else comp['name']
            candidates = search_esg_urls(search_query)
            
            # Also add domain-based paths using the REAL domain from the DB
            if comp['domain'] and not candidates:
                domain = comp['domain'].replace("www.", "")
                domain_paths = [
                    f"https://www.{domain}/sustainability",
                    f"https://www.{domain}/esg",
                    f"https://www.{domain}/corporate-responsibility",
                    f"https://www.{domain}/about-us/sustainability"
                ]
                for path in domain_paths:
                    candidates.append({"url": path, "title": "Domain Fallback", "score": 5})

            # 2. Try scraping and downloading
            downloads = []
            for candidate in candidates:
                logger.info(f"Scraping {candidate['url']} for PDFs...")
                downloads = await scrape_and_download(comp['name'], candidate["url"], comp['industry'])
                if downloads:
                    logger.info(f"Success! Found PDFs at {candidate['url']}")
                    break
                else:
                    logger.info(f"No PDFs at {candidate['url']}, trying next candidate...")

            if not downloads:
                logger.warning(f"No PDFs downloaded for {comp['name']}.")
            else:
                # 3. Save metadata to database
                for dl in downloads:
                    existing = db.query(Document).filter(
                        Document.company_id == comp["id"],
                        Document.content_hash == dl["content_hash"]
                    ).first()
                    
                    if not existing:
                        import uuid
                        doc = Document(
                            id=uuid.uuid4(),
                            company_id=comp["id"],
                            url=dl["source_url"],
                            title=dl["title"],
                            report_type="sustainability_report",
                            local_path=dl["local_path"],
                            content_hash=dl["content_hash"]
                        )
                        db.add(doc)
                
                db.commit()
                logger.success(f"Saved {len(downloads)} documents for {comp['name']} to DB.")
                
        except Exception as e:
            logger.error(f"Error processing {comp['name']}: {e}")
            db.rollback()
        finally:
            db.close()
            
        # Random delay to prevent IP bans
        import random
        delay = random.uniform(3, 7)
        logger.info(f"Sleeping for {delay:.2f} seconds to avoid bans...")
        await asyncio.sleep(delay)

if __name__ == "__main__":
    asyncio.run(mass_collect())
