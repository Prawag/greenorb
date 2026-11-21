import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()
conn = psycopg2.connect(os.environ['DATABASE_URL'])
cur = conn.cursor()

cur.execute("SELECT COUNT(*) FROM esg_companies")
total_companies = cur.fetchone()[0]

cur.execute("SELECT COUNT(DISTINCT company_id) FROM esg_documents")
companies_with_docs = cur.fetchone()[0]

cur.execute("SELECT COUNT(DISTINCT d.company_id) FROM esg_documents d JOIN esg_extracted_values e ON d.id = e.document_id")
companies_with_data = cur.fetchone()[0]

print(f"Total Companies: {total_companies}")
print(f"Companies with Downloaded PDFs: {companies_with_docs}")
print(f"Companies with Extracted Data: {companies_with_data}")
