"""Database configuration for Neon Postgres (SQLAlchemy sync + psycopg)."""
from __future__ import annotations

from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker


class Settings(BaseSettings):
    DATABASE_URL: str

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()  # reads DATABASE_URL from .env


def normalize_database_url(raw_url: str) -> str:
    """Normalize a Neon DATABASE_URL to SQLAlchemy + psycopg form.

    Accepts postgres://, postgresql:// and postgresql+psycopg://.
    Ensures sslmode=require (Neon requires SSL).
    """
    url = raw_url.strip().strip('"').strip("'")
    if not url:
        raise ValueError("DATABASE_URL is empty")

    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url[len("postgres://") :]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://") :]

    if not url.startswith("postgresql+psycopg://"):
        raise ValueError(f"Unsupported DATABASE_URL scheme: {url.split('://')[0]}")

    # Ensure sslmode=require for Neon
    scheme, netloc, path, query, fragment = urlsplit(url)
    params = dict(parse_qsl(query, keep_blank_values=True))
    if "sslmode" not in params:
        params["sslmode"] = "require"
        query = urlencode(params)
        url = urlunsplit((scheme, netloc, path, query, fragment))

    return url


DATABASE_URL = normalize_database_url(settings.DATABASE_URL)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency: yields a DB session, closes afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create tables. Imports models so metadata is registered."""
    # noqa: F401 — import side effect registers models on Base.metadata
    import models  # type: ignore

    Base.metadata.create_all(bind=engine)


def check_connection() -> None:
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
