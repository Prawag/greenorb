import re
import fitz  # PyMuPDF
from pathlib import Path

"""
ESGSchema Matcher — Fingerprints a PDF and matches it against learned schemas.
If a match is found (>= 82% structural similarity), extracts metrics without any LLM call.
"""

ESG_KEYWORDS = [
    "scope 1", "scope 2", "scope 3", "ghg emissions",
    "direct emissions", "indirect emissions", "carbon",
    "energy consumption", "water withdrawal", "waste",
    "brsr", "gri", "tcfd", "sasb", "sustainability report",
    "environmental", "climate"
]


def fingerprint_pdf(pdf_path: str) -> dict:
    """Extract structural fingerprint — section keywords + page numbers. No LLM."""
    doc = fitz.open(pdf_path)
    found = {"total_pages": len(doc), "section_pages": {}}
    for page_num, page in enumerate(doc):
        text = page.get_text().lower()
        for kw in ESG_KEYWORDS:
            if kw in text and kw not in found["section_pages"]:
                found["section_pages"][kw] = page_num + 1
    return found


def find_best_schema(pdf_fingerprint: dict, threshold: float = 0.82) -> tuple[str | None, float]:
    """
    Compare PDF fingerprint against all learned schemas.
    Returns (template_id, confidence) or (None, score) if below threshold.
    """
    from schema.schema_teacher import load_schema, list_all_schemas

    best_id, best_score = None, 0.0
    for template_id in list_all_schemas():
        schema = load_schema(template_id)
        if not schema:
            continue
        stored = schema.get("report_structure", {})
        score = _structural_similarity(pdf_fingerprint, stored)
        if score > best_score:
            best_score, best_id = score, template_id
    return (best_id, best_score) if best_score >= threshold else (None, best_score)


def extract_by_schema(pdf_path: str, schema: dict) -> dict:
    """
    Extract metric values using known page/section coordinates.
    Zero LLM calls. Returns dict of {metric_name: value}.
    """
    doc = fitz.open(pdf_path)
    results = {}
    for metric, location in schema.get("metrics", {}).items():
        if not location or not location.get("page"):
            results[metric] = None
            continue
        page_idx = location["page"] - 1
        if page_idx >= len(doc):
            results[metric] = None
            continue
        page_text = doc[page_idx].get_text()
        row_text = location.get("table_row_text", "")
        value = _find_value_near_text(page_text, row_text, location.get("column_header", ""))
        results[metric] = value
    return results


def _structural_similarity(pdf_struct: dict, stored_struct: dict) -> float:
    """Score how similar two report structures are (0.0–1.0)."""
    pdf_pages   = pdf_struct.get("section_pages", {})
    stored_emit = stored_struct.get("emissions_section_page", 0)
    stored_soc  = stored_struct.get("social_section_page", 0)
    pdf_emit = pdf_pages.get("scope 1", pdf_pages.get("ghg emissions", 0))
    pdf_soc  = pdf_pages.get("social", pdf_pages.get("employee", 0))
    matches = 0
    if abs(pdf_emit - stored_emit) <= 5: matches += 1
    if abs(pdf_soc  - stored_soc)  <= 5: matches += 1
    if abs(pdf_struct.get("total_pages", 0) - stored_struct.get("total_pages", 0)) <= 20:
        matches += 1
    return matches / 3


def _find_value_near_text(page_text: str, row_label: str, column_header: str) -> float | None:
    """Find a numeric value on a page near a known row label. Returns float or None."""
    if not row_label:
        return None
    idx = page_text.lower().find(row_label.lower())
    if idx == -1:
        return None
    # Look in the 200 characters after the row label for a number
    snippet = page_text[idx:idx+200]
    numbers = re.findall(r"[\d,]+(?:\.\d+)?", snippet)
    if not numbers:
        return None
    # Return largest number found (emission values dwarf formatting numbers)
    parsed = []
    for n in numbers:
        try:
            parsed.append(float(n.replace(",", "")))
        except ValueError:
            pass
    return max(parsed) if parsed else None
