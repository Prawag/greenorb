from googlesearch import search
try:
    for j in search('Apple ESG report 2024 filetype:pdf', num_results=10, sleep_interval=2):
        print(j)
except Exception as e:
    print(f'Error: {e}')
