"""Training input staging.

This only covers getting reels onto disk in a folder the user can see
and manage directly in Explorer, and listing what's there. It is
deliberately scoped short of the actual Training Studio (dataset
manifests, task/model selection, resource checks, checkpoints,
evaluation, promotion) described in the product spec's Phase 9 — that
remains future work, tracked in docs/development/known-limitations.md.
Nothing here trains a model.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.config import Settings, get_settings
from app.media.ffprobe import ProbeError, probe_media
from app.media.import_service import MediaImportError, import_media_file
from app.security.auth import require_service_token

router = APIRouter(prefix="/training", tags=["training"], dependencies=[Depends(require_service_token)])

VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"}


class InputReel(BaseModel):
    filename: str
    path: str
    size_bytes: int
    duration_seconds: float | None
    modified_at: datetime


class ImportInputReelRequest(BaseModel):
    source_path: str


@router.get("/input-reels", response_model=list[InputReel])
def list_input_reels(settings: Settings = Depends(get_settings)) -> list[InputReel]:
    reels: list[InputReel] = []
    for entry in sorted(settings.training_input_dir.glob("*")):
        if not entry.is_file() or entry.suffix.lower() not in VIDEO_EXTENSIONS:
            continue
        stat = entry.stat()
        duration: float | None = None
        try:
            probe = probe_media(settings.ffprobe_path, entry, timeout_seconds=10.0)
            duration = probe.duration_seconds
        except ProbeError:
            duration = None
        reels.append(
            InputReel(
                filename=entry.name,
                path=str(entry),
                size_bytes=stat.st_size,
                duration_seconds=duration,
                modified_at=datetime.fromtimestamp(stat.st_mtime),
            )
        )
    return reels


@router.post("/input-reels/import", response_model=InputReel)
def import_input_reel(payload: ImportInputReelRequest, settings: Settings = Depends(get_settings)) -> InputReel:
    try:
        result = import_media_file(settings, payload.source_path, settings.training_input_dir)
    except MediaImportError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if result.kind != "video":
        result.storage_path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail="Only video files can be staged for training")

    stat = result.storage_path.stat()
    return InputReel(
        filename=result.storage_path.name,
        path=str(result.storage_path),
        size_bytes=stat.st_size,
        duration_seconds=result.probe.duration_seconds if result.probe else None,
        modified_at=datetime.fromtimestamp(stat.st_mtime),
    )


@router.delete("/input-reels/{filename}")
def delete_input_reel(filename: str, settings: Settings = Depends(get_settings)) -> dict:
    target = settings.training_input_dir / filename
    try:
        target.relative_to(settings.training_input_dir.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid filename") from None
    resolved = (settings.training_input_dir / filename).resolve()
    if resolved.parent != settings.training_input_dir.resolve() or not resolved.is_file():
        raise HTTPException(status_code=404, detail="Input reel not found")
    resolved.unlink()
    return {"deleted": True}
