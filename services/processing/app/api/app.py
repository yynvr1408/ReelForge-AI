"""FastAPI application factory.

Binds to loopback only (enforced by how uvicorn is invoked in main.py,
not here), uses a restrictive CORS policy that only allows the
Electron app's own custom scheme, and requires a bearer token on every
route except /health.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import health, media, projects, reference, render, storage, style_profiles, timeline, training
from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.database.session import init_database

logger = get_logger("app")


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.data_dir / "logs")
    init_database(settings.database_path)

    app = FastAPI(title="ReelForge AI Processing Service", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["app://reelforge", "http://localhost"],
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )

    app.include_router(health.router)
    app.include_router(projects.router)
    app.include_router(media.router)
    app.include_router(reference.router)
    app.include_router(style_profiles.router)
    app.include_router(timeline.router)
    app.include_router(render.router)
    app.include_router(training.router)
    app.include_router(storage.router)

    logger.info("Processing service initialized", extra={"extra_fields": {"data_dir": str(settings.data_dir)}})
    return app
