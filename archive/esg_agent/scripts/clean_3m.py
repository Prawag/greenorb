import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()
conn = psycopg2.connect(os.environ['DATABASE_URL'])
cur = conn.cursor()
cur.execute("SELECT id, local_path FROM esg_documents WHERE company_id IN (SELECT id FROM esg_companies WHERE name ILIKE '%3M%')")
rows = cur.fetchall()
print('Found:', rows)
if rows:
    cur.execute("DELETE FROM esg_extracted_values WHERE document_id IN (SELECT id FROM esg_documents WHERE company_id IN (SELECT id FROM esg_companies WHERE name ILIKE '%3M%'))")
    cur.execute("DELETE FROM esg_documents WHERE company_id IN (SELECT id FROM esg_companies WHERE name ILIKE '%3M%')")
    conn.commit()
    print('Deleted from DB.')
    for row in rows:
        if os.path.exists(row[1]):
            os.remove(row[1])
            print('Deleted file:', row[1])
