"""GreenOrb worker CLI.

  python -m greenorb_worker run                 # long-running queue worker (Docker / Render / VPS)
  python -m greenorb_worker drain               # process everything queued, then exit (cron / GitHub Actions)
  python -m greenorb_worker analyse report.pdf  # analyse one PDF without a database, print JSON
  python -m greenorb_worker bulk ./reports      # register a folder of PDFs and process them (resumable)
  python -m greenorb_worker harvest             # queue new public reports from worker/seeds/*.csv
"""
from __future__ import annotations

import argparse
import csv
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


def cmd_run(settings: Settings, *, drain: bool = False, max_jobs: int | None = None, local_files: bool = False,
            only_local: bool = False) -> int:
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
            job = db.claim_job(conn, settings.worker_id, local_files=local_files, only_local=only_local)
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


def plausible_company(name: str) -> bool:
    """Reject names the old downloader made from file titles, e.g. "2025 Q-1,2" or "2024-santanderus"."""
    if re.match(r"^(19|20)\d{2}\b", name):
        return False
    return bool(re.search(r"[A-Za-z]{3,}", name))


def cmd_bulk(settings: Settings, folder: str, limit: int | None, store: bool, process: bool, pattern: str, batch: int,
             retry_empty: bool = False) -> int:
    """Register local PDFs in batches and process each batch before reading more, so figures appear as it goes.

    Safe to stop and restart: files already registered (by content hash) are skipped.
    """
    conn = _connect(settings)
    files = sorted(Path(folder).glob(pattern))
    log.info("%d files in %s", len(files), folder)
    registered = pending = skipped = 0
    for f in files:
        if _stop or (limit and registered >= limit):
            break
        try:
            if f.stat().st_size < 10_000:
                skipped += 1
                continue
            data = f.read_bytes()
        except OSError as exc:
            log.warning("skip %s (%s)", f.name, exc)
            continue
        if b"%PDF-" not in data[:1024]:
            skipped += 1
            continue
        name, year = company_from_filename(f.stem)
        if not plausible_company(name):
            log.info("skip %s (no usable company name in the file name)", f.name)
            skipped += 1
            continue
        sha = hashlib.sha256(data).hexdigest()
        same = db.report_with_sha(conn, sha)
        if same and retry_empty and same["status"] in ("processed", "failed") and not same["metric_count"]:
            job_id = db.requeue_local(conn, same, str(f.resolve()), "Read again: the earlier pass found no figures")
            registered += 1
            pending += 1
            log.info("re-reading %s (report #%s had no figures, job #%s)", f.name, same["id"], job_id)
            if process and pending >= batch:
                cmd_run(settings, drain=True, max_jobs=pending + 5, only_local=True)
                pending = 0
            continue
        if same:
            # The old downloader saved one PDF under several names and years; read it once.
            log.debug("already known: %s is report #%s (%s)", f.name, same["id"], same["company"])
            skipped += 1
            continue
        company = db.resolve_company(conn, name)
        report_id, job_id, created = db.register_local_report(
            conn, company=company, path=str(f.resolve()), sha256=sha, size=len(data), year_hint=None, store_bytes=data if store else None
        )
        if created:
            registered += 1
            pending += 1
            log.info("queued %s → %s (report #%s, job #%s)", f.name, company["name"], report_id, job_id)
        if process and pending >= batch:
            cmd_run(settings, drain=True, max_jobs=pending + 5, only_local=True)
            db.merge_duplicate_companies(conn)
            pending = 0
    if process and pending and not _stop:
        cmd_run(settings, drain=True, only_local=True)
    merged = db.merge_duplicate_companies(conn)
    conn.close()
    log.info("Done: %d new report(s), %d file(s) skipped (duplicates, tiny or unnamed), %d company name variant(s) merged.", registered, skipped, merged)
    return 0


def load_seeds(paths: list[Path]) -> list[dict]:
    """Seed rows: company, country, sector, year, url (CSV with a header; '#' lines are comments)."""
    out: list[dict] = []
    for p in paths:
        with p.open(encoding="utf-8") as fh:
            rows = csv.DictReader(line for line in fh if line.strip() and not line.lstrip().startswith("#"))
            for row in rows:
                url = (row.get("url") or "").strip()
                company = (row.get("company") or "").strip()
                if not url.startswith(("http://", "https://")) or not company:
                    continue
                year = (row.get("year") or "").strip()
                out.append({
                    "company": company,
                    "country": (row.get("country") or "").strip() or None,
                    "sector": (row.get("sector") or "").strip() or None,
                    "year": int(year) if year.isdigit() else None,
                    "url": url,
                    "source": p.name,
                })
    return out


def cmd_harvest(settings: Settings, seed_paths: list[str], count: int) -> int:
    """Queue up to `count` public reports from the seed lists that GreenOrb hasn't read yet."""
    paths: list[Path] = []
    for sp in seed_paths:
        p = Path(sp)
        if p.is_dir():
            paths.extend(sorted(p.glob("*.csv")))
        elif p.is_file():
            paths.append(p)
        else:
            log.warning("Seed list %s not found; skipping.", p)
    seeds = load_seeds(paths)
    conn = _connect(settings)
    queued = conn.execute("SELECT count(*) AS n FROM esg.jobs WHERE status = 'queued' AND NOT (payload ? 'local_path')").fetchone()["n"]
    if queued >= count:
        log.info("Harvest skipped: %d report(s) already waiting in the queue.", queued)
        conn.close()
        return 0
    count -= queued
    known = db.known_source_urls(conn)
    todo = [s for s in seeds if s["url"] not in known]
    # Newest reports first, then spread across companies so one firm's archive doesn't fill a run.
    todo.sort(key=lambda s: -(s["year"] or 0))
    seen: set[str] = set()
    picked: list[dict] = []
    for s in todo:
        if len(picked) >= count:
            break
        key = db.name_key(s["company"])
        if key in seen:
            continue
        seen.add(key)
        picked.append(s)
    for s in todo:
        if len(picked) >= count:
            break
        if s not in picked:
            picked.append(s)
    for s in picked:
        company = db.resolve_company(conn, s["company"], country=s["country"])
        db.update_company_facts(conn, company["id"], country=s["country"], sector=s["sector"])
        report_id, job_id = db.register_url_report(conn, company=company, url=s["url"], year_hint=s["year"],
                                                   note=f"Found in seed list {s['source']}")
        log.info("queued %s %s → report #%s", company["name"], s["year"] or "", report_id)
    conn.commit()
    conn.close()
    log.info("Harvest: %d queued, %d seeds left to read, %d seeds in total.", len(picked), max(0, len(todo) - len(picked)), len(seeds))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="greenorb_worker", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="cmd", required=True)
    rn = sub.add_parser("run", help="run the queue worker forever")
    rn.add_argument("--local-files", action="store_true", help="also take bulk-import jobs whose PDF is on this machine")
    d = sub.add_parser("drain", help="process queued jobs then exit")
    d.add_argument("--max-jobs", type=int, default=None)
    d.add_argument("--local-files", action="store_true", help="also take bulk-import jobs whose PDF is on this machine")
    d.add_argument("--harvest", type=int, default=0, metavar="N", help="first queue up to N new reports from the seed lists")
    d.add_argument("--seeds", nargs="*", default=[str(Path(__file__).resolve().parent.parent / "seeds")])
    h = sub.add_parser("harvest", help="queue public reports from seed lists (CSV: company,country,sector,year,url)")
    h.add_argument("--count", type=int, default=20)
    h.add_argument("seeds", nargs="*", default=[str(Path(__file__).resolve().parent.parent / "seeds")])
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
    b.add_argument("--batch", type=int, default=20, help="process after every N newly registered files (default 20)")
    b.add_argument("--retry-empty", action="store_true", help="also re-read files whose earlier pass found no figures")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    if args.cmd == "analyse":
        os.environ.setdefault("DATABASE_URL", "unused")
    settings = Settings.from_env()
    if args.cmd == "run":
        return cmd_run(settings, local_files=args.local_files)
    if args.cmd == "drain":
        if args.harvest:
            cmd_harvest(settings, args.seeds, args.harvest)
        return cmd_run(settings, drain=True, max_jobs=args.max_jobs, local_files=args.local_files)
    if args.cmd == "harvest":
        return cmd_harvest(settings, args.seeds, args.count)
    if args.cmd == "analyse":
        return cmd_analyse(settings, args.pdf, args.year, args.json)
    if args.cmd == "bulk":
        return cmd_bulk(settings, args.folder, args.limit, args.store_files, not args.no_process, args.pattern, args.batch,
                        args.retry_empty)
    return 1


if __name__ == "__main__":
    sys.exit(main())
