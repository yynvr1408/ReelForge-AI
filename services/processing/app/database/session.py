"""Database engine and session management."""

from __future__ import annotations

from collections.abc import Generator
from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.database.models import Base, SchemaMigration

_engine = None
_SessionLocal: sessionmaker | None = None

CURRENT_SCHEMA_VERSION = 1


def init_database(database_path: Path):
    global _engine, _SessionLocal
    _engine = create_engine(f"sqlite:///{database_path}", connect_args={"check_same_thread": False})

    @event.listens_for(_engine, "connect")
    def _set_sqlite_pragmas(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()

    Base.metadata.create_all(_engine)
    _SessionLocal = sessionmaker(bind=_engine, expire_on_commit=False)

    with _SessionLocal() as session:
        applied = {row.version for row in session.query(SchemaMigration).all()}
        if CURRENT_SCHEMA_VERSION not in applied:
            session.add(SchemaMigration(version=CURRENT_SCHEMA_VERSION, description="initial schema"))
            session.commit()

    return _engine


def get_session() -> Generator[Session, None, None]:
    if _SessionLocal is None:
        raise RuntimeError("Database not initialized; call init_database() first")
    session = _SessionLocal()
    try:
        yield session
    finally:
        session.close()


@contextmanager
def session_scope() -> Generator[Session, None, None]:
    """Session context manager for use outside of FastAPI's dependency
    injection, e.g. from background job threads."""
    if _SessionLocal is None:
        raise RuntimeError("Database not initialized; call init_database() first")
    session = _SessionLocal()
    try:
        yield session
    finally:
        session.close()
