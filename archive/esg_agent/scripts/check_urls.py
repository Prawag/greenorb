import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()
conn = psycopg2.connect(os.environ['DATABASE_URL'])
cur = conn.cursor()
cur.execute("SELECT COUNT(*) FROM companies WHERE report_url IS NOT NULL AND report_url != '' AND report_url != 'N/A'")
print("Companies with report_url:", cur.fetchone()[0])
