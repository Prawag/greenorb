"""Worker settings, read from the environment (and a .env file next to the worker if present)."""
from __future__ import annotations

import os
import socket
from dataclasses import dataclass, field
from pathlib import Path


def _load_dotenv() -> None:
    for candidate in (Path.cwd() / ".env", Path(__file__).resolve().parent.parent / ".env"):
        if candidate.is_file():
            for line in candidate.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
            break


def _bool(name: str, default: bool) -> bool:
    v = os.environ.get(name)
    return default if v in (None, "") else v.strip().lower() in ("1", "true", "yes", "on")


def _int(name: str, default: int) -> int:
    v = os.environ.get(name)
    return default if v in (None, "") else int(v)


@dataclass
class Settings:
    database_url: str
    worker_id: str
    poll_seconds: float = 3.0
    stale_lock_minutes: int = 30
    max_download_mb: int = 80
    download_timeout_s: int = 90
    max_pages: int = 400
    ocr_pages: int = 15
    store_fetched_pdfs: bool = False
    llm_providers: list[str] = field(default_factory=lambda: ["groq", "gemini", "openai", "ollama"])
    llm_timeout_s: int = 90
    llm_max_calls: int = 4
    llm_chars_per_call: int = 12000
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openai_base_url: str = "https://api.openai.com/v1"
    ollama_base_url: str = ""
    ollama_model: str = "llama3.1:8b"
    embeddings_provider: str = "auto"
    gemini_embed_model: str = "gemini-embedding-001"
    openai_embed_model: str = "text-embedding-3-small"
    ollama_embed_model: str = "nomic-embed-text"

    @classmethod
    def from_env(cls) -> "Settings":
        _load_dotenv()
        url = os.environ.get("DATABASE_URL", "")
        if not url:
            raise SystemExit("DATABASE_URL is required (the same Postgres the API uses).")
        s = cls(
            database_url=url,
            worker_id=os.environ.get("WORKER_ID") or f"{socket.gethostname()}:{os.getpid()}",
            poll_seconds=float(os.environ.get("WORKER_POLL_SECONDS", "3")),
            stale_lock_minutes=_int("WORKER_STALE_LOCK_MINUTES", 30),
            max_download_mb=_int("MAX_DOWNLOAD_MB", 80),
            download_timeout_s=_int("DOWNLOAD_TIMEOUT_S", 90),
            max_pages=_int("MAX_PDF_PAGES", 400),
            ocr_pages=_int("OCR_MAX_PAGES", 15),
            store_fetched_pdfs=_bool("STORE_FETCHED_PDFS", False),
            llm_providers=[p.strip() for p in os.environ.get("LLM_PROVIDERS", "groq,gemini,openai,ollama").split(",") if p.strip()],
            llm_timeout_s=_int("LLM_TIMEOUT_S", 90),
            llm_max_calls=_int("LLM_MAX_CALLS_PER_REPORT", 4),
            llm_chars_per_call=_int("LLM_CHARS_PER_CALL", 12000),
            groq_api_key=os.environ.get("GROQ_API_KEY", ""),
            groq_model=os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile"),
            gemini_api_key=os.environ.get("GEMINI_API_KEY", ""),
            gemini_model=os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"),
            openai_api_key=os.environ.get("OPENAI_API_KEY", ""),
            openai_model=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
            openai_base_url=os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1"),
            ollama_base_url=os.environ.get("OLLAMA_BASE_URL", ""),
            ollama_model=os.environ.get("OLLAMA_MODEL", "llama3.1:8b"),
            embeddings_provider=os.environ.get("EMBEDDINGS_PROVIDER", "auto"),
            gemini_embed_model=os.environ.get("GEMINI_EMBED_MODEL", "gemini-embedding-001"),
            openai_embed_model=os.environ.get("OPENAI_EMBED_MODEL", "text-embedding-3-small"),
            ollama_embed_model=os.environ.get("OLLAMA_EMBED_MODEL", "nomic-embed-text"),
        )
        if s.embeddings_provider == "auto":
            s.embeddings_provider = "gemini" if s.gemini_api_key else "openai" if s.openai_api_key else "none"
        return s
