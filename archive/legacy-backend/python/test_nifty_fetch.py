import urllib.request
import csv

url = "https://archives.nseindia.com/content/indices/ind_nifty500list.csv"
try:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    response = urllib.request.urlopen(req)
    lines = [l.decode('utf-8') for l in response.readlines()]
    reader = csv.reader(lines)
    companies = []
    next(reader, None) # Skip header
    for row in reader:
        if len(row) > 2:
            companies.append(row[0]) # Company Name is usually column 0
    
    print(f"Found {len(companies)} rows in NIFTY 500 CSV.")
    print(companies[:10])
except Exception as e:
    print(f"Failed: {e}")
