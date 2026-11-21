from modules.pdf_parser import parse_pdf_full
from modules.analyst import filter_relevant_pages

pdf_path = r'downloads\technology_hardware__storage___peripherals\apple_inc_\Apple Inc. - 2024 of ESG report.pdf'
blocks = parse_pdf_full(pdf_path)
filtered = filter_relevant_pages(blocks, context_window=0)
for b in filtered:
    print(f"--- Page {b['page']} ({b['source']}) ---")
    print(b['text'][:500] + '...\n')
