import os
import json
import hashlib
import sqlite3
import logging
from datetime import datetime, timezone
from pathlib import Path

"""
SQLite-backed PDF extraction cache.
Stores LLM results keyed by SHA-256 hash of PDF content.
Tracks hit_count, company_name, provider, and cached_at for observability.
"""

logger = logging.getLogger("pdf_cache")
DB_PATH = os.environ.get("CACHE_DB_PATH", os.path.join(os.path.dirname(os.path.abspath(__file__)), "pdf_results.db"))
Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)


def _conn() -> sqlite3.Connection:
    """Return a connection to the cache database, creating the table if needed."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS pdf_cache (
            pdf_hash     TEXT PRIMARY KEY,
            company_name TEXT,
            result_json  TEXT NOT NULL,
            provider     TEXT,
            cached_at    TEXT NOT NULL,
            hit_count    INTEGER DEFAULT 0
        )
    """)
    conn.commit()
    return conn


def hash_pdf(pdf_path: str) -> str:
    """Stable SHA-256 fingerprint of the first 64KB of raw PDF bytes."""
    try:
        with open(pdf_path, "rb") as f:
            return hashlib.sha256(f.read(65536)).hexdigest()
    except Exception:
        return "nohash"


def _cache_key(company: str, pdf_path: str) -> str:
    """Composite key: company name + PDF content hash."""
    pdf_hash = hash_pdf(pdf_path)
    raw = f"{company.lower().strip()}:{pdf_hash}"
    return hashlib.md5(raw.encode()).hexdigest()


def get(company: str, pdf_path: str) -> dict | None:
    """
    Return stored extraction result if exists. Increments hit counter.
    Returns None on cache miss.
    """
    key = _cache_key(company, pdf_path)
    try:
        conn = _conn()
        row = conn.execute(
            "SELECT result_json, provider, cached_at FROM pdf_cache WHERE pdf_hash=?",
            (key,)
        ).fetchone()
        if row:
            conn.execute(
                "UPDATE pdf_cache SET hit_count = hit_count + 1 WHERE pdf_hash=?",
                (key,)
            )
            conn.commit()
            conn.close()
            result = json.loads(row[0])
            logger.info(f"Cache HIT: {company} [{key[:12]}...]")
            print(f"[PDF Cache] Cache HIT for {company} (key={key[:8]}...)")
            return {**result, "_cached": True, "_provider": row[1]}
        conn.close()
    except Exception as e:
        logger.error(f"Cache read error: {e}")
        print(f"[PDF Cache] Cache read error: {e}")
    return None


def put(company: str, pdf_path: str, result: dict, provider: str = "unknown") -> None:
    """
    Persist an LLM extraction result keyed by company + PDF content hash.
    """
    key = _cache_key(company, pdf_path)
    # Strip internal metadata before caching
    clean_result = {k: v for k, v in result.items() if not k.startswith("_")}
    try:
        conn = _conn()
        conn.execute("""
            INSERT OR REPLACE INTO pdf_cache
            (pdf_hash, company_name, result_json, provider, cached_at)
            VALUES (?, ?, ?, ?, ?)
        """, (key, company, json.dumps(clean_result), provider,
              datetime.now(timezone.utc).isoformat()))
        conn.commit()
        conn.close()
        logger.info(f"Cached: {company} [{key[:12]}...] via {provider}")
        print(f"[PDF Cache] Cache WRITE for {company} (key={key[:8]}...) via {provider}")
    except Exception as e:
        logger.error(f"Cache write error: {e}")
        print(f"[PDF Cache] Cache write failed: {e}")


def get_stats() -> dict:
    """Return cache statistics for observability."""
    try:
        conn = _conn()
        row = conn.execute("""
            SELECT COUNT(*), SUM(hit_count), 
                   COUNT(CASE WHEN provider='gemini' THEN 1 END),
                   COUNT(CASE WHEN provider='groq' THEN 1 END)
            FROM pdf_cache
        """).fetchone()
        conn.close()
        return {
            "total_entries": row[0] or 0,
            "total_hits": row[1] or 0,
            "gemini_entries": row[2] or 0,
            "groq_entries": row[3] or 0,
        }
    except Exception:
        return {"total_entries": 0, "total_hits": 0}
