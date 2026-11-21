"""GreenOrb worker CLI.

  python -m greenorb_worker run                 # long-running queue worker (Docker / Render / VPS)
  python -m greenorb_worker drain               # process everything queued, then exit (cron / GitHub Actions)
  python -m greenorb_worker analyse report.pdf  # analyse one PDF without a database, print JSON
  python -m greenorb_worker bulk ./reports      # register a folder of PDFs and process them
"""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import re
import signal
import sys
import time
from dataclasses import asdict
from pathlib import Path

from . import __version__, db
from .config import Settings
from .llm import LLMClient
from .pipeline import analyse, process_job

log = logging.getLogger("greenorb_worker")
_stop = False


def _handle_stop(signum, _frame):
    global _stop
    _stop = True
    log.info("Signal %s received: finishing the current job, then exiting.", signum)


def _connect(settings: Settings):
    conn = db.connect(settings.database_url)
    if not db.schema_ready(conn):
        raise SystemExit("The esg schema is missing. Start the API once (it migrates on start) or run `npm run migrate` in Backend/.")
    return conn


def cmd_run(settings: Settings, *, drain: bool = False, max_jobs: int | None = None) -> int:
    signal.signal(signal.SIGTERM, _handle_stop)
    signal.signal(signal.SIGINT, _handle_stop)
    llm = LLMClient(settings)
    log.info("GreenOrb worker %s (%s) · LLM: %s · embeddings: %s", __version__, settings.worker_id,
             " → ".join(f"{p.name}({p.model})" for p in llm.providers) or "none (tables only)", llm.embeddings_provider)
    conn = _connect(settings)
    done = 0
    last_stale_check = 0.0
    while not _stop:
        try:
            if time.time() - last_stale_check > 60:
                n = db.requeue_stale(conn, settings.stale_lock_minutes)
                if n:
                    log.warning("Re-queued %d stale job(s)", n)
                last_stale_check = time.time()
            job = db.claim_job(conn, settings.worker_id)
        except Exception as exc:  # connection dropped (Neon idles out connections): reconnect
            log.warning("Database error (%s); reconnecting in 5s", exc)
            time.sleep(5)
            try:
                conn.close()
            except Exception:
                pass
            conn = _connect(settings)
            continue
        if not job:
            if drain:
                break
            time.sleep(settings.poll_seconds)
            continue
        outcome = process_job(conn, job, settings, llm)
        log.info("Job %s → %s", job["id"], outcome)
        done += 1
        if max_jobs and done >= max_jobs:
            break
    log.info("Worker stopped after %d job(s).", done)
    conn.close()
    return 0


def cmd_analyse(settings: Settings, path: str, year: int | None, as_json: bool) -> int:
    data = Path(path).read_bytes()
    llm = LLMClient(settings)
    res = analyse(data, settings=settings, llm=llm, year_hint=year, progress=lambda s, m, p: log.info("[%s] %s", s, m))
    kept = [c for c in res["candidates"] if c.status != "rejected"]
    if as_json:
        out = {
            "fiscal_year": res["fiscal_year"],
            "assurance": asdict(res["assurance"]),
            "frameworks": res["frameworks"],
            "metrics": [asdict(c) for c in res["candidates"]],
            "flags": [asdict(f) for f in res["flags"]],
            "stats": res["stats"],
        }
        print(json.dumps(out, indent=2, default=str))
        return 0
    a = res["assurance"]
    print(f"\n{Path(path).name}: FY{res['fiscal_year']} · {res['page_count']} pages · assurance: {a.level}"
          f"{' by ' + a.provider if a.provider else ''} · frameworks: {', '.join(res['frameworks']) or 'none detected'}")
    print(f"{'metric':22} {'FY':>4} {'boundary':12} {'value':>18} {'unit':6} {'page':>4} {'method':10} conf")
    for c in sorted(kept, key=lambda c: (c.metric, -c.fiscal_year, -c.confidence)):
        v = "nil" if c.value is None else f"{c.value:,.2f}"
        print(f"{c.metric:22} {c.fiscal_year:>4} {c.boundary or '':12} {v:>18} {c.unit:6} {c.page:>4} {c.method:10} {c.confidence:.2f}")
    print("\nFlags:")
    for f in res["flags"]:
        print(f"  [{f.severity:6}] {f.code}: {f.title}")
    print(f"\n{res['stats']}")
    return 0


_FILENAME = re.compile(r"^(?P<name>.+?)[_\s-]+(?:sustainability|esg|brsr|annual|integrated|csr|impact)[_\s-]*(?:report)?[_\s-]*(?P<year>(?:19|20)\d{2})?", re.I)


def company_from_filename(stem: str) -> tuple[str, int | None]:
    m = _FILENAME.match(stem)
    name = (m.group("name") if m else stem).replace("_", " ").strip(" .-")
    year = int(m.group("year")) if m and m.group("year") else None
    name = re.sub(r"\s+", " ", name)
    if name == name.lower():  # "tata steel ltd." -> "Tata Steel Ltd."
        name = " ".join(w[:1].upper() + w[1:] for w in name.split())
    return name, year


def cmd_bulk(settings: Settings, folder: str, limit: int | None, store: bool, process: bool, pattern: str) -> int:
    conn = _connect(settings)
    files = sorted(Path(folder).glob(pattern))
    registered = 0
    for f in files:
        if limit and registered >= limit:
            break
        if f.stat().st_size < 10_000:
            log.info("skip %s (too small to be a report)", f.name)
            continue
        data = f.read_bytes()
        if b"%PDF-" not in data[:1024]:
            log.info("skip %s (not a PDF)", f.name)
            continue
        name, year = company_from_filename(f.stem)
        company = db.resolve_company(conn, name)
        sha = hashlib.sha256(data).hexdigest()
        report_id, job_id, created = db.register_local_report(
            conn, company=company, path=str(f.resolve()), sha256=sha, size=len(data), year_hint=year, store_bytes=data if store else None
        )
        if created:
            registered += 1
            log.info("queued %s → %s (report #%s, job #%s)", f.name, company["name"], report_id, job_id)
        else:
            log.info("already known: %s (report #%s)", f.name, report_id)
    conn.close()
    log.info("Registered %d new report(s).", registered)
    if process and registered:
        return cmd_run(settings, drain=True)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="greenorb_worker", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("run", help="run the queue worker forever")
    d = sub.add_parser("drain", help="process queued jobs then exit")
    d.add_argument("--max-jobs", type=int, default=None)
    a = sub.add_parser("analyse", help="analyse one PDF (no database needed)")
    a.add_argument("pdf")
    a.add_argument("--year", type=int, default=None)
    a.add_argument("--json", action="store_true")
    b = sub.add_parser("bulk", help="register a folder of local PDFs and process them")
    b.add_argument("folder")
    b.add_argument("--limit", type=int, default=None)
    b.add_argument("--pattern", default="*.pdf")
    b.add_argument("--store-files", action="store_true", help="also store PDFs in Postgres so citations open in the browser")
    b.add_argument("--no-process", action="store_true", help="only register and queue; process later with `drain` or `run`")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    if args.cmd == "analyse":
        os.environ.setdefault("DATABASE_URL", "unused")
    settings = Settings.from_env()
    if args.cmd == "run":
        return cmd_run(settings)
    if args.cmd == "drain":
        return cmd_run(settings, drain=True, max_jobs=args.max_jobs)
    if args.cmd == "analyse":
        return cmd_analyse(settings, args.pdf, args.year, args.json)
    if args.cmd == "bulk":
        return cmd_bulk(settings, args.folder, args.limit, args.store_files, not args.no_process, args.pattern)
    return 1


if __name__ == "__main__":
    sys.exit(main())
