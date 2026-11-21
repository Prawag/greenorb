"""Deterministic extraction of metric values from table-like rows.

For every visual row that carries numbers, we
  1. resolve its label (own text, or wrapped label lines just above / below it),
  2. map each number to a reporting period by x-alignment with the nearest
     header row above it ("FY2023-24", "FY23 (Current Financial Year)", "2022 2023"),
  3. find the unit (unit cell, label, or a caption between the header and the row),
  4. normalise to canonical units.
Every value produced here is grounded by construction: it was read from the page.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from .metrics import METRICS, match_metric
from .numbers import find_periods, is_null_token, parse_number
from .pdf import Cell, Page, Row
from .units import UnitMatch, match_unit, plausible, scale_words


@dataclass
class Candidate:
    metric: str
    fiscal_year: int
    value: float | None
    unit: str
    raw_value: str
    raw_unit: str | None
    page: int
    quote: str
    method: str = "table"
    confidence: float = 0.8
    grounded: bool = True
    period_label: str | None = None
    boundary: str | None = None
    unit_ambiguous: bool = False
    notes: list[str] = field(default_factory=list)
    status: str = "extracted"   # extracted | rejected

    @property
    def key(self) -> tuple:
        return (self.metric, self.fiscal_year, self.boundary or "")


_METRIC_WORDS = re.compile(r"scope|emission|energy|water|waste|ghg|withdraw|consum|generated|renewable|total", re.I)
_CURRENT = re.compile(r"current\s+(?:financial\s+|reporting\s+)?year|\bcurrent\s+fy|reporting\s+year", re.I)
_PREVIOUS = re.compile(r"previous\s+(?:financial\s+|reporting\s+)?year|\bprevious\s+fy|prior\s+year", re.I)
_BOUNDARY = re.compile(r"\b(standalone|consolidated)\b", re.I)
_FY_LIKE = re.compile(
    r"(?:\bF\.?Y\.?\s*'?)?(?<!\d)(?:19|20)\d{2}\s*[-–/]\s*(?:19|20)?\d{2}(?!\d)|\bF\.?Y\.?\s*'?(?:(?:19|20)\d{2}|\d{2})(?![\d\-–/])|\bCY\s*20\d{2}"
    r"|\b[FPC]\.?Y\.?\s*'?\d{2}\s*[-–/]\s*'?\d{2}(?!\d)",  # FY 23-24, PY 22-23
    re.I,
)
_RATIO = re.compile(r"/\s*$|/\s*\w|\bper\b|intensity|revenue|turnover|\bk?g\s+of\s+co2", re.I)
_PLAIN_YEAR = re.compile(r"^\(?(?:FY|CY)?\s*((?:19|20)\d{2})\)?\*?$", re.I)


def _is_value_cell(c: Cell) -> bool:
    t = c.text.strip()
    if is_null_token(t):
        return True
    return parse_number(t) is not None or parse_number(t.replace(" ", "")) is not None


# First line of a unit that wraps onto the next row ("Metric" / "tonnes"): a unit, not a label.
_UNIT_FRAGMENT = re.compile(r"^(?:k?g\s+of\s+co2\w*|metric|mt|tonnes?|kilo\s*-?\s*litres?|kl|gj|mwh|kwh|giga\s*joules?|cubic|m3|units?)\b[\w\s.]{0,12}$", re.I)


_SCOPE_LABEL = re.compile(r"\bscope\s*[123]\b|\bemissions?\b.*\(", re.I)


def _is_unit_cell(c: Cell) -> bool:
    if _UNIT_FRAGMENT.match(c.text.strip()):
        return True
    # "Scope 1 emissions (in tons CO2e)" is a label that carries its unit, not a unit cell.
    if _SCOPE_LABEL.search(c.text) and len(c.text.split()) >= 3:
        return False
    if _METRIC_WORDS.search(c.text) and not re.search(r"co2|equivalent", c.text, re.I):
        return False
    return any(match_unit(c.text, fam) for fam in ("ghg", "energy", "water", "waste")) and len(c.text) < 60


@dataclass
class HeaderCol:
    xc: float
    year: int
    label: str
    explicit: bool


def _header_columns(row: Row, doc_year: int | None) -> list[HeaderCol]:
    cols: list[HeaderCol] = []
    plain: list[tuple[Cell, int]] = []
    for c in row.cells:
        t = c.text
        if _FY_LIKE.search(t) or re.search(r"(?:19|20)\d{2}\s*[-–/]\s*\d{2}", t):
            found = find_periods(t)
            if found:
                # One cell can hold several merged headers ("FY2024-25 FY2023-24"): spread them evenly.
                step = (c.x1 - c.x0) / len(found)
                for k, (year, label) in enumerate(found):
                    xc = c.xc if len(found) == 1 else c.x0 + step * (k + 0.5)
                    cols.append(HeaderCol(xc, year, label, True))
                continue
        m = _PLAIN_YEAR.match(t.strip())
        if m:
            plain.append((c, int(m.group(1))))
            continue
        if doc_year and _CURRENT.search(t) and not _FY_LIKE.search(t):
            cols.append(HeaderCol(c.xc, doc_year, "Current year", False))
        elif doc_year and _PREVIOUS.search(t) and not _FY_LIKE.search(t):
            cols.append(HeaderCol(c.xc, doc_year - 1, "Previous year", False))
    if len(plain) >= 2:
        years = [y for _, y in plain]
        diffs = {abs(a - b) for a, b in zip(years, years[1:])}
        if diffs and diffs <= {1}:  # consecutive years read as a header, not values
            cols.extend(HeaderCol(c.xc, y, str(y), True) for c, y in plain)
    return cols


def _boundary_cols(row: Row) -> list[tuple[float, str]]:
    return [(c.xc, m.group(1).lower()) for c in row.cells if (m := _BOUNDARY.search(c.text))]


def _continuation(text: str, before: str = "") -> bool:
    """Does `text` continue a wrapped label (rather than start a new one)?"""
    t = text.strip()
    if not t:
        return False
    b = before.strip()
    if b and (b[-1] in ",(-–/&" or b.count("(") > b.count(")")):
        return True
    # "Total Scope 1 and" / "… per rupee of": the label clearly runs on to the next line.
    if b and re.search(r"\b(?:and|or|of|per|in|from|to|for|by|the|with)$", b, re.I):
        return True
    return t[0].islower() or t[0] in "(-–,&" or len(t.split()) <= 2


_TRAILING_NUM = re.compile(r"^(?P<text>.*[A-Za-z)].*?)\s+(?P<num>[-–(]?\d[\d,.\s]*\d\)?|\d|-|–|—)$")


def _split_trailing_numbers(cells: list[Cell]) -> list[Cell]:
    """Tight tables can glue the first value onto the unit/label cell ("tCO2e 8,56,434"); split it off."""
    out: list[Cell] = []
    for c in cells:
        m = _TRAILING_NUM.match(c.text)
        # "Total Scope 1" / "Category 3" end in a number that is part of the label.
        if m and re.search(r"\b(?:scope|category|cat\.?|tier|phase|unit|plant|no\.?)$", m.group("text").strip(), re.I):
            m = None
        if m and not _is_value_cell(c) and (parse_number(m.group("num")) is not None or is_null_token(m.group("num"))):
            width = c.x1 - c.x0
            cut = c.x0 + width * len(m.group("text")) / max(1, len(c.text))
            out.append(Cell(c.x0, cut, m.group("text").strip()))
            out.append(Cell(cut + width * 0.02, c.x1, m.group("num").strip()))
        else:
            out.append(c)
    return out


def _row_parts(row: Row) -> tuple[list[Cell], list[Cell], list[Cell]]:
    """Split a row into label cells, unit cells and value cells (values are right of the label)."""
    cells = _split_trailing_numbers(row.cells)
    first_val = next((i for i, c in enumerate(cells) if _is_value_cell(c)), None)
    if first_val == 0 and len(cells) > 1 and not _is_value_cell(cells[1]):
        # "1 | Total Scope 1 emissions | 1,234" – a leading enumeration, not a value.
        first_val = next((i for i, c in enumerate(cells) if i > 1 and _is_value_cell(c)), None)
    if first_val is None:
        return cells, [], []
    head = cells[:first_val]
    values = [c for c in cells[first_val:] if _is_value_cell(c) or c.text.strip().endswith("%")]
    units = [c for c in head if _is_unit_cell(c)]
    labels = [c for c in head if c not in units]
    # The label is the cell nearest the numbers. Earlier cells only join it when they sit close
    # by; otherwise they are narrative text from another column sharing the baseline.
    if len(labels) > 1:
        keep = [labels[-1]]
        for c in reversed(labels[:-1]):
            if keep[0].x0 - c.x1 < 60 and len(c.text.split()) <= 8:
                keep.insert(0, c)
            else:
                break
        labels = keep
    # unit cells can also sit among the values ("tCO2e | 1,234 | 1,100")
    units += [c for c in cells[first_val:] if c not in values and _is_unit_cell(c)]
    return labels, units, values


def extract_page(page: Page, *, locale: str = "us", doc_year: int | None = None) -> list[Candidate]:
    rows = page.rows
    parts = [_row_parts(r) for r in rows]
    has_values = [bool(v) and any(parse_number(c.text, locale) is not None or is_null_token(c.text) for c in v) for _, _, v in parts]
    out: list[Candidate] = []

    for i, row in enumerate(rows):
        labels, units, values = parts[i]
        if not has_values[i]:
            continue
        own = " ".join(c.text for c in labels).strip()

        # Label resolution: own text, else wrapped lines above (back to the previous value row), else below.
        # Only look at text in the label column (left of the numbers, right of any narrative column).
        col_left = labels[0].x0 - 30 if labels else 0.0
        col_right = values[0].x0 if values else row.cells[-1].x1

        def col_text(r: Row) -> str:
            return " ".join(c.text for c in r.cells if col_left <= c.xc < col_right)

        above: list[str] = []
        j = i - 1
        while j >= 0 and not has_values[j] and len(above) < 3 and rows[i].y - rows[j].y < 40:
            t = col_text(rows[j])
            if t:
                above.insert(0, t)
            j -= 1
        below = col_text(rows[i + 1]) if i + 1 < len(rows) and not has_values[i + 1] and rows[i + 1].y - rows[i].y < 13 else ""

        # A short continuation line right below belongs to this label ("Total energy consumed from" /
        # "renewable sources (A+B+C)"), so match on the joined text first.
        own_full = f"{own} {below}".strip() if own and below and _continuation(below, own) else own
        metric = match_metric(own_full, page.text) if own else None
        label_text = own_full
        if metric is None and (not own or _continuation(own, " ".join(above))):
            label_text = " ".join(above + [own]).strip()
            metric = match_metric(label_text, page.text)
        if metric is None and below and (not own or _continuation(below)):
            label_text = " ".join(([own] if own else above[-1:]) + [below]).strip()
            metric = match_metric(label_text, page.text)
        if metric is None:
            continue
        mdef = METRICS[metric]
        # Ratios hide in unit cells and wrapped continuations ("… (MnT)/ | Revenue from operations"),
        # so also read the label lines below this row, up to the start of the next label.
        trailing: list[str] = []
        for k in range(i + 2 if own_full != own else i + 1, min(len(rows), i + 5)):
            if has_values[k] or rows[k].y - row.y > 26:
                break
            t = col_text(rows[k])
            if re.match(r"\s*(?:total\b|scope\b|\d+\.|\([ivx]+\))", t, re.I) or match_metric(t, page.text):
                break
            trailing.append(t)
        context = " ".join([" ".join(c.text for c in units), below, *trailing])
        if mdef.family != "pct" and (_RATIO.search(context) or _RATIO.search(own)) and metric != "energy_renewable_pct":
            if not re.search(r"break-?up", own + label_text, re.I):
                continue

        # Header row above with period columns (search up to 30 rows / ~half a page).
        header: list[HeaderCol] = []
        header_idx = None
        bcols: list[tuple[float, str]] = []
        for k in range(i - 1, max(-1, i - 31), -1):
            if row.y - rows[k].y > 380:
                break
            cols = _header_columns(rows[k], doc_year)
            # Side-by-side tables share rows: only use period headers that sit above these values.
            lo, hi = values[0].x0 - 70, values[-1].x1 + 70
            cols = [c for c in cols if lo <= c.xc <= hi]
            if cols and len(cols) >= min(2, len(values)):
                header, header_idx = cols, k
                for kk in range(k, max(-1, k - 4), -1):
                    if (b := _boundary_cols(rows[kk])):
                        bcols = b
                        break
                break
        # Same-row headers are rare but appear in charts ("2023 1,234"): ignore them.

        # Unit: own row, label, then captions between the header and this row.
        unit: UnitMatch | None = None
        unit_src = None
        family = mdef.family
        for text in [" ".join(c.text for c in units), label_text, below]:
            if text and (u := match_unit(text, family)):
                unit, unit_src = u, text
                break
        if unit is None:
            start = header_idx - 3 if header_idx is not None else i - 8
            for k in range(i - 1, max(-1, start), -1):
                if (u := match_unit(rows[k].text, family)):
                    unit, unit_src = u, rows[k].text
                    break
        notes: list[str] = []
        conf = 0.82
        if unit is None:
            if family == "pct":
                unit = UnitMatch(1.0, "%", "%")
            elif family in ("energy", "water"):
                continue  # GJ vs MWh vs kWh (or kL vs ML) differ by 1000x: never guess
            else:
                unit = UnitMatch(1.0, mdef.unit, f"assumed {mdef.unit}")
                notes.append(f"Unit not stated near the row; assumed {mdef.unit}.")
                conf -= 0.25
        scale = scale_words(unit_src) if unit_src and unit.factor == 1.0 else 1.0

        numeric_vals = [c for c in values if not c.text.strip().endswith("%") or family == "pct"]
        if not numeric_vals:
            continue
        assigned: list[tuple[Cell, HeaderCol | None]] = []
        if header:
            xs = sorted(h.xc for h in header)
            spacing = min((b - a for a, b in zip(xs, xs[1:])), default=80.0)
            tol = max(25.0, spacing * 0.6)
            for c in numeric_vals:
                best = min(header, key=lambda h: abs(h.xc - c.xc))
                assigned.append((c, best if abs(best.xc - c.xc) <= tol else None))
        elif doc_year and len([c for c in numeric_vals if not is_null_token(c.text)]) == 1:
            c = next(c for c in numeric_vals if not is_null_token(c.text))
            assigned.append((c, HeaderCol(c.xc, doc_year, f"FY{doc_year} (inferred)", False)))
            notes.append("No column header found; period inferred from the report year.")
            conf -= 0.2
        else:
            continue

        if any(n.startswith("Unit not stated") for n in notes) and any(n.startswith("No column header") for n in notes):
            continue  # neither unit nor period on the page: too weak to keep (chart labels, page furniture)
        quote = " | ".join(x for x in [label_text, " ".join(c.text for c in units), " ".join(c.text for c in values)] if x)[:300]
        seen_years: set[tuple[int, str]] = set()
        for c, h in assigned:
            if h is None:
                continue
            boundary = None
            if bcols:
                # Group headers ("Standalone", "Consolidated") are centred over their columns.
                boundary = min(bcols, key=lambda b: abs(b[0] - c.xc))[1]
            if (h.year, boundary or "") in seen_years:
                continue  # two numbers under one header (e.g. a % change column)
            seen_years.add((h.year, boundary or ""))
            raw = c.text.strip()
            num = parse_number(raw, locale)
            value = None if num is None else num * unit.factor * scale
            if value is not None and (value < 0 or not plausible(value, unit.canonical)):
                continue
            c_conf = conf + (0.05 if h.explicit else -0.05)
            out.append(
                Candidate(
                    metric=metric,
                    fiscal_year=h.year,
                    period_label=h.label,
                    value=None if value is None else round(value, 4),
                    unit=unit.canonical,
                    raw_value=raw,
                    raw_unit=None if unit.label.startswith("assumed") else unit.label,
                    page=page.number,
                    quote=quote,
                    boundary=boundary,
                    unit_ambiguous=unit.ambiguous,
                    confidence=round(max(0.2, min(0.95, c_conf)), 2),
                    notes=list(notes),
                )
            )
    return out
