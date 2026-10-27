from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
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


@router.get("", response_model=list[MediaAssetResponse])
def list_media(project_id: str | None = None, session: Session = Depends(get_session)) -> list[MediaAsset]:
    query = session.query(MediaAsset)
    if project_id:
        query = query.filter(MediaAsset.project_id == project_id)
    return query.order_by(MediaAsset.created_at.desc()).all()


@router.get("/{media_id}", response_model=MediaAssetResponse)
def get_media(media_id: str, session: Session = Depends(get_session)) -> MediaAsset:
    asset = session.get(MediaAsset, media_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Media asset not found")
    return asset
