"""Merge table and LLM candidates into the rows stored for a report."""
from __future__ import annotations

from collections import defaultdict
from dataclasses import replace

from .tables import Candidate


def _close(a: float | None, b: float | None, tol: float = 0.01) -> bool:
    if a is None or b is None:
        return False
    if a == b:
        return True
    return abs(a - b) <= tol * max(abs(a), abs(b))


def merge(table: list[Candidate], llm: list[Candidate]) -> tuple[list[Candidate], list[dict]]:
    """Return (final candidates, conflicts). Conflicts are table-vs-LLM disagreements worth a review flag."""
    # 1. Collapse duplicate table readings (BRSR summary tables repeat the same numbers).
    groups: dict[tuple, list[Candidate]] = defaultdict(list)
    for c in table:
        groups[c.key].append(c)
    final: list[Candidate] = []
    by_key: dict[tuple, list[Candidate]] = defaultdict(list)
    for key, cands in groups.items():
        distinct: list[tuple[Candidate, int]] = []
        for c in sorted(cands, key=lambda c: -c.confidence):
            for i, (d, n) in enumerate(distinct):
                if (c.value is None and d.value is None) or _close(c.value, d.value, 0.005):
                    distinct[i] = (d, n + 1)
                    break
            else:
                distinct.append((c, 1))
        # Most repeated value wins; a "total" label or a larger value breaks ties.
        distinct.sort(key=lambda dn: (dn[0].value is not None, dn[1], dn[0].confidence, "total" in dn[0].quote.lower(), dn[0].value or 0), reverse=True)
        for rank, (c, n) in enumerate(distinct[:3]):
            if rank == 0:
                c = replace(c, confidence=min(0.95, c.confidence + (0.03 if n > 1 else 0)))
            else:
                c = replace(c, confidence=round(max(0.2, c.confidence - 0.25), 2), notes=c.notes + ["Alternative value found in another table on the same page set."])
            final.append(c)
            by_key[key].append(c)

    # 2. Reconcile LLM readings against the table readings.
    conflicts: list[dict] = []
    for l in llm:
        if l.status == "rejected":
            final.append(l)
            continue
        keys = [k for k in by_key if k[0] == l.metric and k[1] == l.fiscal_year and (not l.boundary or k[2] == (l.boundary or ""))]
        matched = False
        for k in keys:
            for i, t in enumerate(by_key[k]):
                if _close(t.value, l.value):
                    upgraded = replace(t, method="table+llm", confidence=round(min(0.98, max(t.confidence, l.confidence) + 0.1), 2),
                                       notes=t.notes + [n for n in l.notes if n.startswith("Read by")] + ["Table parser and LLM agree."])
                    final[final.index(t)] = upgraded
                    by_key[k][i] = upgraded
                    matched = True
                    break
            if matched:
                break
        if matched:
            continue
        primary_table = [by_key[k][0] for k in keys if by_key[k] and by_key[k][0].value is not None]
        if primary_table:
            t = primary_table[0]
            conflicts.append({"metric": l.metric, "fiscal_year": l.fiscal_year, "table_value": t.value, "table_page": t.page,
                              "llm_value": l.value, "llm_page": l.page, "unit": l.unit})
            final.append(replace(l, confidence=round(min(l.confidence, 0.5), 2), notes=l.notes + ["Disagrees with the table reading."]))
        else:
            final.append(l)
            by_key[l.key].append(l)
    return final, conflicts
