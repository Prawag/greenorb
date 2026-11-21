from modules.pdf_parser import extract_text_from_pdf
from modules.analyst import filter_relevant_pages

pdf_path = r'downloads\technology_hardware__storage___peripherals\apple_inc_\Apple Inc. - 2024 of ESG report.pdf'
blocks = extract_text_from_pdf(pdf_path)

# Convert to expected format for analyst
formatted_blocks = [{'page': b['page'], 'text': b['text'], 'source': 'text'} for b in blocks]

filtered = filter_relevant_pages(formatted_blocks, context_window=0)
for b in filtered[:5]: # just the first 5 relevant pages
    print(f"--- Page {b['page']} ---")
    print(b['text'][:1000] + '...\n')
