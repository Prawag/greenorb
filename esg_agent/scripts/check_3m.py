import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()
conn = psycopg2.connect(os.environ['DATABASE_URL'])
cur = conn.cursor()
cur.execute("SELECT id, url, local_path FROM esg_documents WHERE company_id IN (SELECT id FROM esg_companies WHERE name ILIKE '%3M%')")
print(cur.fetchall())
