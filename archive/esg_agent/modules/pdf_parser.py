"""PDF text + table extraction using PyMuPDF, Camelot, pytesseract."""
import fitz  # PyMuPDF
import io
from pathlib import Path
from typing import List
from PIL import Image
from loguru import logger

MIN_CHARS_FOR_TEXT_LAYER = 50


def extract_text_from_pdf(pdf_path: str) -> List[dict]:
    """Extract text page-by-page. Falls back to OCR if text is sparse."""
    doc = fitz.open(pdf_path)
    pages = []
    for page_num, page in enumerate(doc, start=1):
        text = page.get_text("text").strip()
        had_ocr = False
        if len(text) < MIN_CHARS_FOR_TEXT_LAYER:
            logger.debug(f"Page {page_num}: sparse text ({len(text)} chars), running OCR")
            try:
                import pytesseract
                pix = page.get_pixmap(dpi=300)
                img_bytes = pix.tobytes("png")
                img = Image.open(io.BytesIO(img_bytes))
                text = pytesseract.image_to_string(img, lang="eng")
                had_ocr = True
            except Exception as e:
                logger.warning(f"OCR failed for page {page_num}: {e}")
        if text.strip():
            pages.append({"page": page_num, "text": text, "had_ocr": had_ocr})
    doc.close()
    logger.info(f"Extracted text from {len(pages)} pages in {Path(pdf_path).name}")
    return pages


def extract_tables_from_pdf(pdf_path: str) -> List[dict]:
    """Extract tables using pdfplumber and convert to Markdown immediately."""
    tables_data = []
    try:
        import pdfplumber
        with pdfplumber.open(pdf_path) as pdf:
            for page_num, page in enumerate(pdf.pages, start=1):
                tables = page.extract_tables()
                for i, table in enumerate(tables):
                    if not table:
                        continue
                    # Convert to Markdown
                    md_rows = []
                    for row in table:
                        # Clean cell text (remove newlines inside cells)
                        clean_row = [str(cell).replace("\n", " ").strip() if cell else "" for cell in row]
                        md_rows.append("| " + " | ".join(clean_row) + " |")
                    
                    if len(md_rows) > 1:
                        # Add markdown separator after header
                        header_cols = len(table[0])
                        separator = "| " + " | ".join(["---"] * header_cols) + " |"
                        md_rows.insert(1, separator)
                        
                    md_table = "\n".join(md_rows)
                    tables_data.append({
                        "page": page_num,
                        "table_index": i,
                        "text": f"[TABLE Page {page_num}]\n{md_table}"
                    })
        logger.info(f"Extracted {len(tables_data)} markdown tables via pdfplumber")
    except Exception as e:
        logger.warning(f"pdfplumber table extraction failed for {pdf_path}: {e}")

    return tables_data



def parse_pdf_full(pdf_path: str) -> List[dict]:
    """Main entry: extract all text + tables from PDF."""
    all_blocks = []
    page_texts = extract_text_from_pdf(pdf_path)
    for p in page_texts:
        all_blocks.append({
            "page": p["page"],
            "text": p["text"],
            "source": "ocr" if p["had_ocr"] else "text"
        })
    tables = extract_tables_from_pdf(pdf_path)
    for t in tables:
        all_blocks.append({"page": t["page"], "text": t["text"], "source": "table"})
    all_blocks.sort(key=lambda x: (x["page"], x["source"] != "table"))
    return all_blocks
