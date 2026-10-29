"""Shared test fixtures.

Test media is synthesized with FFmpeg's built-in `testsrc`/`sine`
generators rather than any real licensed footage, so the test suite
never depends on external or copyrighted fixtures.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
FFMPEG_PATH = REPO_ROOT / "apps" / "desktop" / "node_modules" / "ffmpeg-ffprobe-static" / "ffmpeg.exe"
FFPROBE_PATH = REPO_ROOT / "apps" / "desktop" / "node_modules" / "ffmpeg-ffprobe-static" / "ffprobe.exe"


@pytest.fixture(scope="session")
def ffmpeg_path() -> Path:
    assert FFMPEG_PATH.is_file(), f"ffmpeg binary not found at {FFMPEG_PATH}"
    return FFMPEG_PATH


@pytest.fixture(scope="session")
def ffprobe_path() -> Path:
    assert FFPROBE_PATH.is_file(), f"ffprobe binary not found at {FFPROBE_PATH}"
    return FFPROBE_PATH


@pytest.fixture(scope="session")
def synthetic_clip_factory(ffmpeg_path, tmp_path_factory):
    def _make(duration_seconds: float = 4.0, name: str = "clip", color: str = "red", with_cuts: bool = True) -> Path:
        out_dir = tmp_path_factory.mktemp("fixtures")
        out_path = out_dir / f"{name}.mp4"
        if with_cuts:
            # Alternate colors every second to give scene detection real cuts to find.
            segment = duration_seconds / 4
            args = [
                str(ffmpeg_path), "-y",
                "-f", "lavfi", "-i", f"color=c=red:s=320x240:d={segment}",
                "-f", "lavfi", "-i", f"color=c=blue:s=320x240:d={segment}",
                "-f", "lavfi", "-i", f"color=c=green:s=320x240:d={segment}",
                "-f", "lavfi", "-i", f"color=c=yellow:s=320x240:d={segment}",
                "-f", "lavfi", "-i", f"sine=frequency=440:duration={duration_seconds}",
                "-filter_complex", "[0:v][1:v][2:v][3:v]concat=n=4:v=1:a=0[v]",
                "-map", "[v]", "-map", "4:a",
                "-shortest",
                "-c:v", "libx264", "-c:a", "aac",
                str(out_path),
            ]
        else:
            args = [
                str(ffmpeg_path), "-y",
                "-f", "lavfi", "-i", f"color=c={color}:s=320x240:d={duration_seconds}",
                "-f", "lavfi", "-i", f"sine=frequency=440:duration={duration_seconds}",
                "-shortest",
                "-c:v", "libx264", "-c:a", "aac",
                str(out_path),
            ]
        result = subprocess.run(args, capture_output=True, text=True, timeout=60)
        assert result.returncode == 0, result.stderr
        return out_path

    return _make


@pytest.fixture()
def service_env(tmp_path, ffmpeg_path, ffprobe_path, monkeypatch):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    monkeypatch.setenv("REELFORGE_DATA_DIR", str(data_dir))
    monkeypatch.setenv("REELFORGE_FFMPEG_PATH", str(ffmpeg_path))
    monkeypatch.setenv("REELFORGE_FFPROBE_PATH", str(ffprobe_path))
    monkeypatch.setenv("REELFORGE_SERVICE_TOKEN", "test-token")
    monkeypatch.setenv("REELFORGE_SERVICE_PORT", "0")
    return data_dir


@pytest.fixture()
def route_session(service_env):
    from sqlalchemy.orm import Session

    from app.database.session import init_database

    engine = init_database(service_env / "reelforge.db")
    with Session(engine, expire_on_commit=False) as session:
        yield session


@pytest.fixture()
def app_client(service_env):
    # Reset process-wide singletons between tests since config/db are cached.
    import app.core.config as config_module
    import app.database.session as session_module

    config_module._settings = None
    session_module._engine = None
    session_module._SessionLocal = None

    from fastapi.testclient import TestClient

    from app.api.app import create_app

    app = create_app()
    client = TestClient(app)
    client.headers.update({"Authorization": "Bearer test-token"})
    return client
