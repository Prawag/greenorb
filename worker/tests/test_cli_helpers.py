from pathlib import Path

from greenorb_worker.__main__ import company_from_filename, load_seeds, plausible_company
from greenorb_worker.db import name_key


def test_name_key_ignores_brackets_and_legal_form():
    assert name_key("360 ONE WAM LIMITED (“Company” and formerly known as IIFL Wealth Management Limited)") == name_key("360 ONE WAM Ltd.")
    assert name_key("3I Group Plc") == name_key("3I Group")
    assert name_key("3M India Ltd.") != name_key("3M Company")


def test_filename_names_and_junk():
    assert company_from_filename("tata_steel_ltd._sustainability_report_2024") == ("Tata Steel Ltd", 2024)
    assert plausible_company("Tata Steel Ltd.")
    assert plausible_company("3M India Ltd.")
    assert not plausible_company("2025 Q-1,2")
    assert not plausible_company("2024-santanderus-sustainability-report")
    assert not plausible_company("12 34")


def test_load_seeds(tmp_path: Path):
    p = tmp_path / "s.csv"
    p.write_text(
        "# comment\ncompany,country,sector,year,url\n"
        "Acme Ltd,India,Chemicals,2025,https://example.com/a.pdf\n"
        "No Url Co,India,,2024,\n"
        "Bad Scheme,India,,2024,ftp://x/y.pdf\n"
        "Beta plc,,,,https://example.org/b.pdf\n",
        encoding="utf-8",
    )
    rows = load_seeds([p])
    assert [r["company"] for r in rows] == ["Acme Ltd", "Beta plc"]
    assert rows[0]["year"] == 2025 and rows[0]["country"] == "India"
    assert rows[1]["year"] is None and rows[1]["country"] is None


def test_bundled_seed_list_is_valid():
    seeds = load_seeds(sorted((Path(__file__).resolve().parent.parent / "seeds").glob("*.csv")))
    assert len(seeds) >= 30
    assert len({s["url"] for s in seeds}) == len(seeds)
