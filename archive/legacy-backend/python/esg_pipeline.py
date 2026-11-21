import os
import re
import json
import base64
import requests
import shutil
import pdfplumber
from crewai.tools import tool
from bs4 import BeautifulSoup
from urllib.parse import urljoin
from pypdf import PdfReader
from pdf2image import convert_from_path
import pytesseract
from crewai import Agent, Task, Crew, Process
from langchain_openai import ChatOpenAI
from openai import OpenAI

@tool("Download Company ESG PDF")
def download_esg_pdf(company_url: str) -> str:
    """Finds and downloads the latest ESG or Sustainability PDF report from a URL. 
    Returns the local file path of the downloaded PDF."""
    
    download_dir = "./downloaded_reports"
    os.makedirs(download_dir, exist_ok=True)
    
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    keywords = ["esg", "sustainability", "environmental", "governance", "csr", "impact", "climate"]
    
    try:
        response = requests.get(company_url, headers=headers, timeout=15)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        for link in soup.find_all('a', href=True):
            href = link['href']
            text = link.get_text().lower()
            
            # Identify if the link points to a PDF and contains ESG context
            if href.endswith('.pdf') and any(kw in text or kw in href.lower() for kw in keywords):
                pdf_url = urljoin(company_url, href)
                filename = re.sub(r'[^\w\-_\.]', '_', pdf_url.split('/')[-1])
                local_path = os.path.join(download_dir, filename)
                
                # Stream the file down to disk
                with requests.get(pdf_url, headers=headers, stream=True) as r:
                    r.raise_for_stdio_status() if hasattr(r, 'raise_for_stdio_status') else r.raise_for_status()
                    with open(local_path, 'wb') as f:
                        for chunk in r.iter_content(chunk_size=8192):
                            f.write(chunk)
                
                return f"SUCCESS: Downloaded report to {local_path}"
                
        return "ERROR: Found the page, but could not locate an ESG PDF link matching keywords."
    except Exception as e:
        return f"ERROR: Failed during download execution: {str(e)}"

@tool("Scrape Text From Local PDF")
def scrape_local_pdf(file_path: str) -> str:
    """Reads a local PDF file from disk and returns its text content for data scraping."""
    clean_path = file_path.replace("SUCCESS: Downloaded report to ", "").strip()
    
    if not os.path.exists(clean_path):
        return f"ERROR: File not found at path: {clean_path}"
        
    try:
        reader = PdfReader(clean_path)
        text_content = []
        
        # Limit pages to prevent hitting LLM context tokens (e.g., first 15 and last 15 pages)
        total_pages = len(reader.pages)
        for i, page in enumerate(reader.pages):
            if i < 20 or i > (total_pages - 10): # Most ESG metrics are at the start or in the appendix
                text = page.extract_text()
                if text:
                    text_content.append(text)
                    
        return "\n--- PAGE BREAK ---\n".join(text_content)
    except Exception as e:
        return f"ERROR: Failed to parse PDF: {str(e)}"

@tool("Tier 2: Backup OCR Image Parser")
def backup_ocr_image_parser(file_path: str) -> str:
    """
    Fallback tool executed only if Tier 1 structural parsers return empty data.
    Converts PDF pages into raw image layers and extracts data via OCR.
    """
    if not os.path.exists(file_path):
        return json.dumps({"error": f"File not found: {file_path}"})
        
    extracted_data = {"scope_1": None, "scope_2": None, "scope_3_disclosed": False}
    
    try:
        # Convert only the standard appendix pages (typically the last 15 pages where performance indices sit)
        images = convert_from_path(file_path, dpi=200)
        target_pages = images[-15:] if len(images) > 15 else images
        
        for idx, img in enumerate(target_pages):
            # Extract raw string blocks along with layout bounding matrices
            ocr_text = pytesseract.image_to_string(img).lower()
            
            # Deterministic alignment tracking
            if "scope 1" in ocr_text or "direct emissions" in ocr_text:
                lines = ocr_text.split('\n')
                for line in lines:
                    if "scope 1" in line and any(u in line for u in ["mt", "tco2", "tonnes"]):
                        numbers = re.findall(r'\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\b', line)
                        if numbers:
                            # Safely capture the metric point discarding the target year digit
                            valid_nums = [float(n.replace(',', '')) for n in numbers if float(n.replace(',', '')) not in [2023.0, 2024.0, 2025.0, 2026.0]]
                            if valid_nums:
                                extracted_data["scope_1"] = valid_nums[0]
                                
            if "scope 2" in ocr_text or "indirect emissions" in ocr_text:
                lines = ocr_text.split('\n')
                for line in lines:
                    if "scope 2" in line and any(u in line for u in ["mt", "tco2", "tonnes"]):
                        numbers = re.findall(r'\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\b', line)
                        if numbers:
                            valid_nums = [float(n.replace(',', '')) for n in numbers if float(n.replace(',', '')) not in [2023.0, 2024.0, 2025.0, 2026.0]]
                            if valid_nums:
                                extracted_data["scope_2"] = valid_nums[0]
                                
        return json.dumps(extracted_data, indent=2)
    except Exception as e:
        return json.dumps({"error": f"Tier 2 OCR Pipeline Failed: {str(e)}"})

@tool("Tier 3: Vision LLM Image Cropper Tool")
def vision_llm_image_cropper(page_image_path: str) -> str:
    """
    Final resort fallback tool. Uses multimodal vision analysis to snapshot,
    read, and isolate complex graphics or nested carbon performance charts.
    """
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    
    # Encode local page snapshot to base64
    with open(page_image_path, "rb") as image_file:
        base64_image = base64.b64encode(image_file.read()).decode('utf-8')
        
    response = client.chat.completions.create(
        model="gpt-4o",
        response_format={ "type": "json_object" },
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Locate the ESG performance data grid. Convert the rows into clean JSON format. Specify the exact keys: 'scope_1_value', 'scope_2_value', 'unit_of_measurement'. If you are not 100% certain of a digit due to image resolution blur, return 'null' for that value."},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{base64_image}"
                        }
                    }
                ]
            }
        ],
        temperature=0.0 # Force zero variability
    )
    return response.choices[0].message.content

@tool("Extract Structural ESG Tables")
def extract_structural_esg_tables(file_path: str) -> str:
    """Extracts structural ESG tables from a PDF to verify contexts and units."""
    clean_path = file_path.replace("SUCCESS: Downloaded report to ", "").strip()
    if not os.path.exists(clean_path):
        return f"ERROR: File not found at path: {clean_path}"
    try:
        reader = PdfReader(clean_path)
        tables_text = []
        for i, page in enumerate(reader.pages):
            # Focus on pages that might contain units like 'Thousands of Tons'
            text = page.extract_text()
            if text and ("ton" in text.lower() or "emission" in text.lower() or "table" in text.lower()):
                tables_text.append(f"Page {i+1}: {text}")
        return "\n--- TABLE DATA ---\n".join(tables_text)
    except Exception as e:
        return f"ERROR: Failed to extract tables: {str(e)}"

@tool("Multiply Numbers")
def multiply_numbers(num1: float, num2: float) -> float:
    """Multiplies two numbers. Use this to scale units (e.g. thousands of tons to base tons)."""
    return float(num1) * float(num2)

@tool("Save Final Report")
def save_final_report(content: str) -> str:
    """Saves the compiled final report to the local file system."""
    with open("final_esg_report.json", "w") as f:
        f.write(content)
    return "SUCCESS: Final report saved to final_esg_report.json"

@tool("Flag Critical Verification")
def flag_critical_verification(company_name: str, metric: str) -> str:
    """Writes a company row to the database with status CRITICAL_VERIFICATION_REQUIRED."""
    db_file = "./mock_database.json"
    record = {"company": company_name, "metric": metric, "status": "CRITICAL_VERIFICATION_REQUIRED"}
    
    data = []
    if os.path.exists(db_file):
        with open(db_file, "r") as f:
            try:
                data = json.load(f)
            except:
                pass
    data.append(record)
    with open(db_file, "w") as f:
        json.dump(data, f, indent=2)
    return f"SUCCESS: Flagged {company_name} for {metric} in mock database."

@tool("Save Failure Screenshot")
def save_failure_screenshot(image_path: str) -> str:
    """Saves a screenshot of the specific page image that failed into the ./audit_failures/ folder."""
    audit_dir = "./audit_failures"
    os.makedirs(audit_dir, exist_ok=True)
    if not os.path.exists(image_path):
        return f"ERROR: Image not found at {image_path}"
    
    filename = os.path.basename(image_path)
    dest_path = os.path.join(audit_dir, f"FAILED_{filename}")
    shutil.copy(image_path, dest_path)
    return f"SUCCESS: Saved failure screenshot to {dest_path}"

@tool("Request Human Verification")
def request_human_verification(alert_message: str, image_path: str) -> str:
    """Sends an automated alert to the user showing the screenshot path and asks for manual input."""
    print(f"\n\n{'='*50}")
    print(f"!!! URGENT HUMAN VERIFICATION REQUIRED !!!")
    print(f"ALERT: {alert_message}")
    print(f"Failure Point Logged At: {image_path}")
    print(f"{'='*50}")
    human_input = input("Please manually enter the true numerical value (or type 'skip'): ")
    return f"HUMAN OVERRIDE VALUE: {human_input}"


@tool("Cross-Verify Raw Data Points")
def cross_verify_raw_data_points(file_path: str, scope_1_to_check: float, scope_2_to_check: float) -> str:
    """
    Independent secondary parsing engine. It reads the source document again
    using a raw text-string matching method to cross-examine values extracted by previous agents.
    """
    if not os.path.exists(file_path):
        return "ERROR: Source file missing for verification."
        
    verification_log = []
    
    with pdfplumber.open(file_path) as pdf:
        for i, page in enumerate(pdf.pages):
            text = page.extract_text()
            if not text:
                continue
                
            text_lower = text.lower()
            lines = text_lower.split("\n")
            
            for line in lines:
                # Look for instances where the extracted number appears alongside different context units
                if str(int(scope_1_to_check)) in line and "scope 1" in line:
                    if "thousand" in line or "million" in line or "kpi" in line:
                        verification_log.append(f"[WARNING Page {i+1}]: Scope 1 value {scope_1_to_check} found, but line context implies scaling multipliers: '{line.strip()}'")
                        
                if str(int(scope_2_to_check)) in line and "scope 2" in line:
                    if "thousand" in line or "million" in line or "kpi" in line:
                        verification_log.append(f"[WARNING Page {i+1}]: Scope 2 value {scope_2_to_check} found, but line context implies scaling multipliers: '{line.strip()}'")

    if not verification_log:
        return "VERIFICATION_PASSED: No unit mismatches or scale anomalies detected in the raw text layers."
        
    return f"VERIFICATION_FAILED:\n" + "\n".join(verification_log)


# Configuration
os.environ["OPENAI_API_KEY"] = "your-api-key-here"
llm = ChatOpenAI(model="gpt-4o", temperature=0.0)

# ----------------------------------------------------
# Define Agents
# ----------------------------------------------------
downloader_agent = Agent(
    role="Web File Retrieval Specialist",
    goal="Locate the target website, identify the sustainability PDF link, and download it safely to local storage.",
    backstory="You are a data retrieval expert. Your only job is to get physical PDF files off websites and onto the local disk.",
    tools=[download_esg_pdf],
    llm=llm,
    verbose=True
)

scraper_agent = Agent(
    role="ESG Document Data Extractor",
    goal="Read downloaded local PDF files and extract precise ESG metrics.",
    backstory="You are a compliance analyst. You take raw text from local files, ignore marketing fluff, and extract target numbers.",
    tools=[scrape_local_pdf, backup_ocr_image_parser, vision_llm_image_cropper],
    llm=llm,
    verbose=True
)

data_auditor_agent = Agent(
    role="The Data Auditor",
    goal="Verify units of extracted ESG data. If units are in thousands or millions, flag it and programmatically adjust them to base units. Execute Strict Isolation Protocol if all data extraction tiers fail.",
    backstory="You are an auditing specialist with a keen eye for units of measurement. You ensure that all reported data is in absolute base numbers before passing it on. If data is totally missing, you are authorized to pull the human-in-the-loop alarm.",
    tools=[extract_structural_esg_tables, multiply_numbers, flag_critical_verification, save_failure_screenshot, request_human_verification],
    llm=llm,
    verbose=True
)

reporting_officer_agent = Agent(
    role="The Reporting Officer",
    goal="Compile the verified outputs, append mathematical proof blocks, and save the final result to the local file system.",
    backstory="You are the final step in the compliance chain. You compile verified numbers and unit conversion proofs into a polished document and save it locally.",
    tools=[save_final_report],
    llm=llm,
    verbose=True
)

cross_checking_auditor_agent = Agent(
    role="Chief ESG Data Auditor & Compliance Officer",
    goal="Ruthlessly cross-examine extracted data against source documents to catch unit scaling issues, typos, and mismatched numbers.",
    backstory="You are a senior forensic auditor. You trust no one's metrics. Your sole job is to break the results of previous agents by proving their numbers are scaled incorrectly or misread from tables.",
    tools=[cross_verify_raw_data_points],
    llm=llm,
    verbose=True
)

# ----------------------------------------------------
# Define Tasks
# ----------------------------------------------------
def execute_pipeline(target_url: str):
    
    download_task = Task(
        description=f"Navigate to {target_url}. Find and download the ESG/Sustainability PDF report using the download tool.",
        expected_output="The exact local file path string where the PDF was saved.",
        agent=downloader_agent
    )

    scrape_task = Task(
        description="Take the file path provided by the downloader agent. Open that local PDF file, scrape its contents, and extract: 1) Scope 1 Emissions, 2) Scope 2 Emissions, 3) Water consumption, 4) Target Net Zero Year.",
        expected_output="A structured JSON object containing the values found and the exact context text as a data validation reference.",
        agent=scraper_agent
    )

    audit_task = Task(
        description="Take the JSON output and the file path. Run the extract_structural_esg_tables tool to verify units context in the PDF. If the JSON shows scope_1 is a small number but the table was titled 'Emissions in Thousands of Tons', flag it and programmatically multiply the number by 1,000 using the math tool before passing it forward. ABSOLUTE FAILURE SCENARIO: If Tier 1, Tier 2, and Tier 3 all failed to find data, execute the Strict Isolation Protocol: 1) Use flag_critical_verification, 2) Use save_failure_screenshot, 3) Use request_human_verification to halt and prompt the user for the true value. Replace the missing data with the human's input.",
        expected_output="A verified JSON object containing unit-adjusted base numbers for the metrics, or human-overridden data if extraction completely failed.",
        agent=data_auditor_agent
    )

    reporting_task = Task(
        description="Compile the verified JSON from the Data Auditor. Append mathematical proof blocks (explaining any unit conversions applied). Finally, use the save_final_report tool to write the result directly to the local file system.",
        expected_output="A confirmation string that the file has been successfully saved locally.",
        agent=reporting_officer_agent
    )

    # Crew brings them together sequentially
    esg_pipeline = Crew(
        agents=[downloader_agent, scraper_agent, data_auditor_agent, reporting_officer_agent],
        tasks=[download_task, scrape_task, audit_task, reporting_task],
        process=Process.sequential
    )

    return esg_pipeline.kickoff()

def run_fully_verified_pipeline(pdf_path: str, original_calculated_json: str):
    """
    Accepts the physical path and the processing footprint output from Agent 2.
    Agent 3 validates it before saving to the final system.
    """
    
    # We parse the data calculated by Agent 2 to set up Agent 3's task variables
    try:
        input_data = json.loads(original_calculated_json)
        s1 = input_data.get("audit_verification_inputs", {}).get("raw_scope_1", 0)
        s2 = input_data.get("audit_verification_inputs", {}).get("raw_scope_2", 0)
    except:
        s1, s2 = 0, 0
    
    audit_task = Task(
        description=f"""
        Review the calculated metrics file for the file: {pdf_path}.
        The previous processing step extracted: Scope 1 = {s1}, Scope 2 = {s2}.
        
        Execute your 'Cross-Verify Raw Data Points' tool to parse the source document again.
        Check if these numbers were caught inside lines mentioning 'thousands', 'millions', or alternative units like 'lbs' or 'kg' instead of Metric Tons (MT/tCO2e).
        """,
        expected_output="""A final Verification Audit Stamp report. It must explicitly declare either:
        1) 'STATUS: VERIFIED' along with a clean final data block, or 
        2) 'STATUS: REJECTED' detailing the exact error or unit conflict that needs recalculation.""",
        agent=cross_checking_auditor_agent
    )

    verification_crew = Crew(
        agents=[cross_checking_auditor_agent],
        tasks=[audit_task],
        process=Process.sequential
    )

    return verification_crew.kickoff()


if __name__ == "__main__":
    # Example execution routing
    # result = execute_pipeline("https://apple.com")
    # agent_2_json_output = '{"audit_verification_inputs": {"raw_scope_1": 100, "raw_scope_2": 200}}'
    # final_audit_report = run_fully_verified_pipeline("./downloaded_reports/company_x.pdf", agent_2_json_output)
    #
    # if "STATUS: REJECTED" in str(final_audit_report):
    #     print("🚨 Audit failed! Initiating self-correction routing workflow...")
    #     # Re-route the task to Agent 1 with Agent 3's warning log attached as a hint
    # else:
    #     print("✅ Audit Passed. Data locked down as 100% accurate.")
    pass
