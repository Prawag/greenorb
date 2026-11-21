"""Integrity and greenwashing signals.

Every rule is deterministic, documented here, and attaches the evidence (pages, quotes,
numbers) a reviewer needs to confirm or dismiss it. Flags are *signals for review*, not verdicts.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .signals import Assurance, Claims
from .tables import Candidate

SCOPE2_KEYS = ("ghg_scope2_market", "ghg_scope2_location", "ghg_scope2")


@dataclass
class Flag:
    code: str
    severity: str  # info | low | medium | high
    title: str
    detail: str
    evidence: dict = field(default_factory=dict)
    metric: tuple[str, int] | None = None  # (metric, fiscal_year) to link to a stored metric row


def _fmt(v: float | None, unit: str = "tCO2e") -> str:
    if v is None:
        return "n/a"
    return f"{v:,.0f} {unit}" if abs(v) >= 100 else f"{v:,.2f} {unit}"


def _primary_by_key(cands: list[Candidate]) -> dict[tuple[str, int], Candidate]:
    """Best non-rejected value per (metric, year): consolidated > unspecified > standalone, then confidence."""
    best: dict[tuple[str, int], Candidate] = {}
    order = {"consolidated": 0, "": 1, "standalone": 2}
    for c in cands:
        if c.status == "rejected" or c.value is None:
            continue
        k = (c.metric, c.fiscal_year)
        cur = best.get(k)
        rank = (order.get(c.boundary or "", 1), -c.confidence)
        if cur is None or rank < (order.get(cur.boundary or "", 1), -cur.confidence):
            best[k] = c
    return best


def evaluate(
    cands: list[Candidate],
    *,
    report_year: int | None,
    assurance: Assurance,
    claims: Claims,
    conflicts: list[dict],
    history: dict[tuple[str, int], dict],
) -> list[Flag]:
    """`history` maps (metric, year) -> {"value", "report_id", "page"} from the company's other reports."""
    flags: list[Flag] = []
    best = _primary_by_key(cands)
    years = sorted({y for (_, y) in best}, reverse=True)
    latest = report_year if report_year in years else (years[0] if years else report_year)
    has = lambda m, y=latest: (m, y) in best  # noqa: E731
    ghg_found = any(m.startswith("ghg_") for (m, _) in best)

    # 1. No GHG figures at all.
    if not ghg_found:
        flags.append(Flag("NO_GHG_DATA", "medium", "No GHG emissions figures found",
                          "Neither the table parser nor the LLM found Scope 1/2/3 figures. The report may not disclose them, "
                          "or they sit in charts/images. Check the report manually."))

    # 2. Assurance.
    if ghg_found and assurance.level == "none":
        flags.append(Flag("NO_ASSURANCE", "medium", "Emissions data is not externally assured",
                          "The report states that no independent assessment or assurance was carried out.",
                          {"page": assurance.page, "quote": assurance.quote}))
    elif ghg_found and assurance.level == "unknown" and not assurance.provider:
        flags.append(Flag("ASSURANCE_NOT_FOUND", "low", "No assurance statement found",
                          "No limited or reasonable assurance statement covering environmental data was detected."))

    # 3. Scope 1 blank while Scope 2 is reported (common in BRSR filings, e.g. "-" in the Scope 1 row).
    for y in years[:1]:
        s2 = next((best[(k, y)] for k in SCOPE2_KEYS if (k, y) in best), None)
        nil_s1 = next((c for c in cands if c.metric == "ghg_scope1" and c.fiscal_year == y and c.value is None), None)
        if s2 and not has("ghg_scope1", y):
            flags.append(Flag("SCOPE1_MISSING", "medium" if nil_s1 else "low",
                              "Scope 1 emissions reported as nil or missing" if nil_s1 else "Scope 1 emissions not found",
                              f"Scope 2 is reported for FY{y} ({_fmt(s2.value)}) but Scope 1 is "
                              + ("printed as '-' / nil. Almost every operating company has some direct emissions (fuel, refrigerants, vehicles)."
                                 if nil_s1 else "not found."),
                              {"page": (nil_s1 or s2).page, "quote": (nil_s1 or s2).quote}, ("ghg_scope1", y) if nil_s1 else None))

    # 4. Scope 3 not reported.
    if latest and has("ghg_scope1") and not has("ghg_scope3"):
        flags.append(Flag("SCOPE3_NOT_REPORTED", "low", "Scope 3 emissions not reported",
                          f"Scope 1 and 2 are disclosed for FY{latest} but no Scope 3 total was found. For most sectors "
                          "Scope 3 is the largest share of the footprint."))

    # 5. Reported Scope 1+2 total does not equal its parts.
    for (m, y), tot in best.items():
        if m != "ghg_scope12_total" or not has("ghg_scope1", y):
            continue
        s1 = best[("ghg_scope1", y)].value
        options = [best[(k, y)].value for k in SCOPE2_KEYS if (k, y) in best]
        if options and all(abs(tot.value - (s1 + s2)) > 0.02 * tot.value for s2 in options):
            flags.append(Flag("SCOPE_SUM_MISMATCH", "medium", f"Scope 1 + 2 total does not add up (FY{y})",
                              f"Reported total {_fmt(tot.value)} vs Scope 1 {_fmt(s1)} + Scope 2 "
                              + " / ".join(_fmt(o) for o in options) + ".",
                              {"page": tot.page, "quote": tot.quote}, (m, y)))

    # 6. Year-on-year jumps inside this report (restatement, boundary change or error).
    for metric in ("ghg_scope1", *SCOPE2_KEYS, "ghg_scope3", "ghg_scope12_total"):
        series = sorted(((y, best[(metric, y)]) for (m, y) in best if m == metric), key=lambda t: t[0])
        for (y0, a), (y1, b) in zip(series, series[1:]):
            if y1 - y0 != 1 or max(a.value, b.value) < 1000 or min(a.value, b.value) <= 0:
                continue
            change = (b.value - a.value) / a.value
            if abs(change) >= 0.5:
                flags.append(Flag("YOY_SWING", "medium" if abs(change) >= 1 else "low",
                                  f"{'Increase' if change > 0 else 'Drop'} of {abs(change):.0%} in {metric.replace('ghg_', '').replace('_', ' ')} (FY{y0}→FY{y1})",
                                  f"FY{y0}: {_fmt(a.value)} → FY{y1}: {_fmt(b.value)}. Large swings usually mean a boundary change, "
                                  "a methodology change, a restatement or an extraction/unit error. Check the notes in the report.",
                                  {"page": b.page, "quote": b.quote, "from": a.value, "to": b.value}, (metric, y1)))

    # 7. Values that differ from what an earlier report said for the same year (restatements).
    for (m, y), c in best.items():
        prev = history.get((m, y))
        if prev and prev.get("value") and abs(prev["value"] - c.value) > 0.05 * max(prev["value"], c.value):
            flags.append(Flag("RESTATEMENT", "low", f"{m.replace('ghg_', '').replace('_', ' ').title()} for FY{y} differs from an earlier report",
                              f"This report: {_fmt(c.value, c.unit)} (p.{c.page}). Earlier report #{prev['report_id']}: "
                              f"{_fmt(prev['value'], c.unit)}. Restatements should be explained in the report.",
                              {"page": c.page, "previous_report_id": prev["report_id"], "previous_value": prev["value"]}, (m, y)))

    # 8. Market-based Scope 2 of zero.
    for y in years[:1]:
        mk, loc = best.get(("ghg_scope2_market", y)), best.get(("ghg_scope2_location", y))
        if mk and mk.value == 0 and loc and loc.value > 0:
            flags.append(Flag("MARKET_SCOPE2_ZERO", "low", "Market-based Scope 2 reported as zero",
                              f"Location-based Scope 2 is {_fmt(loc.value)}. A zero market-based figure relies on renewable "
                              "certificates or PPAs; check their quality and additionality.", {"page": mk.page}, ("ghg_scope2_market", y)))

    # 9. Net-zero target with no interim target.
    if claims.net_zero_year and not claims.has_interim_target:
        flags.append(Flag("NET_ZERO_NO_INTERIM", "medium", f"Net-zero by {claims.net_zero_year} without an interim target",
                          "The report commits to net zero but no near-term (2025-2035) percentage reduction target or "
                          "SBTi validation was found. Long-dated targets without milestones are a common greenwashing pattern.",
                          {"page": claims.net_zero_page, "quote": claims.net_zero_quote}))

    # 10. Carbon-neutral claims alongside offsets / certificates.
    if claims.carbon_neutral_claim and claims.offsets_mentioned:
        flags.append(Flag("NEUTRALITY_VIA_OFFSETS", "low", "Carbon-neutral claim alongside offsets or certificates",
                          "The report claims carbon or climate neutrality and mentions offsets, carbon credits or renewable "
                          "energy certificates. Check how much of the claim depends on them.",
                          {"page": claims.neutral_page, "quote": claims.neutral_quote, "offsets_page": claims.offsets_page}))

    # 11. Ambiguous units.
    amb = [c for c in best.values() if c.unit_ambiguous]
    if amb:
        c = amb[0]
        flags.append(Flag("UNIT_AMBIGUOUS", "info", "Unit 'MT' interpreted as metric tonnes",
                          f"'{c.raw_unit}' can mean metric tonnes or megatonnes. GreenOrb read it as metric tonnes "
                          f"(e.g. {c.metric} FY{c.fiscal_year} = {_fmt(c.value)}). Verify against the report.",
                          {"page": c.page, "quote": c.quote}, (c.metric, c.fiscal_year)))

    # 12. Table parser and LLM disagree.
    for cf in conflicts[:5]:
        flags.append(Flag("EXTRACTION_CONFLICT", "info", f"Two readings disagree for {cf['metric']} FY{cf['fiscal_year']}",
                          f"Table parser: {_fmt(cf['table_value'], cf['unit'])} (p.{cf['table_page']}); "
                          f"LLM: {_fmt(cf['llm_value'], cf['unit'])} (p.{cf['llm_page']}). The table reading is used; please verify.",
                          cf, (cf["metric"], cf["fiscal_year"])))
    return flags
