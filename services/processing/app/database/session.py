"""Database engine and session management."""

from __future__ import annotations

from collections.abc import Generator
from contextlib import contextmanager
from pathlib import Path
import sqlite3

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.database.models import Base, SchemaMigration

_engine = None
_SessionLocal: sessionmaker | None = None

CURRENT_SCHEMA_VERSION = 4


def _backup_before_migration(database_path: Path) -> None:
    if not database_path.is_file() or database_path.stat().st_size == 0:
        return
    old_version = 0
    try:
        with sqlite3.connect(database_path) as connection:
            table = connection.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
            ).fetchone()
            if table:
                row = connection.execute("SELECT MAX(version) FROM schema_migrations").fetchone()
                old_version = row[0] or 0
    except sqlite3.DatabaseError:
        # Preserve even a damaged DB before attempting any schema work.
        old_version = 0
    if old_version >= CURRENT_SCHEMA_VERSION:
        return

    backup_dir = database_path.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup_path = backup_dir / f"reelforge-pre-migration-v{old_version}.sqlite3"
    if backup_path.exists():
        backup_path = backup_dir / f"reelforge-pre-migration-v{old_version}-{database_path.stat().st_mtime_ns}.sqlite3"
    with sqlite3.connect(database_path) as source, sqlite3.connect(backup_path) as target:
        source.backup(target)


def init_database(database_path: Path):
    global _engine, _SessionLocal
    _backup_before_migration(database_path)
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
            session.add(
                SchemaMigration(
                    version=CURRENT_SCHEMA_VERSION,
                    description="persisted project snapshots, cancellable analysis, and training job progress",
                )
            )
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
