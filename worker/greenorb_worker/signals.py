"""Document-level signals: external assurance, frameworks, climate targets and claims."""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from .pdf import Document

ASSURERS = [
    "KPMG", "Deloitte", "Ernst & Young", "EY", "PwC", "PricewaterhouseCoopers", "Price Waterhouse",
    "Bureau Veritas", "DNV", "SGS", "TÜV", "TUV", "Intertek", "LRQA", "Lloyd's Register", "ERM CVS",
    "Apex Companies", "BSI", "Grant Thornton", "BDO", "Mazars", "Forvis Mazars", "Carbon Trust", "RINA",
    "Det Norske Veritas", "SR Batliboi", "S.R. Batliboi", "Walker Chandiok", "BV India",
]
_ASSURER_RE = re.compile(r"\b(" + "|".join(re.escape(a) for a in sorted(ASSURERS, key=len, reverse=True)) + r")\b")
_SUSTAIN_CTX = re.compile(r"ghg|greenhouse|emission|sustainab|brsr|non-financial|esg|isae\s*3410|isae\s*3000|aa1000|environmental", re.I)
_REASONABLE = re.compile(r"reasonable\s+assurance", re.I)
_LIMITED = re.compile(r"limited\s+(?:level\s+of\s+)?assurance|moderate\s+(?:level\s+of\s+)?assurance|limited\s+assurance\s+engagement", re.I)
_NONE = re.compile(
    r"no\s+(?:independent\s+)?(?:external\s+)?(?:assessment|assurance)[^.]{0,60}?has\s+been\s+(?:carried\s+out|undertaken|obtained)|"
    r"external\s+agency\W{0,5}(?:-|:|–)?\s*no\b|"
    r"(?:emissions?|ghg|data)[^.]{0,80}?(?:have|has)\s+not\s+been\s+(?:externally\s+|independently\s+)?(?:assured|verified)",
    re.I,
)
_ENV_CTX = re.compile(r"ghg|greenhouse|emission|energy|water|waste|intensity|environment|scope\s*[123]", re.I)
_YES_ASSURED = re.compile(r"\byes\b[^.]{0,80}?(?:assurance|verification|verified|assured)", re.I)


@dataclass
class Assurance:
    level: str = "unknown"          # none | limited | reasonable | unknown
    provider: str | None = None
    page: int | None = None
    quote: str | None = None


def _snippet(text: str, start: int, end: int, pad: int = 140) -> str:
    a, b = max(0, start - pad), min(len(text), end + pad)
    return re.sub(r"\s+", " ", text[a:b]).strip()


def detect_assurance(doc: Document) -> Assurance:
    best = Assurance()
    rank = {"unknown": 0, "none": 1, "limited": 2, "reasonable": 3}
    for p in doc.pages:
        t = p.text
        if not _SUSTAIN_CTX.search(t):
            continue
        for level, pat in (("reasonable", _REASONABLE), ("limited", _LIMITED)):
            for m in pat.finditer(t):
                window = t[max(0, m.start() - 600): m.end() + 600]
                if not _SUSTAIN_CTX.search(window):
                    continue  # e.g. "reasonable assurance" about financial statements
                if rank[level] > rank[best.level]:
                    prov = _ASSURER_RE.search(window)
                    best = Assurance(level, prov.group(1) if prov else None, p.number, _snippet(t, m.start(), m.end()))
        if best.level == "unknown":
            m = _NONE.search(t)
            if m and _ENV_CTX.search(t[max(0, m.start() - 600): m.end() + 200]):
                best = Assurance("none", None, p.number, _snippet(t, m.start(), m.end()))
        if best.level == "unknown" and not best.provider:
            # "Yes, Independent Assurance Statement issued by DNV …": assured, level not stated.
            for m in _YES_ASSURED.finditer(t):
                window = t[m.start(): m.end() + 250]
                prov = _ASSURER_RE.search(window)
                if prov and _SUSTAIN_CTX.search(t[max(0, m.start() - 400): m.end() + 200]):
                    best = Assurance("unknown", prov.group(1), p.number, _snippet(t, m.start(), m.end()))
                    break
    if best.level in ("limited", "reasonable") and not best.provider:
        for p in doc.pages:
            if re.search(r"assurance\s+statement|independent\s+(?:limited\s+|reasonable\s+)?assurance", p.text, re.I):
                prov = _ASSURER_RE.search(p.text)
                if prov:
                    best.provider = prov.group(1)
                    break
    return best


FRAMEWORKS = {
    "BRSR": r"business\s+responsibility\s+(?:and|&)\s+sustainability\s+report|\bBRSR\b",
    "GRI": r"\bGRI\s*(?:standards|\d{3}(?:-\d+)?)\b",
    "SASB": r"\bSASB\b",
    "TCFD": r"\bTCFD\b|task\s+force\s+on\s+climate[- ]related",
    "ESRS": r"\bESRS\b|\bCSRD\b",
    "ISSB": r"\bISSB\b|IFRS\s+S[12]\b",
    "CDP": r"\bCDP\b",
    "SBTi": r"science[- ]based\s+targets?\s+initiative|\bSBTi\b",
}


def detect_frameworks(doc: Document) -> list[str]:
    text = "\n".join(p.text for p in doc.pages)
    return [name for name, pat in FRAMEWORKS.items() if re.search(pat, text, re.I)]


@dataclass
class Claims:
    net_zero_year: int | None = None
    net_zero_page: int | None = None
    net_zero_quote: str | None = None
    has_interim_target: bool = False
    interim_quote: str | None = None
    carbon_neutral_claim: bool = False
    neutral_page: int | None = None
    neutral_quote: str | None = None
    offsets_mentioned: bool = False
    offsets_page: int | None = None
    pages_scanned: int = 0
    notes: list[str] = field(default_factory=list)


_NET_ZERO = re.compile(r"\bnet[\s-]?zero\b[^.]{0,120}?\b(20[3-9]\d|2100)\b|\b(20[3-9]\d|2100)\b[^.]{0,60}?\bnet[\s-]?zero\b", re.I)
_INTERIM = re.compile(
    r"(?:reduc\w*|cut|lower)\s[^.]{0,80}?\d{1,3}\s?%[^.]{0,80}?\b(?:by|until|till|before)\s+(?:FY\s?)?(20[2-4]\d)\b|"
    r"\b(?:by|until|till)\s+(?:FY\s?)?(20[2-4]\d)\b[^.]{0,80}?(?:reduc\w*|cut)\s[^.]{0,40}?\d{1,3}\s?%|"
    r"science[- ]based\s+targets?|\bSBTi\b|validated\s+by\s+(?:the\s+)?SBTi",
    re.I,
)
_NEUTRAL = re.compile(r"\b(?:carbon|climate)[\s-]?neutral(?:ity)?\b", re.I)
_OFFSETS = re.compile(r"\boffset(?:s|ting)?\b|carbon\s+credits?|\bRECs?\b|renewable\s+energy\s+certificates?|\bI-?RECs?\b|green\s+credits?", re.I)


def detect_claims(doc: Document) -> Claims:
    c = Claims()
    for p in doc.pages:
        t = p.text
        c.pages_scanned += 1
        if c.net_zero_year is None and (m := _NET_ZERO.search(t)):
            c.net_zero_year = int(m.group(1) or m.group(2))
            c.net_zero_page = p.number
            c.net_zero_quote = _snippet(t, m.start(), m.end(), 80)
        if not c.has_interim_target and (m := _INTERIM.search(t)):
            c.has_interim_target = True
            c.interim_quote = _snippet(t, m.start(), m.end(), 60)
        if not c.carbon_neutral_claim and (m := _NEUTRAL.search(t)):
            c.carbon_neutral_claim = True
            c.neutral_page = p.number
            c.neutral_quote = _snippet(t, m.start(), m.end(), 100)
        if not c.offsets_mentioned and _OFFSETS.search(t):
            c.offsets_mentioned = True
            c.offsets_page = p.number
    return c
