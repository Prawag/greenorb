"""LLM extraction with deterministic grounding.

The model only *reads*; it never decides the final number. For every value it returns we
  - parse the value exactly as printed and convert units ourselves (units.py),
  - check that the number really appears on the cited page (or a neighbouring candidate page),
  - replace the model's quote with the actual text around the number.
Values that cannot be found in the PDF are kept for transparency but marked rejected.
"""
from __future__ import annotations

import logging
import re

from .llm import LLMClient, LLMUnavailable
from .metrics import METRICS, PAGE_KEYWORDS
from .numbers import NUM_IN_TEXT, parse_number
from .pdf import Document, Page
from .tables import Candidate
from .units import UnitMatch, match_unit, plausible

log = logging.getLogger(__name__)

SYSTEM = (
    "You extract environmental metrics from sustainability-report pages for an audit tool. "
    "Accuracy matters more than coverage: when unsure, leave a metric out. Respond with JSON only."
)

INSTRUCTIONS = """Extract ABSOLUTE company-wide totals for these metrics, for every reporting year shown:
- ghg_scope1: Scope 1 (direct) GHG emissions
- ghg_scope2_location / ghg_scope2_market: Scope 2 emissions by method; use ghg_scope2 if the method is not stated
- ghg_scope3: total Scope 3 emissions (not single categories)
- ghg_scope12_total: a reported Scope 1+2 total
- energy_total: total energy consumption
- energy_renewable_pct: share of energy from renewable sources, in percent
- water_withdrawal, water_consumption: total volumes
- waste_generated: total waste generated

Rules:
1. Copy "value" EXACTLY as printed (keep commas/dots, e.g. "8,56,434" or "1.234,5"), and "unit" exactly as printed nearby (e.g. "Metric tonnes of CO2 equivalent", "GJ", "kL", "MMT CO2e").
2. Skip intensities/ratios (per revenue, per employee, per tonne), targets, baselines, % changes, avoided or offset emissions, and sub-categories.
3. "page" is the number in the === PAGE n === marker where the value is printed.
4. "fiscal_year" is the year the period ENDS (FY2023-24 -> 2024; FY23 -> 2023; calendar 2023 -> 2023). Put the printed column heading in "period_label".
5. "boundary": "consolidated" or "standalone" only if the table says so, otherwise null.
6. Values printed as "-", "NA" or "Nil" must be omitted.
7. Never calculate, convert or estimate anything.

Return: {"metrics": [{"metric": "...", "fiscal_year": 2024, "period_label": "FY2023-24", "value": "...", "unit": "...", "boundary": null, "page": 12}]}
"""


def score_pages(doc: Document) -> dict[str, list[tuple[float, int]]]:
    ranked: dict[str, list[tuple[float, int]]] = {fam: [] for fam in PAGE_KEYWORDS}
    for p in doc.pages:
        t = p.text.lower()
        if len(t) < 150:
            continue
        digits = len(re.findall(r"\d", t)) / max(1, len(t))
        for fam, kws in PAGE_KEYWORDS.items():
            hits = sum(len(re.findall(k, t)) for k in kws)
            if hits:
                ranked[fam].append((hits * (1 + 4 * digits), p.number))
    for fam in ranked:
        ranked[fam].sort(reverse=True)
    return ranked


def choose_pages(doc: Document, missing_families: set[str], *, ghg_pages: int = 5, other_pages: int = 2) -> list[int]:
    ranked = score_pages(doc)
    chosen: list[int] = [n for _, n in ranked["ghg"][:ghg_pages]]
    for fam in ("energy", "water", "waste"):
        if fam in missing_families:
            chosen += [n for _, n in ranked[fam][:other_pages] if n not in chosen]
    return sorted(set(chosen))


def _page_block(page: Page, limit: int) -> str:
    body = page.table_text() if page.rows else page.text
    return f"=== PAGE {page.number} ===\n{body[:limit]}"


def pack_pages(doc: Document, page_numbers: list[int], chars_per_call: int, max_calls: int) -> list[str]:
    batches: list[str] = []
    cur = ""
    for n in page_numbers:
        page = doc.page(n)
        if not page:
            continue
        block = _page_block(page, chars_per_call)
        if cur and len(cur) + len(block) > chars_per_call:
            batches.append(cur)
            cur = ""
        cur += ("\n\n" if cur else "") + block
    if cur:
        batches.append(cur)
    return batches[:max_calls]


def _digits(s: str) -> str:
    return re.sub(r"\D", "", s)


def locate_value(doc: Document, raw: str, value: float, pages: list[int], locale: str) -> tuple[int | None, str | None]:
    """Find the page (preferring `pages` in order) whose text contains this exact number."""
    raw_digits = _digits(raw)
    exact = re.compile(r"(?<![\d.,])" + re.escape(raw.strip()) + r"(?![\d])") if len(raw_digits) >= 2 else None
    for n in pages:
        page = doc.page(n)
        if not page:
            continue
        if exact and (m := exact.search(page.text)):
            a, b = max(0, m.start() - 110), min(len(page.text), m.end() + 60)
            return n, re.sub(r"\s+", " ", page.text[a:b]).strip()
        for m in NUM_IN_TEXT.finditer(page.text):
            tok = m.group(0)
            v = parse_number(tok, locale)
            if v is None:
                continue
            same = abs(v - value) <= max(1e-9, abs(value) * 1e-6) or (len(raw_digits) >= 3 and _digits(tok) == raw_digits)
            if same:
                a, b = max(0, m.start() - 110), min(len(page.text), m.end() + 60)
                return n, re.sub(r"\s+", " ", page.text[a:b]).strip()
    return None, None


def extract_with_llm(
    llm: LLMClient,
    doc: Document,
    *,
    locale: str,
    missing_families: set[str],
    chars_per_call: int,
    max_calls: int,
    log_fn=None,
) -> tuple[list[Candidate], list[str]]:
    """Returns (candidates, notes)."""
    notes: list[str] = []
    if not llm.configured:
        return [], ["No LLM provider configured: table extraction only."]
    page_numbers = choose_pages(doc, missing_families)
    if not page_numbers:
        return [], ["No pages with emissions/energy/water keywords found for LLM review."]
    batches = pack_pages(doc, page_numbers, chars_per_call, max_calls)
    out: list[Candidate] = []
    for idx, batch in enumerate(batches, 1):
        if log_fn:
            log_fn(f"LLM reading batch {idx}/{len(batches)} ({len(batch):,} chars)")
        try:
            data, provider = llm.chat_json(SYSTEM, f"{INSTRUCTIONS}\n\nPAGES:\n{batch}", max_tokens=2500)
        except LLMUnavailable as exc:
            notes.append(f"LLM unavailable: {exc}")
            break
        items = (data or {}).get("metrics") or []
        if not isinstance(items, list):
            continue
        batch_pages = [int(n) for n in re.findall(r"=== PAGE (\d+) ===", batch)]
        for it in items:
            cand = _to_candidate(it, doc, locale, batch_pages, provider)
            if cand:
                out.append(cand)
    return out, notes


def _to_candidate(it: dict, doc: Document, locale: str, batch_pages: list[int], provider: str) -> Candidate | None:
    if not isinstance(it, dict):
        return None
    metric = str(it.get("metric") or "").strip()
    if metric not in METRICS:
        return None
    mdef = METRICS[metric]
    raw = str(it.get("value") or "").strip()
    num = parse_number(raw, locale)
    if num is None or num < 0:
        return None
    try:
        year = int(it.get("fiscal_year"))
    except (TypeError, ValueError):
        return None
    if not 1990 <= year <= 2100:
        return None
    raw_unit = str(it.get("unit") or "").strip() or None
    notes = [f"Read by {provider}."]
    conf = 0.7
    if mdef.family == "pct":
        unit = UnitMatch(1.0, "%", "%")
    else:
        unit = match_unit(raw_unit, mdef.family)
        if unit is None:
            if mdef.family in ("energy", "water"):
                return None
            unit = UnitMatch(1.0, mdef.unit, f"assumed {mdef.unit}")
            notes.append(f"Unit '{raw_unit or '?'}' not recognised; assumed {mdef.unit}.")
            conf -= 0.2
    value = num * unit.factor
    if not plausible(value, unit.canonical):
        return None
    try:
        cited = int(it.get("page"))
    except (TypeError, ValueError):
        cited = None
    order = ([cited] if cited else []) + [n for n in batch_pages if n != cited]
    page, snippet = locate_value(doc, raw, num, order, locale)
    grounded = page is not None
    if not grounded:
        notes.append("Number not found on the cited page: possible hallucination, excluded.")
        conf = 0.15
    elif cited and page != cited:
        notes.append(f"Model cited page {cited}; number found on page {page}.")
        conf -= 0.05
    boundary = it.get("boundary")
    boundary = boundary.lower() if isinstance(boundary, str) and boundary.lower() in ("consolidated", "standalone") else None
    return Candidate(
        metric=metric,
        fiscal_year=year,
        period_label=str(it.get("period_label") or "")[:40] or None,
        value=round(value, 4),
        unit=unit.canonical,
        raw_value=raw[:60],
        raw_unit=(raw_unit or "")[:80] or None,
        page=page or cited or 0,
        quote=(snippet or str(it.get("quote") or ""))[:300],
        method="llm",
        confidence=round(conf, 2),
        grounded=grounded,
        boundary=boundary,
        unit_ambiguous=unit.ambiguous,
        notes=notes,
        status="extracted" if grounded else "rejected",
    )
