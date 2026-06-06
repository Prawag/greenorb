from duckduckgo_search import DDGS

def test_ddg():
    with DDGS() as ddgs:
        results = [r for r in ddgs.text('NVIDIA ESG report 2024 filetype:pdf', max_results=3)]
        print(results)

test_ddg()
