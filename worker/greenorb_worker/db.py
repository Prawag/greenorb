"""Postgres access for the worker: job queue + result storage (schema `esg`, see Backend/migrations)."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

log = logging.getLogger(__name__)


def connect(url: str) -> psycopg.Connection:
    return psycopg.connect(url, autocommit=True, row_factory=dict_row, connect_timeout=15)


def schema_ready(conn: psycopg.Connection) -> bool:
    row = conn.execute("SELECT to_regclass('esg.jobs') AS t").fetchone()
    return bool(row and row["t"])


def has_vector(conn: psycopg.Connection) -> bool:
    row = conn.execute(
        "SELECT 1 AS ok FROM information_schema.columns WHERE table_schema='esg' AND table_name='chunks' AND column_name='embedding'"
    ).fetchone()
    return bool(row)


# ── Queue ─────────────────────────────────────────────────────────────────────
def requeue_stale(conn: psycopg.Connection, minutes: int) -> int:
    cur = conn.execute(
        """UPDATE esg.jobs SET status = 'queued', locked_at = NULL, locked_by = NULL,
                  logs = logs || %s::jsonb
            WHERE status = 'running' AND locked_at < now() - make_interval(mins => %s)""",
        (json.dumps([{"at": _now(), "level": "warn", "message": "Worker stopped responding; job re-queued."}]), minutes),
    )
    return cur.rowcount


def claim_job(conn: psycopg.Connection, worker_id: str) -> dict | None:
    return conn.execute(
        """UPDATE esg.jobs SET status = 'running', locked_at = now(), locked_by = %s, attempts = attempts + 1,
                  stage = 'starting', progress = 1, error = NULL
            WHERE id = (SELECT id FROM esg.jobs
                         WHERE status = 'queued' AND run_after <= now()
                         ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1)
        RETURNING *""",
        (worker_id,),
    ).fetchone()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def job_log(conn: psycopg.Connection, job_id: int, message: str, *, stage: str | None = None, progress: int | None = None, level: str = "info") -> None:
    conn.execute(
        """UPDATE esg.jobs SET logs = logs || %s::jsonb, locked_at = now(),
                  stage = coalesce(%s, stage), progress = coalesce(%s, progress)
            WHERE id = %s""",
        (json.dumps([{"at": _now(), "level": level, "message": message[:500]}]), stage, progress, job_id),
    )


def job_succeeded(conn: psycopg.Connection, job_id: int, message: str) -> None:
    conn.execute(
        """UPDATE esg.jobs SET status = 'succeeded', stage = 'done', progress = 100, finished_at = now(),
                  locked_at = NULL, logs = logs || %s::jsonb WHERE id = %s""",
        (json.dumps([{"at": _now(), "level": "info", "message": message}]), job_id),
    )


def job_failed(conn: psycopg.Connection, job: dict, error: str, *, retryable: bool) -> str:
    attempts, max_attempts = job["attempts"], job["max_attempts"]
    if retryable and attempts < max_attempts:
        delay = 60 * (4 ** (attempts - 1))  # 1 min, 4 min, 16 min
        conn.execute(
            """UPDATE esg.jobs SET status = 'queued', locked_at = NULL, locked_by = NULL, error = %s,
                      run_after = now() + make_interval(secs => %s), logs = logs || %s::jsonb WHERE id = %s""",
            (error[:2000], delay, json.dumps([{"at": _now(), "level": "warn", "message": f"Attempt {attempts} failed: {error[:300]}. Retrying in {delay // 60} min."}]), job["id"]),
        )
        return "retry"
    conn.execute(
        """UPDATE esg.jobs SET status = 'failed', finished_at = now(), locked_at = NULL, error = %s,
                  logs = logs || %s::jsonb WHERE id = %s""",
        (error[:2000], json.dumps([{"at": _now(), "level": "error", "message": f"Failed: {error[:300]}"}]), job["id"]),
    )
    if job.get("report_id"):
        conn.execute("UPDATE esg.reports SET status = 'failed', error = %s WHERE id = %s", (error[:2000], job["report_id"]))
    return "failed"


# ── Reports ──────────────────────────────────────────────────────────────────
def load_report(conn: psycopg.Connection, report_id: int) -> dict | None:
    return conn.execute(
        """SELECT r.*, c.name AS company_name, c.slug AS company_slug, c.sector AS company_sector
             FROM esg.reports r JOIN esg.companies c ON c.id = r.company_id WHERE r.id = %s""",
        (report_id,),
    ).fetchone()


def load_file(conn: psycopg.Connection, report_id: int) -> bytes | None:
    row = conn.execute("SELECT content FROM esg.report_files WHERE report_id = %s", (report_id,)).fetchone()
    return bytes(row["content"]) if row else None


def history(conn: psycopg.Connection, company_id: int, exclude_report_id: int) -> dict[tuple[str, int], dict]:
    rows = conn.execute(
        """SELECT metric, fiscal_year, value, report_id, page FROM esg.metrics
            WHERE company_id = %s AND report_id <> %s AND is_primary AND status <> 'rejected' AND method <> 'legacy'""",
        (company_id, exclude_report_id),
    ).fetchall()
    return {(r["metric"], r["fiscal_year"]): r for r in rows}


def save_results(conn: psycopg.Connection, *, report: dict, result: dict, store_file: bytes | None = None) -> dict:
    """Atomically replace this report's extracted metrics, open flags and chunks."""
    report_id, company_id = report["id"], report["company_id"]
    with conn.transaction():
        conn.execute(
            "DELETE FROM esg.metrics WHERE report_id = %s AND method IN ('table','llm','table+llm') AND status <> 'verified'",
            (report_id,),
        )
        reviewed = {
            (r["code"], r["metric"], r["fiscal_year"])
            for r in conn.execute(
                """SELECT f.code, m.metric, m.fiscal_year FROM esg.flags f LEFT JOIN esg.metrics m ON m.id = f.metric_id
                    WHERE f.report_id = %s AND f.status <> 'open'""",
                (report_id,),
            ).fetchall()
        }
        conn.execute("DELETE FROM esg.flags WHERE report_id = %s AND status = 'open'", (report_id,))
        conn.execute("DELETE FROM esg.chunks WHERE report_id = %s", (report_id,))

        metric_ids: dict[tuple[str, int], int] = {}
        for c in sorted(result["candidates"], key=lambda c: -c.confidence):
            row = conn.execute(
                """INSERT INTO esg.metrics (company_id, report_id, metric, fiscal_year, period_label, value, unit, raw_value,
                                            raw_unit, boundary, page, quote, method, confidence, grounded, status, notes)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                (company_id, report_id, c.metric, c.fiscal_year, c.period_label, c.value, c.unit, c.raw_value, c.raw_unit,
                 c.boundary, c.page or None, c.quote, c.method, c.confidence, c.grounded, c.status, " ".join(c.notes) or None),
            ).fetchone()
            if c.status != "rejected" and c.value is not None:
                metric_ids.setdefault((c.metric, c.fiscal_year), row["id"])
            elif c.value is None:
                metric_ids.setdefault((c.metric, c.fiscal_year), row["id"])

        for f in result["flags"]:
            key = (f.code, f.metric[0] if f.metric else None, f.metric[1] if f.metric else None)
            if key in reviewed:
                continue  # a reviewer already decided on this signal
            conn.execute(
                """INSERT INTO esg.flags (company_id, report_id, metric_id, code, severity, title, detail, evidence)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
                (company_id, report_id, metric_ids.get(f.metric) if f.metric else None, f.code, f.severity, f.title, f.detail, Jsonb(f.evidence)),
            )

        embeddings = result.get("embeddings") if has_vector(conn) else None
        with conn.cursor() as cur:
            rows = []
            for i, ch in enumerate(result["chunks"]):
                vec = embeddings[i] if embeddings else None
                rows.append((report_id, company_id, ch.page, ch.ord, ch.content.replace("\x00", ""), "[" + ",".join(f"{x:.6f}" for x in vec) + "]" if vec else None))
            if embeddings is not None:
                cur.executemany(
                    "INSERT INTO esg.chunks (report_id, company_id, page, ord, content, embedding) VALUES (%s,%s,%s,%s,%s,%s::vector)", rows
                )
            else:
                cur.executemany("INSERT INTO esg.chunks (report_id, company_id, page, ord, content) VALUES (%s,%s,%s,%s,%s)", [r[:5] for r in rows])

        a = result["assurance"]
        conn.execute(
            """UPDATE esg.reports SET status = 'processed', error = NULL, processed_at = now(),
                      page_count = %s, fiscal_year = %s, period_label = %s, frameworks = %s,
                      assurance_level = %s, assurance_provider = %s, assurance_page = %s, stats = %s,
                      title = coalesce(title, %s), file_sha256 = coalesce(file_sha256, %s), file_size = coalesce(file_size, %s),
                      source_url = coalesce(source_url, %s)
                WHERE id = %s""",
            (result["page_count"], result["fiscal_year"], result["period_label"], result["frameworks"], a.level, a.provider, a.page,
             Jsonb(result["stats"]), result.get("title"), result.get("sha256"), result.get("size"), result.get("final_url"), report_id),
        )
        if store_file is not None:
            conn.execute(
                "INSERT INTO esg.report_files (report_id, content) VALUES (%s, %s) ON CONFLICT (report_id) DO NOTHING",
                (report_id, store_file),
            )
        conn.execute("SELECT esg.recompute_primary(%s)", (company_id,))
    return {"metrics": len(result["candidates"]), "flags": len(result["flags"]), "chunks": len(result["chunks"])}


# ── Companies (bulk import of local PDFs) ─────────────────────────────────────
import re as _re
import unicodedata as _ud

_SUFFIX = _re.compile(r"-(ltd|limited|inc|incorporated|corp|corporation|plc|llc|ag|sa|nv|co|company|group|holdings?)$")


def slugify(name: str) -> str:
    s = _ud.normalize("NFKD", name).encode("ascii", "ignore").decode().lower().replace("&", " and ")
    s = _re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:80]
    return s or "company"


def name_key(name: str) -> str:
    return _SUFFIX.sub("", _SUFFIX.sub("", slugify(name)))


def resolve_company(conn: psycopg.Connection, name: str, *, country: str | None = None) -> dict:
    slug, key = slugify(name), name_key(name)
    rows = conn.execute(
        "SELECT * FROM esg.companies WHERE slug = %s OR lower(name) = lower(%s) OR slug LIKE %s LIMIT 20",
        (slug, name, key + "%"),
    ).fetchall()
    for r in rows:
        if r["slug"] == slug or r["name"].lower() == name.lower():
            return r
    for r in rows:
        if name_key(r["name"]) == key:
            return r
    final, i = slug, 2
    while conn.execute("SELECT 1 FROM esg.companies WHERE slug = %s", (final,)).fetchone():
        final, i = f"{slug}-{i}", i + 1
    return conn.execute(
        "INSERT INTO esg.companies (slug, name, country) VALUES (%s, %s, %s) RETURNING *", (final, name, country)
    ).fetchone()


def register_local_report(conn: psycopg.Connection, *, company: dict, path: str, sha256: str, size: int, year_hint: int | None,
                          store_bytes: bytes | None) -> tuple[int, int | None, bool]:
    """Create (or reuse) a report row for a local PDF and enqueue it. Returns (report_id, job_id, created)."""
    existing = conn.execute(
        "SELECT id, status FROM esg.reports WHERE company_id = %s AND file_sha256 = %s", (company["id"], sha256)
    ).fetchone()
    if existing and existing["status"] in ("processed", "queued", "processing"):
        return existing["id"], None, False
    with conn.transaction():
        if existing:
            report_id = existing["id"]
        else:
            report_id = conn.execute(
                """INSERT INTO esg.reports (company_id, source_type, file_name, file_sha256, file_size, fiscal_year, status)
                   VALUES (%s, 'local', %s, %s, %s, %s, 'queued') RETURNING id""",
                (company["id"], path.replace("\\", "/").split("/")[-1][:250], sha256, size, year_hint),
            ).fetchone()["id"]
        if store_bytes is not None:
            conn.execute("INSERT INTO esg.report_files (report_id, content) VALUES (%s, %s) ON CONFLICT DO NOTHING", (report_id, store_bytes))
        conn.execute("UPDATE esg.reports SET status = 'queued', error = NULL WHERE id = %s", (report_id,))
        job_id = conn.execute(
            """INSERT INTO esg.jobs (kind, payload, company_id, report_id, logs)
               VALUES ('ingest_report', %s, %s, %s, %s) RETURNING id""",
            (Jsonb({"report_id": report_id, "local_path": path}), company["id"], report_id,
             Jsonb([{"at": _now(), "level": "info", "message": f"Registered local file {path}"}])),
        ).fetchone()["id"]
    return report_id, job_id, True
