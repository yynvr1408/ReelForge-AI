"""Runtime configuration for the processing service.

Everything here is sourced from environment variables set by the Electron
main process at launch time. The service never guesses paths on its own —
the desktop app owns where user data lives.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


class ConfigurationError(RuntimeError):
    """Raised when a required piece of configuration is missing."""


def _require(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise ConfigurationError(f"Required environment variable {name} is not set")
    return value


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    ffmpeg_path: Path
    ffprobe_path: Path
    service_token: str
    host: str
    port: int

    @property
    def projects_dir(self) -> Path:
        return self.data_dir / "projects"

    @property
    def media_dir(self) -> Path:
        return self.data_dir / "media"

    @property
    def reference_dir(self) -> Path:
        return self.data_dir / "reference"

    @property
    def cache_dir(self) -> Path:
        return self.data_dir / "cache"

    @property
    def exports_dir(self) -> Path:
        return self.data_dir / "exports"

    @property
    def thumbnails_dir(self) -> Path:
        return self.data_dir / "thumbnails"

    @property
    def training_dir(self) -> Path:
        return self.data_dir / "training"

    @property
    def training_input_dir(self) -> Path:
        """Reels staged for training. Visible on disk so a user can drag
        files in directly from Explorer, not just through the app."""
        return self.training_dir / "input"

    @property
    def checkpoints_dir(self) -> Path:
        return self.training_dir / "checkpoints"

    @property
    def database_path(self) -> Path:
        return self.data_dir / "reelforge.db"

    def ensure_directories(self) -> None:
        for directory in (
            self.data_dir,
            self.projects_dir,
            self.media_dir,
            self.reference_dir,
            self.cache_dir,
            self.exports_dir,
            self.thumbnails_dir,
            self.training_input_dir,
            self.checkpoints_dir,
        ):
            directory.mkdir(parents=True, exist_ok=True)


def load_settings() -> Settings:
    data_dir = Path(_require("REELFORGE_DATA_DIR")).resolve()
    ffmpeg_path = Path(_require("REELFORGE_FFMPEG_PATH")).resolve()
    ffprobe_path = Path(_require("REELFORGE_FFPROBE_PATH")).resolve()
    service_token = _require("REELFORGE_SERVICE_TOKEN")
    host = os.environ.get("REELFORGE_SERVICE_HOST", "127.0.0.1")
    port = int(_require("REELFORGE_SERVICE_PORT"))

    if not ffmpeg_path.is_file():
        raise ConfigurationError(f"ffmpeg binary not found at {ffmpeg_path}")
    if not ffprobe_path.is_file():
        raise ConfigurationError(f"ffprobe binary not found at {ffprobe_path}")

    settings = Settings(
        data_dir=data_dir,
        ffmpeg_path=ffmpeg_path,
        ffprobe_path=ffprobe_path,
        service_token=service_token,
        host=host,
        port=port,
    )
    settings.ensure_directories()
    return settings


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = load_settings()
    return _settings
