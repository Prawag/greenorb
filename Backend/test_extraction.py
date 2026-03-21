"""Test the new Markdown-aware Map-Reduce extraction on Microsoft's report."""
import sys, os
sys.path.insert(0, '.')
from esg_discovery_agent import process_single_pdf

# Ensure we are in the Backend directory
pdf_path = r'C:\Users\prawa\Desktop\GreenOrb\RawData\2025-Microsoft-Environmental-Sustainability-Report.pdf'

if not os.path.exists(pdf_path):
    print(f"❌ File not found: {pdf_path}")
    # Try to find it in Processed
    pdf_path = r'C:\Users\prawa\Desktop\GreenOrb\RawData\ESG_Reports\Processed\2025-Microsoft-Environmental-Sustainability-Report.pdf'
    if not os.path.exists(pdf_path):
        print(f"❌ File still not found. Check RawData directory.")
        sys.exit(1)

print(f"🚀 Starting test on: {pdf_path}")
success = process_single_pdf(pdf_path)

if success:
    print("\n✅ Extraction complete. Check database and JSON results.")
else:
    print("\n❌ Extraction failed.")
