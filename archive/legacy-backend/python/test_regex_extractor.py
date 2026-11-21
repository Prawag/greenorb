import re
import os
import sys
sys.stdout.reconfigure(encoding='utf-8')
from process_esg_reports import extract_text_from_pdf

def analyze_with_regex(text, filename):
    data = {
        "company_name": "Unknown",
        "report_year": None,
        "co2_estimate": None,
        "esg_grade": "Unknown",
        "products": "Unknown",
        "net_zero_target": "Unknown",
        "sustainability_summary": "Extracted via local NLP/Regex",
        "water_withdrawal": None,
        "energy_consumption": None,
        "supply_chain_budget": None,
        "revenue": None,
        "profit": None,
        "facilities_list": "Unknown",
        "services": "Unknown",
        "production_volume": "Unknown",
        "manufacturing_process": "Unknown",
        "manufacturing_co2": None,
        "lifecycle_co2": "Unknown"
    }

    # Extract company name from filename
    # e.g., adani_ports_and_sez_sustainability_report_2024.pdf -> Adani Ports And Sez
    name_match = re.match(r'^(.*?)_sustainability_report', filename)
    if name_match:
        data["company_name"] = name_match.group(1).replace("_", " ").title()

    # Extract year
    year_match = re.search(r'\b(202[0-9])\b', filename)
    if year_match:
        data["report_year"] = int(year_match.group(1))

    # Extract Net Zero Target (e.g. 2030, 2040, 2050)
    nz_match = re.search(r'(?i)net[\s-]?zero.*?(20[3-5][0-9])', text)
    if nz_match:
        data["net_zero_target"] = nz_match.group(1)

    # Simple regex for CO2 (looking for numbers near 'Scope 1' or 'CO2')
    # This is rudimentary but shows the concept
    co2_match = re.search(r'(?i)(?:Scope 1|CO2).*?([\d,]+\.?\d*)\s*(?:metric tons|MT|tCO2e)', text)
    if co2_match:
        try:
            data["co2_estimate"] = float(co2_match.group(1).replace(',', ''))
        except:
            pass

    # Simple regex for Water
    water_match = re.search(r'(?i)water\s*(?:withdrawal|consumption).*?([\d,]+\.?\d*)', text)
    if water_match:
        try:
            data["water_withdrawal"] = float(water_match.group(1).replace(',', ''))
        except:
            pass
            
    # Simple regex for Revenue
    rev_match = re.search(r'(?i)revenue.*?\$([\d,]+\.?\d*)\s*(million|billion)?', text)
    if rev_match:
        try:
            val = float(rev_match.group(1).replace(',', ''))
            mult = rev_match.group(2)
            if mult and 'billion' in mult.lower(): val *= 1000000000
            elif mult and 'million' in mult.lower(): val *= 1000000
            data["revenue"] = val
        except:
            pass

    return data

def run_test():
    pdf_path = os.path.join("downloaded_reports", "arista_networks_sustainability_report_2024.pdf")
    print(f"Extracting {pdf_path}...")
    text = extract_text_from_pdf(pdf_path)
    print(f"Extracted length: {len(text)} characters.")
    
    if text:
        data = analyze_with_regex(text, os.path.basename(pdf_path))
        import json
        print(json.dumps(data, indent=2))

if __name__ == "__main__":
    run_test()
