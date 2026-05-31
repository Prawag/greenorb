from pydantic_settings import BaseSettings
from pathlib import Path
import os


class Settings(BaseSettings):
    # LLM
    anthropic_api_key: str = ""
    openai_api_key: str = ""

    # Search
    tavily_api_key: str = ""

    # Database
    database_url: str = "postgresql://esg_user:esg_password@localhost:5432/esg_agent"
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "esg_agent"
    postgres_user: str = "esg_user"
    postgres_password: str = "esg_password"

    # App
    log_level: str = "INFO"
    download_dir: Path = Path("./downloads")
    max_concurrent_scrapers: int = 3
    request_delay_seconds: float = 2.0
    max_retries: int = 3
    chunk_size: int = 1000
    chunk_overlap: int = 200
    embedding_model: str = "all-MiniLM-L6-v2"

    class Config:
        env_file = ".env"
        extra = "ignore"


# Resolve .env path relative to the esg_agent directory
_env_path = Path(__file__).parent.parent / ".env"
if _env_path.exists():
    os.environ.setdefault("ENV_FILE", str(_env_path))

settings = Settings(_env_file=str(_env_path) if _env_path.exists() else ".env")
settings.download_dir.mkdir(parents=True, exist_ok=True)
