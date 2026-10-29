from __future__ import annotations

from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.database.models import MediaAsset, Project
from app.database.session import get_session
from app.media.import_service import MediaImportError, import_media_file
from app.security.auth import require_service_token

router = APIRouter(prefix="/media", tags=["media"], dependencies=[Depends(require_service_token)])


class MediaImportRequest(BaseModel):
    project_id: str | None = None
    source_path: str


class MediaBatchImportRequest(BaseModel):
    project_id: str | None = None
    source_paths: list[str]


class MediaBatchImportResult(BaseModel):
    source_path: str
    media: "MediaAssetResponse | None" = None
    error: str | None = None


class MediaAssetResponse(BaseModel):
    id: str
    project_id: str | None
    kind: str
    original_path: str
    storage_path: str
    duration_seconds: float | None
    width: int | None
    height: int | None
    frame_rate: float | None
    has_audio: bool | None
    thumbnail_path: str | None
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MediaPageResponse(BaseModel):
    items: list[MediaAssetResponse]
    total: int
    limit: int
    offset: int


MediaBatchImportResult.model_rebuild()


@router.post("/import", response_model=MediaAssetResponse)
def import_media(
    payload: MediaImportRequest,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> MediaAsset:
    if payload.project_id is not None and session.get(Project, payload.project_id) is None:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        result = import_media_file(settings, payload.source_path, settings.media_dir)
    except MediaImportError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    asset = MediaAsset(
        project_id=payload.project_id,
        kind=result.kind,
        original_path=str(result.original_path),
        storage_path=str(result.storage_path),
        file_hash=result.file_hash,
        duration_seconds=result.probe.duration_seconds if result.probe else None,
        width=result.probe.width if result.probe else None,
        height=result.probe.height if result.probe else None,
        frame_rate=result.probe.frame_rate if result.probe else None,
        has_audio=result.probe.has_audio if result.probe else None,
        thumbnail_path=str(result.thumbnail_path) if result.thumbnail_path else None,
        probe_json=result.probe.raw if result.probe else None,
        status="imported",
    )
    session.add(asset)
    session.commit()
    session.refresh(asset)
    return asset


@router.post("/import-batch", response_model=list[MediaBatchImportResult])
def import_media_batch(
    payload: MediaBatchImportRequest,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> list[dict]:
    if payload.project_id is not None and session.get(Project, payload.project_id) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if not payload.source_paths:
        raise HTTPException(status_code=422, detail="At least one file or directory is required")

    from app.media.import_service import (
        AUDIO_EXTENSIONS,
        IMAGE_EXTENSIONS,
        SUBTITLE_EXTENSIONS,
        VIDEO_EXTENSIONS,
    )

    allowed_extensions = VIDEO_EXTENSIONS | IMAGE_EXTENSIONS | AUDIO_EXTENSIONS | SUBTITLE_EXTENSIONS
    candidates: list[Path] = []
    for source in payload.source_paths:
        path = Path(source).expanduser()
        if path.is_dir():
            for candidate in path.rglob("*"):
                if candidate.is_file() and not candidate.is_symlink() and candidate.suffix.lower() in allowed_extensions:
                    candidates.append(candidate)
        else:
            candidates.append(path)
        if len(candidates) > 1000:
            raise HTTPException(status_code=413, detail="Batch import is limited to 1000 files per request")

    if not candidates:
        raise HTTPException(status_code=422, detail="No supported media files found in the selected folders")

    results: list[dict] = []
    for source_path in sorted(dict.fromkeys(candidates)):
        try:
            imported = import_media_file(settings, str(source_path), settings.media_dir)
            asset = MediaAsset(
                project_id=payload.project_id,
                kind=imported.kind,
                original_path=str(imported.original_path),
                storage_path=str(imported.storage_path),
                file_hash=imported.file_hash,
                duration_seconds=imported.probe.duration_seconds if imported.probe else None,
                width=imported.probe.width if imported.probe else None,
                height=imported.probe.height if imported.probe else None,
                frame_rate=imported.probe.frame_rate if imported.probe else None,
                has_audio=imported.probe.has_audio if imported.probe else None,
                thumbnail_path=str(imported.thumbnail_path) if imported.thumbnail_path else None,
                probe_json=imported.probe.raw if imported.probe else None,
                status="imported",
            )
            session.add(asset)
            session.flush()
            results.append({"source_path": str(source_path), "media": asset, "error": None})
        except (MediaImportError, OSError) as exc:
            results.append({"source_path": str(source_path), "media": None, "error": str(exc)})
    session.commit()
    return results


@router.get("", response_model=list[MediaAssetResponse])
def list_media(project_id: str | None = None, session: Session = Depends(get_session)) -> list[MediaAsset]:
    query = session.query(MediaAsset)
    if project_id:
        query = query.filter(MediaAsset.project_id == project_id)
    return query.order_by(MediaAsset.created_at.desc()).all()


@router.get("/page", response_model=MediaPageResponse)
def list_media_page(
    project_id: str | None = None,
    limit: int = Query(default=48, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=1_000_000),
    session: Session = Depends(get_session),
) -> dict:
    query = session.query(MediaAsset)
    if project_id:
        query = query.filter(MediaAsset.project_id == project_id)
    total = query.count()
    assets = query.order_by(MediaAsset.created_at.desc(), MediaAsset.id.desc()).offset(offset).limit(limit).all()
    changed = False
    for asset in assets:
        desired_status = "imported" if Path(asset.storage_path).is_file() else "missing"
        if asset.status != desired_status:
            asset.status = desired_status
            changed = True
    if changed:
        session.commit()
    return {"items": assets, "total": total, "limit": limit, "offset": offset}


@router.post("/revalidate", response_model=list[MediaAssetResponse])
def revalidate_media(session: Session = Depends(get_session)) -> list[MediaAsset]:
    assets = session.query(MediaAsset).all()
    changed = False
    for asset in assets:
        exists = Path(asset.storage_path).is_file()
        desired_status = "imported" if exists else "missing"
        if asset.status != desired_status:
            asset.status = desired_status
            changed = True
    if changed:
        session.commit()
    return sorted(assets, key=lambda asset: asset.created_at, reverse=True)


@router.post("/{media_id}/relink", response_model=MediaAssetResponse)
def relink_media(
    media_id: str,
    payload: MediaImportRequest,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> MediaAsset:
    asset = session.get(MediaAsset, media_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Media asset not found")
    try:
        replacement = import_media_file(settings, payload.source_path, settings.media_dir)
    except MediaImportError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if replacement.kind != asset.kind:
        Path(replacement.storage_path).unlink(missing_ok=True)
        if replacement.thumbnail_path:
            Path(replacement.thumbnail_path).unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail=f"Expected a {asset.kind} file for this asset")

    asset.original_path = str(replacement.original_path)
    asset.storage_path = str(replacement.storage_path)
    asset.file_hash = replacement.file_hash
    asset.duration_seconds = replacement.probe.duration_seconds if replacement.probe else None
    asset.width = replacement.probe.width if replacement.probe else None
    asset.height = replacement.probe.height if replacement.probe else None
    asset.frame_rate = replacement.probe.frame_rate if replacement.probe else None
    asset.has_audio = replacement.probe.has_audio if replacement.probe else None
    asset.thumbnail_path = str(replacement.thumbnail_path) if replacement.thumbnail_path else None
    asset.probe_json = replacement.probe.raw if replacement.probe else None
    asset.status = "imported"
    session.commit()
    session.refresh(asset)
    return asset


@router.get("/{media_id}", response_model=MediaAssetResponse)
def get_media(media_id: str, session: Session = Depends(get_session)) -> MediaAsset:
    asset = session.get(MediaAsset, media_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Media asset not found")
    return asset
