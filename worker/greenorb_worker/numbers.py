"""Locale-aware number and reporting-period parsing.

Handles the formats seen in real sustainability reports:
  US / international  1,234,567.89
  Indian lakh/crore   8,56,434   12,34,56,789.5
  European            1.234.567,89    3,5
  SI / French spaces  1 234 567
and explicit nulls such as "-", "—", "NA", "Nil", "Not applicable".
"""
from __future__ import annotations

import re
from collections import Counter

NULL_TOKENS = {
    "-", "–", "—", "−", "--", "na", "n/a", "n.a.", "n.a", "nil", "none", "not applicable", "notapplicable",
    "not available", "not reported", "nr", "nd", "n.d.", "*", "#",
}

_US = re.compile(r"^\d{1,3}(?:,\d{3})+(?:\.\d+)?$")
_IN = re.compile(r"^\d{1,2}(?:,\d{2})+,\d{3}(?:\.\d+)?$")
_EU = re.compile(r"^\d{1,3}(?:\.\d{3})+(?:,\d+)?$")
_SPACE = re.compile(r"^\d{1,3}(?:[    ]\d{3})+(?:[.,]\d+)?$")
_PLAIN = re.compile(r"^\d+(?:\.\d+)?$")
_DEC_COMMA = re.compile(r"^\d+,\d{1,2}$|^\d+,\d{4,}$")
_AMBIG_COMMA3 = re.compile(r"^\d{1,3},\d{3}$")

# A numeric token as it appears inside text (used for scanning pages).
NUM_IN_TEXT = re.compile(
    r"(?<![\w.,])[-−–]?\(?\d{1,3}(?:(?:[,.\u00a0\u202f]\d{2,3})+)?(?:[.,]\d+)?\)?(?![\w])|(?<![\w.,])\d+(?:[.,]\d+)?(?![\w])"
)


def detect_locale(text: str) -> str:
    """Guess whether a document uses European decimal commas ("eu") or not ("us")."""
    eu = len(re.findall(r"\b\d{1,3}(?:\.\d{3})+,\d{1,3}\b", text)) + len(re.findall(r"\b\d+,\d{1,2}\s?%", text))
    us = len(re.findall(r"\b\d{1,3}(?:,\d{3})+\.\d{1,3}\b", text)) + len(re.findall(r"\b\d+\.\d{1,2}\s?%", text))
    return "eu" if eu > us * 1.5 and eu >= 3 else "us"


def is_null_token(s: str) -> bool:
    return s.strip().lower().strip(".") in NULL_TOKENS or s.strip().lower() in NULL_TOKENS


def parse_number(raw: str | None, locale: str = "us") -> float | None:
    """Parse a single numeric cell. Returns None for blanks, nulls and non-numbers."""
    if raw is None:
        return None
    s = str(raw).strip()
    if not s or is_null_token(s):
        return None
    neg = False
    s = s.replace("−", "-").replace("–", "-")
    if s.startswith("(") and s.endswith(")"):
        neg, s = True, s[1:-1]
    if s.startswith("-"):
        neg, s = True, s[1:]
    # strip currency/footnote clutter: "164,236¹", "5.76*", "~1,200", "≈ 3.4"
    s = re.sub(r"^[~≈<>≤≥$€£₹¥]+\s*", "", s)
    s = re.sub(r"[*†‡§¹²³⁴⁵⁶⁷⁸⁹⁰]+$", "", s).strip()
    s = s.rstrip("%").strip()
    if not s or not s[0].isdigit():
        return None

    if _SPACE.match(s):
        s = re.sub(r"[    ]", "", s)
        s = s.replace(",", ".")
    elif _IN.match(s) or _US.match(s):
        if locale == "eu" and _AMBIG_COMMA3.match(s):
            s = s.replace(",", ".")  # "1,234" in a European document is 1.234
        else:
            s = s.replace(",", "")
    elif _EU.match(s):
        if locale == "eu" or s.count(".") > 1 or "," in s:
            s = s.replace(".", "").replace(",", ".")
        # else: "1.234" in a US document stays a decimal
    elif _DEC_COMMA.match(s):
        s = s.replace(",", ".")
    elif not _PLAIN.match(s):
        return None
    try:
        v = float(s)
    except ValueError:
        return None
    return -v if neg else v


def numbers_in_text(text: str, locale: str = "us") -> list[float]:
    out = []
    for m in NUM_IN_TEXT.finditer(text):
        v = parse_number(m.group(0), locale)
        if v is not None:
            out.append(v)
    return out


# ── Reporting periods ─────────────────────────────────────────────────────────
# FY 23-24 / PY 22-23 / CY 23-24 (BRSR tables often use two-digit ranges, "PY" = previous year)
_SHORT_RANGE = re.compile(r"\b[FPC]\.?Y\.?\s*'?(\d{2})\s*[-–/]\s*'?(\d{2})(?!\d)", re.I)

_PERIOD_PATTERNS = [
    # FY2023-24, FY 2023-24, F.Y. 2023–2024, 2023-24, 2023/24
    re.compile(r"(?:\bF\.?Y\.?\s*'?)?(?<!\d)((?:19|20)\d{2})\s*[-–/]\s*((?:19|20)?\d{2})(?!\d)", re.I),
    # FY23, FY 23, FY'23, FY2023
    re.compile(r"\bF\.?Y\.?\s*'?(\d{2}|(?:19|20)\d{2})\b", re.I),
    # CY2023 / 2023
    re.compile(r"\b(?:CY\s*)?((?:19|20)\d{2})\b"),
]


def parse_period(token: str) -> tuple[int, str] | None:
    """Return (fiscal year end, label) for tokens like 'FY23', 'FY2023-24', '2021-22', '2023'."""
    t = token.strip()
    m = _SHORT_RANGE.search(t)
    if m and int(m.group(2)) - int(m.group(1)) == 1:
        return 2000 + int(m.group(2)), m.group(0).strip()
    m = _PERIOD_PATTERNS[0].search(t)
    if m:
        a, b = int(m.group(1)), m.group(2)
        end = int(b) if len(b) == 4 else (a // 100) * 100 + int(b)
        if end < a:
            end += 100
        if end - a == 1 and 1990 <= end <= 2100:
            return end, m.group(0).strip()
    m = _PERIOD_PATTERNS[1].search(t)
    if m:
        y = m.group(1)
        year = int(y) if len(y) == 4 else 2000 + int(y)
        if 1990 <= year <= 2100:
            return year, m.group(0).strip()
    m = _PERIOD_PATTERNS[2].fullmatch(t.strip(" ()*:")) or re.fullmatch(r"(?:CY\s*)?((?:19|20)\d{2})\*?", t.strip(" ()"))
    if m:
        year = int(m.group(1))
        if 1990 <= year <= 2100:
            return year, t.strip(" ()")
    return None


_RANGE_LOOSE = re.compile(r"(?:\bF\.?Y\.?\s*'?)?(?<!\d)((?:19|20)\d{2})\s*[-–/]\s*(\d{2,4})(?!\d)", re.I)


def find_periods(text: str) -> list[tuple[int, str]]:
    """Find reporting periods in a header cell, tolerating glued footnote digits ("FY 2024-2552")."""
    out: list[tuple[int, str]] = []
    taken: list[tuple[int, int]] = []
    for m in _SHORT_RANGE.finditer(text):
        if int(m.group(2)) - int(m.group(1)) == 1:
            out.append((2000 + int(m.group(2)), m.group(0).strip()))
            taken.append(m.span())
    for m in _RANGE_LOOSE.finditer(text):
        start, tail = int(m.group(1)), m.group(2)
        end = None
        if len(tail) == 4 and int(tail) - start == 1:
            end = int(tail)
        elif (start // 100) * 100 + int(tail[:2]) - start == 1:
            end = (start // 100) * 100 + int(tail[:2])  # "2024-2552": 25 + footnote 52
        if end:
            label = m.group(0)[: m.group(0).index(m.group(2)) + (4 if len(tail) == 4 and int(tail) - start == 1 else 2)]
            out.append((end, label.strip()))
            taken.append(m.span())
    for m in re.finditer(r"\bF\.?Y\.?\s*'?((?:19|20)\d{2}|\d{2})(?![\d\-–/])|\bCY\s*((?:19|20)\d{2})", text, re.I):
        if any(a <= m.start() < b for a, b in taken):
            continue
        y = m.group(1) or m.group(2)
        year = int(y) if len(y) == 4 else 2000 + int(y)
        if 1990 <= year <= 2100:
            out.append((year, m.group(0).strip()))
    return out


def periods_in_text(text: str) -> list[tuple[int, str]]:
    found = []
    for pat in (_SHORT_RANGE, *_PERIOD_PATTERNS[:2]):
        for m in pat.finditer(text):
            p = parse_period(m.group(0))
            if p:
                found.append(p)
    return found


_BRSR_YEAR = re.compile(
    r"financial\s+year\s+for\s+which\s+reporting\s+is\s+being\s+done\W{0,10}(?:F\.?Y\.?\s*)?((?:19|20)\d{2})\s*[-–/]\s*((?:19|20)?\d{2})",
    re.I,
)


def detect_report_year(pages_text: list[str], hint: int | None = None) -> tuple[int | None, str | None, str]:
    """Best guess of the fiscal year a report covers. Returns (year, label, method)."""
    joined = "\n".join(pages_text[:40])
    m = _BRSR_YEAR.search(joined)
    if m:
        p = parse_period(f"{m.group(1)}-{m.group(2)}")
        if p:
            return p[0], p[1], "brsr_statement"
    counts: Counter[int] = Counter()
    labels: dict[int, str] = {}
    for t in pages_text[:6]:
        for y, label in periods_in_text(t):
            counts[y] += 1
            labels.setdefault(y, label)
        for y in re.findall(r"\b(20[12]\d)\b", t):
            counts[int(y)] += 0.5
    if counts:
        year = max(counts.items(), key=lambda kv: (kv[1], kv[0]))[0]
        return year, labels.get(year), "cover_pages"
    return hint, None, "hint"
