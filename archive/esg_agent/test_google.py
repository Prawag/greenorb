from googlesearch import search

def test_google():
    query = 'Apple ESG report 2024 filetype:pdf'
    results = search(query, num_results=3)
    for url in results:
        print(url)

test_google()
