"""Runtime configuration for the processing service.

Everything here is sourced from environment variables set by the Electron
main process at launch time. The service never guesses paths on its own —
the desktop app owns where user data lives.
"""

from __future__ import annotations

import json
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


STORAGE_SETTINGS_FILENAME = "storage_settings.json"


def _load_storage_overrides(data_dir: Path) -> dict[str, str]:
    path = data_dir / STORAGE_SETTINGS_FILENAME
    if path.is_file():
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    return {k: str(v) for k, v in data.items() if isinstance(v, str)}
        except Exception:
            pass
    return {}


def _save_storage_overrides(data_dir: Path, overrides: dict[str, str]) -> None:
    path = data_dir / STORAGE_SETTINGS_FILENAME
    with open(path, "w", encoding="utf-8") as f:
        json.dump(overrides, f, indent=2)


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    ffmpeg_path: Path
    ffprobe_path: Path
    service_token: str
    host: str
    port: int
    custom_projects_dir: Path | None = None
    custom_media_dir: Path | None = None
    custom_reference_dir: Path | None = None
    custom_cache_dir: Path | None = None
    custom_exports_dir: Path | None = None
    custom_training_input_dir: Path | None = None
    custom_checkpoints_dir: Path | None = None

    @property
    def projects_dir(self) -> Path:
        return self.custom_projects_dir or (self.data_dir / "projects")

    @property
    def media_dir(self) -> Path:
        return self.custom_media_dir or (self.data_dir / "media")

    @property
    def reference_dir(self) -> Path:
        return self.custom_reference_dir or (self.data_dir / "reference")

    @property
    def cache_dir(self) -> Path:
        return self.custom_cache_dir or (self.data_dir / "cache")

    @property
    def exports_dir(self) -> Path:
        return self.custom_exports_dir or (self.data_dir / "exports")

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
        return self.custom_training_input_dir or (self.training_dir / "input")

    @property
    def checkpoints_dir(self) -> Path:
        return self.custom_checkpoints_dir or (self.training_dir / "checkpoints")

    @property
    def database_path(self) -> Path:
        return self.data_dir / "reelforge.db"

    def is_custom(self, key: str) -> bool:
        field_map = {
            "projects": self.custom_projects_dir,
            "media": self.custom_media_dir,
            "reference": self.custom_reference_dir,
            "cache": self.custom_cache_dir,
            "exports": self.custom_exports_dir,
            "training_input": self.custom_training_input_dir,
            "checkpoints": self.custom_checkpoints_dir,
        }
        return field_map.get(key) is not None

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

    overrides = _load_storage_overrides(data_dir)

    def _resolve_override(env_key: str, store_key: str) -> Path | None:
        env_val = os.environ.get(env_key)
        if env_val and env_val.strip():
            return Path(env_val).resolve()
        store_val = overrides.get(store_key)
        if store_val and store_val.strip():
            return Path(store_val).resolve()
        return None

    settings = Settings(
        data_dir=data_dir,
        ffmpeg_path=ffmpeg_path,
        ffprobe_path=ffprobe_path,
        service_token=service_token,
        host=host,
        port=port,
        custom_projects_dir=_resolve_override("REELFORGE_PROJECTS_DIR", "projects"),
        custom_media_dir=_resolve_override("REELFORGE_MEDIA_DIR", "media"),
        custom_reference_dir=_resolve_override("REELFORGE_REFERENCE_DIR", "reference"),
        custom_cache_dir=_resolve_override("REELFORGE_CACHE_DIR", "cache"),
        custom_exports_dir=_resolve_override("REELFORGE_EXPORTS_DIR", "exports"),
        custom_training_input_dir=_resolve_override("REELFORGE_TRAINING_INPUT_DIR", "training_input"),
        custom_checkpoints_dir=_resolve_override("REELFORGE_CHECKPOINTS_DIR", "checkpoints"),
    )
    settings.ensure_directories()
    return settings


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = load_settings()
    return _settings


def set_storage_override(key: str, new_path: Path) -> Settings:
    global _settings
    curr = get_settings()
    new_path = new_path.resolve()
    new_path.mkdir(parents=True, exist_ok=True)
    overrides = _load_storage_overrides(curr.data_dir)
    overrides[key] = str(new_path)
    _save_storage_overrides(curr.data_dir, overrides)
    _settings = load_settings()
    return _settings


def reset_storage_override(key: str) -> Settings:
    global _settings
    curr = get_settings()
    overrides = _load_storage_overrides(curr.data_dir)
    if key in overrides:
        del overrides[key]
        _save_storage_overrides(curr.data_dir, overrides)
    _settings = load_settings()
    return _settings
