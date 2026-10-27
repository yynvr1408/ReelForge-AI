"""Media import pipeline: validate -> probe -> copy into managed storage -> thumbnail.

Originals are never moved or deleted; a managed copy is made under the
configured media/reference directory so the project does not depend on
the source file staying where the user found it (e.g. a removable
drive). Large-file duplication is avoided only in the sense that we
copy once at import time, not repeatedly.
"""

from __future__ import annotations

import hashlib
import shutil
import uuid
from pathlib import Path

from app.core.config import Settings
from app.media.ffprobe import MediaProbe, ProbeError, probe_media
from app.media.thumbnails import ThumbnailError, extract_thumbnail
from app.security.paths import UnsafePathError, validate_source_file

VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".aac", ".m4a", ".flac"}
SUBTITLE_EXTENSIONS = {".srt", ".vtt"}


class MediaImportError(RuntimeError):
    pass


def classify_kind(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in VIDEO_EXTENSIONS:
        return "video"
    if suffix in IMAGE_EXTENSIONS:
        return "image"
    if suffix in AUDIO_EXTENSIONS:
        return "audio"
    if suffix in SUBTITLE_EXTENSIONS:
        return "subtitle"
    raise MediaImportError(f"Unsupported file extension: {suffix}")


def _hash_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(chunk_size):
            digest.update(chunk)
    return digest.hexdigest()


class ImportResult:
    def __init__(
        self,
        kind: str,
        original_path: Path,
        storage_path: Path,
        file_hash: str,
        probe: MediaProbe | None,
        thumbnail_path: Path | None,
    ) -> None:
        self.kind = kind
        self.original_path = original_path
        self.storage_path = storage_path
        self.file_hash = file_hash
        self.probe = probe
        self.thumbnail_path = thumbnail_path


def import_media_file(settings: Settings, source_path_str: str, destination_root: Path) -> ImportResult:
    try:
        source_path = validate_source_file(Path(source_path_str))
    except UnsafePathError as exc:
        raise MediaImportError(str(exc)) from exc

    kind = classify_kind(source_path)

    destination_root.mkdir(parents=True, exist_ok=True)
    storage_name = f"{uuid.uuid4().hex}{source_path.suffix.lower()}"
    storage_path = destination_root / storage_name

    try:
        shutil.copy2(source_path, storage_path)
    except OSError as exc:
        raise MediaImportError(f"Failed to copy source file: {exc}") from exc

    probe: MediaProbe | None = None
    if kind in ("video", "audio"):
        try:
            probe = probe_media(settings.ffprobe_path, storage_path)
        except ProbeError as exc:
            storage_path.unlink(missing_ok=True)
            raise MediaImportError(f"File failed validation: {exc}") from exc

    thumbnail_path: Path | None = None
    if kind == "video":
        thumb_target = settings.thumbnails_dir / f"{storage_path.stem}.jpg"
        try:
            sample_time = min(1.0, (probe.duration_seconds or 2.0) / 2)
            thumbnail_path = extract_thumbnail(settings.ffmpeg_path, storage_path, thumb_target, timestamp_seconds=sample_time)
        except ThumbnailError:
            thumbnail_path = None

    file_hash = _hash_file(storage_path)

    return ImportResult(
        kind=kind,
        original_path=source_path,
        storage_path=storage_path,
        file_hash=file_hash,
        probe=probe,
        thumbnail_path=thumbnail_path,
    )
