from greenorb_worker.metrics import match_metric
from greenorb_worker.pdf import open_document
from greenorb_worker.tables import extract_page


def test_label_matching():
    assert match_metric("Total Scope 1 emissions (Break-up of the GHG into CO2, CH4)") == "ghg_scope1"
    assert match_metric("Emissions from Purchased Electricity (Scope 2)*") == "ghg_scope2"
    assert match_metric("Scope 2 (market-based)") == "ghg_scope2_market"
    assert match_metric("Emissions from Indirect Sources (Scope 3)*") == "ghg_scope3"
    assert match_metric("Scope 3 Category 1: Purchased goods") is None
    assert match_metric("Total Scope 1 and Scope 2 emissions per rupee of turnover") is None
    assert match_metric("Other indirect emissions (e.g. third-party transportation)") is None
    assert match_metric("Total energy consumed from renewable sources (A+B+C)") is None
    assert match_metric("Total energy consumed (A+B+C+D+E+F)") == "energy_total"
    assert match_metric("Total volume of water withdrawal (in kilolitres)") == "water_withdrawal"


def test_brsr_table_extraction(brsr_pdf):
    doc = open_document(brsr_pdf)
    cands = extract_page(doc.page(2), doc_year=2024)
    got = {(c.metric, c.fiscal_year): c for c in cands}
    assert got[("ghg_scope1", 2024)].value == 856434
    assert got[("ghg_scope1", 2023)].value == 711746
    assert got[("ghg_scope2", 2024)].value == 83179
    assert got[("ghg_scope2", 2023)].value == 72053
    # the intensity row must not be read as an absolute total
    assert not any(c.metric == "ghg_scope12_total" for c in cands)
    assert all(c.page == 2 and c.grounded for c in cands)
    assert "8,56,434" in got[("ghg_scope1", 2024)].quote
