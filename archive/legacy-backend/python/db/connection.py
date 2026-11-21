import os
import logging

"""
GreenOrb Python DB Connection Module.
Provides PostgreSQL connectivity for Python agents (analyst, risk, strategy)
when they need to read/write directly to Neon, bypassing the Express API.

In dev mode (DATABASE_URL not set), falls back to a local SQLite DB.
"""

logger = logging.getLogger("db")

DATABASE_URL = os.environ.get("DATABASE_URL", "")


def get_connection():
    """
    Return a DB connection.
    Production: psycopg2 → Neon PostgreSQL
    Development: sqlite3 → local file
    """
    if DATABASE_URL:
        try:
            import psycopg2
            conn = psycopg2.connect(DATABASE_URL, connect_timeout=10)
            logger.info("Connected to Neon PostgreSQL")
            return conn
        except ImportError:
            logger.warning("psycopg2 not installed. Run: pip install psycopg2-binary")
            logger.warning("Falling back to SQLite")
        except Exception as e:
            logger.error(f"PostgreSQL connection failed: {e}")
            logger.warning("Falling back to SQLite")

    # SQLite fallback for local development
    import sqlite3
    db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "greenorb_dev.db")
    conn = sqlite3.connect(db_path)
    logger.info(f"Connected to SQLite: {db_path}")
    return conn


def init_tables(conn):
    """Create tables if they don't exist (SQLite-compatible)."""
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS companies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            sector TEXT,
            country TEXT,
            esg_rating TEXT,
            scope_1 REAL,
            scope_2 REAL,
            scope_3 REAL,
            reported_total REAL,
            energy_consumption REAL,
            water_withdrawal REAL,
            waste_generated REAL,
            renewable_energy_pct REAL,
            report_year INTEGER,
            llm_provider TEXT,
            cached_at TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS audit_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER,
            is_verified INTEGER,
            math_log TEXT,
            linguistic_flags TEXT,
            absence_signals TEXT,
            framework_tags TEXT,
            verdict TEXT,
            verdict_by TEXT DEFAULT 'system',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (company_id) REFERENCES companies(id)
        )
    """)

    conn.commit()
    logger.info("Tables initialized")
    return conn


def upsert_company(conn, data: dict) -> int:
    """Insert or update a company record. Returns the row ID."""
    from sandbox.safe_eval import coerce_float

    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO companies (name, sector, country, scope_1, scope_2, scope_3,
                               reported_total, energy_consumption, water_withdrawal,
                               waste_generated, renewable_energy_pct, report_year, llm_provider)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        data.get("company_name", "Unknown"),
        data.get("sector"),
        data.get("country"),
        coerce_float(data.get("scope_1")),
        coerce_float(data.get("scope_2")),
        coerce_float(data.get("scope_3")),
        coerce_float(data.get("reported_total")),
        coerce_float(data.get("energy_consumption")),
        coerce_float(data.get("water_withdrawal")),
        coerce_float(data.get("waste_generated")),
        coerce_float(data.get("renewable_energy_pct")),
        data.get("report_year"),
        data.get("_provider", "unknown")
    ))
    conn.commit()
    return cursor.lastrowid
