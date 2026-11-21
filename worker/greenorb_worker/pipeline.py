"""One report, end to end: fetch → parse → extract → ground → validate → index → store."""
from __future__ import annotations

import hashlib
import logging
import time
from collections import Counter
from typing import Callable

from . import db
from .chunks import chunk_document
from .config import Settings
from .extract_llm import extract_with_llm
from .fetch import FetchError, fetch_pdf
from .flags import evaluate
from .llm import LLMClient
from .metrics import METRICS
from .numbers import detect_locale, detect_report_year
from .pdf import open_document
from .select import merge
from .signals import detect_assurance, detect_claims, detect_frameworks
from .tables import extract_page

log = logging.getLogger(__name__)


class PermanentError(RuntimeError):
    """Errors that retrying will not fix (bad PDF, blocked URL, ...)."""


def analyse(
    data: bytes,
    *,
    settings: Settings,
    llm: LLMClient,
    year_hint: int | None = None,
    history: dict | None = None,
    progress: Callable[[str, str, int], None] = lambda *_: None,
) -> dict:
    """Pure analysis (no database): returns candidates, flags, chunks and report metadata."""
    t0 = time.time()
    progress("parse", "Reading PDF layout", 15)
    try:
        doc = open_document(data, max_pages=settings.max_pages, ocr_pages=settings.ocr_pages)
    except Exception as exc:  # corrupt, encrypted or not a PDF
        raise PermanentError(f"Could not read the PDF: {exc}") from exc
    if not doc.pages:
        raise PermanentError("The PDF has no pages.")
    text_pages = sum(1 for p in doc.pages if len(p.text) > 40)
    if text_pages == 0:
        raise PermanentError("The PDF has no extractable text (scanned images and OCR unavailable).")
    progress("parse", f"{doc.page_count} pages, {text_pages} with text, {sum(p.ocr for p in doc.pages)} OCR'd", 25)

    texts = [p.text for p in doc.pages]
    locale = detect_locale("\n".join(texts))
    year, period_label, year_method = detect_report_year(texts, year_hint)

    progress("extract", "Parsing tables", 35)
    table: list = []
    for p in doc.pages:
        table.extend(extract_page(p, locale=locale, doc_year=year))
    # The latest year with GHG data in the tables is the most reliable report year.
    ghg_years = Counter(c.fiscal_year for c in table if c.metric.startswith("ghg_") and c.value is not None)
    if ghg_years:
        top = max(ghg_years)
        if year is None or abs(top - year) <= 2:
            if top != year:
                period_label = next((c.period_label for c in table if c.fiscal_year == top and c.period_label), period_label)
            year, year_method = top, "tables"
    progress("extract", f"Table parser found {len(table)} readings", 45)

    have_families = {METRICS[c.metric].family for c in table if c.value is not None and c.fiscal_year == year}
    missing = {"ghg", "energy", "water", "waste"} - have_families
    llm_cands, llm_notes = [], []
    if llm.configured:
        progress("extract", f"Asking the LLM to read the key pages (missing: {', '.join(sorted(missing)) or 'none, cross-checking'})", 50)
        llm_cands, llm_notes = extract_with_llm(
            llm, doc, locale=locale, missing_families=missing,
            chars_per_call=settings.llm_chars_per_call, max_calls=settings.llm_max_calls,
            log_fn=lambda m: progress("extract", m, 60),
        )
    else:
        llm_notes.append("No LLM configured: table extraction only.")
    for n in llm_notes:
        progress("extract", n, 65)

    candidates, conflicts = merge(table, llm_cands)
    if year is None:
        ys = [c.fiscal_year for c in candidates if c.status != "rejected"]
        year = max(ys) if ys else None

    progress("validate", "Checking assurance, targets and consistency", 72)
    assurance = detect_assurance(doc)
    claims = detect_claims(doc)
    frameworks = detect_frameworks(doc)
    flags = evaluate(candidates, report_year=year, assurance=assurance, claims=claims, conflicts=conflicts, history=history or {})

    progress("index", "Building passages for Ask-the-report", 80)
    chunks = chunk_document(doc)
    embeddings = None
    if llm.embeddings_provider != "none" and chunks:
        try:
            embeddings = []
            for i in range(0, len(chunks), 64):
                embeddings.extend(llm.embed([c.content for c in chunks[i:i + 64]]) or [])
                progress("index", f"Embedded {min(i + 64, len(chunks))}/{len(chunks)} passages", 85)
            if len(embeddings) != len(chunks):
                embeddings = None
        except Exception as exc:  # embeddings are optional: fall back to full-text search
            progress("index", f"Embeddings failed ({exc}); full-text search only", 85)
            embeddings = None

    kept = [c for c in candidates if c.status != "rejected" and c.value is not None]
    stats = {
        "locale": locale,
        "year_method": year_method,
        "table_readings": len(table),
        "llm_readings": len(llm_cands),
        "llm_rejected": sum(1 for c in llm_cands if c.status == "rejected"),
        "metrics_kept": len(kept),
        "conflicts": len(conflicts),
        "ocr_pages": sum(p.ocr for p in doc.pages),
        "scanned_pages": sum(p.scanned for p in doc.pages),
        "seconds": round(time.time() - t0, 1),
        "llm_notes": llm_notes,
    }
    title = (doc.metadata.get("title") or "").strip() or None
    return {
        "candidates": candidates,
        "flags": flags,
        "chunks": chunks,
        "embeddings": embeddings,
        "assurance": assurance,
        "frameworks": frameworks,
        "fiscal_year": year,
        "period_label": period_label,
        "page_count": doc.page_count,
        "title": title[:300] if title and len(title) > 4 else None,
        "stats": stats,
        "sha256": hashlib.sha256(data).hexdigest(),
        "size": len(data),
    }


def process_job(conn, job: dict, settings: Settings, llm: LLMClient) -> str:
    job_id = job["id"]
    report_id = (job.get("payload") or {}).get("report_id") or job.get("report_id")

    def progress(stage: str, message: str, pct: int) -> None:
        db.job_log(conn, job_id, message, stage=stage, progress=pct)
        log.info("[job %s] %s", job_id, message)

    report = db.load_report(conn, report_id) if report_id else None
    if not report:
        db.job_failed(conn, job, f"Report {report_id} no longer exists.", retryable=False)
        return "failed"
    conn.execute("UPDATE esg.reports SET status = 'processing', error = NULL WHERE id = %s", (report_id,))
    progress("fetch", f"Processing {report['company_name']} report #{report_id}", 5)
    try:
        data = db.load_file(conn, report_id)
        store_file = None
        final_url = None
        local_path = (job.get("payload") or {}).get("local_path")
        if data is None and local_path:
            try:
                with open(local_path, "rb") as fh:
                    data = fh.read()
            except OSError as exc:
                raise PermanentError(f"Local file is not readable on this worker: {local_path} ({exc.strerror})") from exc
        if data is None:
            if not report.get("source_url"):
                raise PermanentError("Nothing to process: no uploaded file and no source URL.")
            progress("fetch", f"Downloading {report['source_url']}", 8)
            try:
                data, final_url = fetch_pdf(report["source_url"], max_mb=settings.max_download_mb, timeout_s=settings.download_timeout_s)
            except FetchError as exc:
                raise PermanentError(str(exc)) from exc
            progress("fetch", f"Downloaded {len(data) / 1_048_576:.1f} MB", 12)
            if settings.store_fetched_pdfs:
                store_file = data
        result = analyse(
            data, settings=settings, llm=llm, year_hint=report.get("fiscal_year"),
            history=db.history(conn, report["company_id"], report_id), progress=progress,
        )
        result["final_url"] = final_url if final_url and final_url != report.get("source_url") else None
        progress("store", "Saving metrics, flags and passages", 92)
        counts = db.save_results(conn, report=report, result=result, store_file=store_file)
        kept = result["stats"]["metrics_kept"]
        db.job_succeeded(conn, job_id, f"Done: {kept} metrics, {counts['flags']} flags, {counts['chunks']} passages in {result['stats']['seconds']}s.")
        return "succeeded"
    except PermanentError as exc:
        return db.job_failed(conn, job, str(exc), retryable=False)
    except Exception as exc:  # network blips, provider outages, DB hiccups: retry with backoff
        log.exception("job %s failed", job_id)
        return db.job_failed(conn, job, f"{type(exc).__name__}: {exc}", retryable=True)
