from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import NullPool
from loguru import logger
from core.config import settings

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_recycle=300,
    echo=False
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency that yields a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Run the SQL migrations file to create tables."""
    from pathlib import Path
    sql_path = Path(__file__).parent.parent / "migrations" / "init.sql"
    sql = sql_path.read_text()
    with engine.connect() as conn:
        conn.execute(text(sql))
        conn.commit()
    logger.info("Database initialized successfully.")
