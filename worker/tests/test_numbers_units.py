import pytest

from greenorb_worker.numbers import detect_locale, detect_report_year, find_periods, parse_number, parse_period
from greenorb_worker.units import match_unit


@pytest.mark.parametrize("raw,locale,expected", [
    ("3,289.5", "us", 3289.5),
    ("8,56,434", "us", 856434),          # Indian lakh grouping
    ("12,34,56,789.5", "us", 123456789.5),
    ("1.234.567,89", "us", 1234567.89),  # unambiguous European
    ("1.234", "eu", 1234),
    ("1.234", "us", 1.234),
    ("1 234 567", "us", 1234567),
    ("164,236¹", "us", 164236),          # footnote marker
    ("(1,200)", "us", -1200),
    ("15000", "us", 15000),              # the v3 bug multiplied anything containing "000" by 1000
    ("-", "us", None), ("NA", "us", None), ("Nil", "us", None), ("Not applicable", "us", None), ("abc", "us", None),
])
def test_parse_number(raw, locale, expected):
    assert parse_number(raw, locale) == expected


@pytest.mark.parametrize("token,year", [
    ("FY23", 2023), ("FY2024-25", 2025), ("FY 2023-24", 2024), ("2021-22", 2022), ("F.Y. 2023–2024", 2024), ("CY2022", 2022), ("2023", 2023),
])
def test_parse_period(token, year):
    assert parse_period(token)[0] == year


def test_find_periods_tolerates_glued_footnotes():
    assert [y for y, _ in find_periods("FY 2024-2552 FY 2023-2453")] == [2025, 2024]


def test_detect_locale():
    assert detect_locale("1.234.567,89 and 2.345,6 and 3,5% and 12,1%") == "eu"
    assert detect_locale("1,234,567.89 and 2,345.6 and 3.5%") == "us"


def test_report_year_from_brsr_statement():
    assert detect_report_year(["Financial Year for which reporting is being done: 2023-24"])[0] == 2024


@pytest.mark.parametrize("text,family,factor", [
    ("Metric tonnes of CO2 equivalent", "ghg", 1),
    ("MT CO2e", "ghg", 1),                 # BRSR: MT = metric tonnes, NOT megatonnes
    ("MtCO2e", "ghg", 1e6),               # Mt = megatonnes
    ("Million tonnes CO2e", "ghg", 1e6),
    ("Emissions Category (MMT CO2e)", "ghg", 1e6),
    ("ktCO2e", "ghg", 1e3),
    ("'000 tCO2e", "ghg", 1e3),
    ("kg CO2e", "ghg", 1e-3),
    ("GJ", "energy", 0.277777778),
    ("Giga Joules", "energy", 0.277777778),
    ("PJ", "energy", 277777.778),
    ("MWh", "energy", 1),
    ("kWh", "energy", 1e-3),
    ("kilolitres", "water", 1),
    ("Megalitres", "water", 1000),
    ("ML", "water", 1000),
    ("m³", "water", 1),
    ("metric tonnes", "waste", 1),
])
def test_units(text, family, factor):
    u = match_unit(text, family)
    assert u is not None and u.factor == pytest.approx(factor)


def test_mt_is_flagged_ambiguous():
    assert match_unit("MT CO2e", "ghg").ambiguous
    assert not match_unit("Metric tonnes", "ghg").ambiguous


def test_template_phrase_is_not_a_unit():
    assert match_unit("Details of total energy consumption (in Joules or multiples)", "energy") is None
