"""Cheap checks before a local PDF is loaded: is it a sustainability/ESG document, and is it about
the company its file name says? The old downloader saved 10-K filings, press releases, rating
profiles and other companies' reports under company names; loading those only adds empty reports
and misleading "no GHG data" flags.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

import pymupdf

_ESG_STRONG = re.compile(
    r"scope\s*[123]\b|greenhouse\s+gas|\bghg\b|energy\s+consum|water\s+(?:withdrawal|consumption)|"
    r"waste\s+generated|business\s+responsibility\s+and\s+sustainability|tco2|co2e",
    re.I,
)
_NOT_A_REPORT = re.compile(
    r"securities\s+and\s+exchange\s+commission|\bform\s+10-?k\b|stocklight\.com|investor\s+release|"
    r"press\s+release|semi-?annual\s+report|interim\s+report|notice\s+of\s+(?:the\s+)?annual\s+general\s+meeting",
    re.I,
)
_GENERIC = {
    "the", "and", "of", "for", "limited", "ltd", "plc", "inc", "incorporated", "llc", "group", "holdings", "holding",
    "company", "companies", "corporation", "corp", "co", "sa", "ag", "nv", "se", "spa", "ab", "asa", "oyj", "bhd",
    "international", "global", "india", "indian", "industries", "technologies", "technology", "services", "solutions",
    "enterprises", "systems", "energy", "power", "bank", "financial", "finance", "capital", "resources", "trust",
    "of", "new", "first", "general", "national", "american", "united", "china", "chinese", "japan", "usa", "us", "uk",
}


@dataclass
class Screen:
    ok: bool
    reason: str = ""
    esg_pages: int = 0


def _norm(s: str) -> str:
    return " " + re.sub(r"[^a-z0-9]+", " ", s.lower()) + " "


def name_tokens(company: str) -> list[str]:
    words = re.sub(r"\([^)]*\)?", " ", company.lower()).replace("&", " and ")
    words = [w for w in re.split(r"[^a-z0-9]+", words) if w]
    distinct = [w for w in words if w not in _GENERIC and (len(w) >= 3 or any(ch.isdigit() for ch in w))]
    return distinct or [w for w in words if len(w) >= 2]


# Well-known short names that never appear in the long form.
_ALIASES = {
    "glaxosmithkline": ["gsk"], "international business machines": ["ibm"], "procter and gamble": ["p g", "pg"],
    "hindustan unilever": ["hul"], "larsen and toubro": ["l t", "lt"], "anheuser busch inbev": ["ab inbev"],
    "minnesota mining and manufacturing": ["3m"], "bharat heavy electricals": ["bhel"], "oil and natural gas": ["ongc"],
    "state bank of india": ["sbi"], "housing development finance": ["hdfc"],
}


def mentions_company(text: str, company: str) -> bool:
    hay = _norm(text)
    plain = " ".join(re.split(r"[^a-z0-9]+", company.lower().replace("&", " and "))).strip()
    for long, shorts in _ALIASES.items():
        if long in plain and any(f" {s} " in hay for s in shorts):
            return True
    tokens = name_tokens(company)
    if any(f" {t} " in hay for t in tokens):
        return True
    words = [w for w in re.split(r"[^a-z0-9]+", company.lower()) if w and w not in {"and", "of", "the"}]
    acronym = "".join(w[0] for w in words)
    if len(acronym) >= 3 and f" {acronym} " in hay:
        return True
    # "F&F" written as "fandf" in file names
    squashed = re.sub(r"[^a-z0-9]", "", company.lower()).replace("and", "")
    return len(squashed) >= 3 and squashed in re.sub(r"[^a-z0-9]", "", text.lower())


def screen_pdf(data: bytes, company: str, *, max_pages: int = 400) -> Screen:
    try:
        doc = pymupdf.open(stream=data, filetype="pdf")
    except Exception as exc:  # noqa: BLE001 - any parse failure means we can't use it
        return Screen(False, f"not a readable PDF ({exc.__class__.__name__})")
    with doc:
        n = min(len(doc), max_pages)
        texts = [doc[i].get_text() for i in range(n)]
        meta = " ".join(str(v) for v in (doc.metadata or {}).values() if v)
    if sum(len(t.strip()) for t in texts) < 200:
        return Screen(False, "no text layer (scanned images)")
    esg_pages = sum(1 for t in texts if _ESG_STRONG.search(t))
    head = "\n".join(texts[:3])
    if _NOT_A_REPORT.search(head) and esg_pages < 5:
        return Screen(False, "looks like a filing or press release, not a sustainability report", esg_pages)
    if esg_pages < 2:
        return Screen(False, "has almost no emissions, energy, water or waste content", esg_pages)
    if not mentions_company(meta + "\n" + "\n".join(texts[:15]), company):
        return Screen(False, f"doesn't mention {company} on its first pages (probably another company's report)", esg_pages)
    return Screen(True, "", esg_pages)
