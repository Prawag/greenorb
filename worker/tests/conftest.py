import sys
from pathlib import Path

import pymupdf
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def make_pdf(pages: list[list[tuple[float, float, str]]]) -> bytes:
    """Build a PDF where each page is a list of (x, y, text) placements."""
    doc = pymupdf.open()
    for placements in pages:
        page = doc.new_page(width=595, height=842)
        for x, y, text in placements:
            page.insert_text((x, y), text, fontsize=9)
    data = doc.tobytes()
    doc.close()
    return data


@pytest.fixture
def brsr_pdf() -> bytes:
    """A BRSR-style Principle 6 page with wrapped labels, a '-' Scope 1 and Indian digit grouping."""
    table = [
        (40, 60, "6. Provide details of greenhouse gas emissions (Scope 1 and Scope 2 emissions) & its intensity:"),
        (360, 90, "FY 2023-24"), (460, 90, "FY 2022-23"),
        (40, 100, "Parameter"), (200, 100, "Unit"),
        (40, 120, "Total Scope 1 emissions (Break-up of the GHG into CO2,"),
        (200, 126, "Metric tonnes of CO2e"), (360, 126, "8,56,434"), (460, 126, "7,11,746"),
        (40, 132, "CH4, N2O, HFCs, PFCs, SF6, NF3, if available)"),
        (40, 150, "Total Scope 2 emissions (Break-up of the GHG into CO2,"),
        (200, 156, "Metric tonnes of CO2e"), (360, 156, "83,179"), (460, 156, "72,053"),
        (40, 162, "CH4, N2O, HFCs, PFCs, SF6, NF3, if available)"),
        (40, 185, "Total Scope 1 and Scope 2 emissions per rupee of"),
        (200, 191, "tCO2e/crore"), (360, 191, "19.06"), (460, 191, "22.65"),
        (40, 197, "turnover"),
        (40, 220, "Note: Indicate if any independent assessment/evaluation/assurance has been carried out by an external agency? (Y/N)"),
        (40, 232, "No independent assessment/evaluation/assurance has been carried out by any external agencies."),
        (40, 270, "Our goal is to become net zero by 2050 across our operations."),
    ]
    cover = [(40, 80, "Business Responsibility and Sustainability Report"),
             (40, 100, "Financial Year for which reporting is being done: 2023-24")]
    return make_pdf([cover, table])
