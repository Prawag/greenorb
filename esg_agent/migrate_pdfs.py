from core.database import SessionLocal
from core.models import Document, Company
import os
import re
from pathlib import Path

def migrate_pdf_names():
    db = SessionLocal()
    docs = db.query(Document).join(Company).all()
    count = 0
    for doc in docs:
        if not doc.local_path:
            continue
        old_path = Path(doc.local_path)
        if old_path.exists():
            company_name = doc.company.name
            safe_filename_company = re.sub(r'[\\/*?:"<>|]', '', company_name)
            
            year_match = re.search(r"(20\d{2})", old_path.name)
            year = year_match.group(1) if year_match else "unknown"
            
            new_filename = f"{safe_filename_company} - {year} of ESG report.pdf"
            new_path = old_path.parent / new_filename
            
            if old_path != new_path:
                try:
                    os.rename(old_path, new_path)
                    doc.local_path = str(new_path)
                    doc.title = new_filename
                    count += 1
                except Exception as e:
                    print(f"Failed to rename {old_path}: {e}")
    db.commit()
    db.close()
    print(f"Migrated {count} files")

migrate_pdf_names()
