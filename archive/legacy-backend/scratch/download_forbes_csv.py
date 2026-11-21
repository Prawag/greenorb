import urllib.request
import os

url = "https://raw.githubusercontent.com/ShadyVoidz/Forbes-2000-Analysis-Project/main/Forbes_2000_top_company_CLNQ11.csv"
output_path = "scratch/forbes_2000.csv"

try:
    print(f"Downloading Forbes 2000 CSV from {url}...")
    urllib.request.urlretrieve(url, output_path)
    print(f"Downloaded successfully. Size: {os.path.getsize(output_path)} bytes")
    
    with open(output_path, "r", encoding="utf-8") as f:
        for i in range(5):
            print(f.readline().strip())
except Exception as e:
    # Try master branch if main fails
    url_master = "https://raw.githubusercontent.com/ShadyVoidz/Forbes-2000-Analysis-Project/master/Forbes_2000_top_company_CLNQ11.csv"
    try:
        print(f"Retrying with master branch URL: {url_master}...")
        urllib.request.urlretrieve(url_master, output_path)
        print(f"Downloaded successfully. Size: {os.path.getsize(output_path)} bytes")
        
        with open(output_path, "r", encoding="utf-8") as f:
            for i in range(5):
                print(f.readline().strip())
    except Exception as ex:
        print("Failed to download CSV:", ex)
