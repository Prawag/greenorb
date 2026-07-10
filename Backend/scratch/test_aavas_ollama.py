import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.stdout.reconfigure(encoding='utf-8')
import requests
import re
from process_esg_reports import extract_text_from_pdf

pdf_path = os.path.join("downloaded_reports", "aavas_financiers_ltd._sustainability_report_2024.pdf")
text = extract_text_from_pdf(pdf_path)

if len(text) > 50000:
    text = text[:50000]

def get_tag_content(tag_name):
    match = re.search(f"<{tag_name}>(.*?)</{tag_name}>", text, re.DOTALL)
    return match.group(1).strip() if match else ""
    
cover = get_tag_content("cover_page")
financials = get_tag_content("financials")
emissions = get_tag_content("emissions")
operations = get_tag_content("operations")

# If XML tags are not found, default to full text
if not cover and not financials and not emissions and not operations:
    cover = text
    financials = text
    emissions = text
    operations = text

prompt_1 = (
    "You are an expert ESG Data Analyst specializing in extracting financial and sustainability metrics from corporate reports.\n"
    "Carefully read the text and extract ONLY the requested keys into a flat JSON object. Return clean numbers as numbers (no commas, no text suffixes, e.g. 1500000 instead of 1,500,000 or 1.5M).\n"
    "If a value is not found, return null. Do not include any explanation or conversational text.\n"
    "Treat Markdown tables as the primary source of truth for numeric values. Note that table cells may contain '<br>' tags for formatting; ignore these when matching text.\n\n"
    "JSON Format:\n"
    "{\n"
    '  "company_name": "Full name of the company",\n'
    '  "report_year": 2024,\n'
    '  "revenue": 10000000,\n'
    '  "profit": 500000,\n'
    '  "esg_grade": "AAA or AA or A etc.",\n'
    '  "net_zero_target": "Year of net zero target (e.g. 2050)"\n'
    "}\n\n"
    f"Text:\n{cover}\n\n{financials}"
)

prompt_2 = (
    "You are an expert ESG Data Analyst specializing in extracting carbon emissions and resources metrics from corporate reports.\n"
    "Carefully read the text and extract ONLY the requested keys into a flat JSON object. Return clean numbers as float/int numbers (no commas, no text suffixes, e.g. 2746.2 instead of 2,746.20). \n"
    "If a value is not found, return null. Do not include any explanation or conversational text.\n"
    "Treat Markdown tables as the primary source of truth for numeric values. Note that table cells may contain '<br>' tags for formatting; ignore these when matching text.\n"
    "Be careful to extract the values for the target report year. For example, if a table has columns 'FY 2024-25' and 'FY 2023-24', and the report year is 2024, match values from the 'FY 2024-25' column.\n\n"
    "JSON Format:\n"
    "{\n"
    '  "co2_estimate": 123.45,\n'
    '  "scope_1": 100.0,\n'
    '  "scope_2": 20.0,\n'
    '  "scope_3": 3.0,\n'
    '  "water_withdrawal": 5000,\n'
    '  "energy_consumption": 25000\n'
    "}\n\n"
    f"Text:\n{cover}\n\n{emissions}"
)

def run(pass_num, prompt):
    body = {
        "model": "llama3",
        "prompt": prompt,
        "stream": False,
        "format": "json",
        "options": {
            "temperature": 0.1,
            "repeat_penalty": 1.1,
            "num_ctx": 8192
        }
    }
    print(f"\n--- Running Pass {pass_num} ---")
    try:
        res = requests.post("http://localhost:11434/api/generate", json=body, timeout=300)
        print("Status:", res.status_code)
        print("Response:")
        print(res.json().get("response", ""))
    except Exception as e:
        print("Error:", e)

run(1, prompt_1)
run(2, prompt_2)
