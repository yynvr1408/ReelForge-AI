from __future__ import annotations

from dataclasses import asdict
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.analysis.scene_detection import SceneDetectionError, analyze_scenes
from app.core.config import Settings, get_settings
from app.database.models import ReferenceVideo
from app.database.session import get_session
from app.media.import_service import MediaImportError, import_media_file
from app.security.auth import require_service_token

router = APIRouter(prefix="/reference", tags=["reference"], dependencies=[Depends(require_service_token)])


class ReferenceImportRequest(BaseModel):
    source_path: str
    name: str | None = None


class ReferenceResponse(BaseModel):
    id: str
    name: str
    storage_path: str
    duration_seconds: float | None
    width: int | None
    height: int | None
    frame_rate: float | None
    analysis_json: dict | None
    analysis_status: str
    excluded_from_aggregation: bool
    tags_json: list
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


@router.post("/import", response_model=ReferenceResponse)
def import_reference(
    payload: ReferenceImportRequest,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> ReferenceVideo:
    try:
        result = import_media_file(settings, payload.source_path, settings.reference_dir)
    except MediaImportError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if result.kind != "video":
        raise HTTPException(status_code=422, detail="Reference import requires a video file")

    reference = ReferenceVideo(
        name=payload.name or result.original_path.stem,
        original_path=str(result.original_path),
        storage_path=str(result.storage_path),
        duration_seconds=result.probe.duration_seconds if result.probe else None,
        width=result.probe.width if result.probe else None,
        height=result.probe.height if result.probe else None,
        frame_rate=result.probe.frame_rate if result.probe else None,
        probe_json=result.probe.raw if result.probe else None,
        analysis_status="pending",
    )
    session.add(reference)
    session.commit()
    session.refresh(reference)
    return reference


@router.post("/{reference_id}/analyze", response_model=ReferenceResponse)
def analyze_reference(
    reference_id: str,
    session: Session = Depends(get_session),
) -> ReferenceVideo:
    reference = session.get(ReferenceVideo, reference_id)
    if reference is None:
        raise HTTPException(status_code=404, detail="Reference video not found")

    reference.analysis_status = "running"
    session.commit()

    try:
        analysis = analyze_scenes(Path(reference.storage_path))
    except SceneDetectionError as exc:
        reference.analysis_status = "failed"
        session.commit()
        raise HTTPException(status_code=500, detail=f"Scene analysis failed: {exc}") from exc

    reference.analysis_json = asdict(analysis)
    reference.analysis_status = "complete"
    session.commit()
    session.refresh(reference)
    return reference


@router.get("", response_model=list[ReferenceResponse])
def list_references(session: Session = Depends(get_session)) -> list[ReferenceVideo]:
    return session.query(ReferenceVideo).order_by(ReferenceVideo.created_at.desc()).all()


@router.get("/{reference_id}", response_model=ReferenceResponse)
def get_reference(reference_id: str, session: Session = Depends(get_session)) -> ReferenceVideo:
    reference = session.get(ReferenceVideo, reference_id)
    if reference is None:
        raise HTTPException(status_code=404, detail="Reference video not found")
    return reference


@router.delete("/{reference_id}")
def delete_reference(reference_id: str, session: Session = Depends(get_session)) -> dict:
    reference = session.get(ReferenceVideo, reference_id)
    if reference is None:
        raise HTTPException(status_code=404, detail="Reference video not found")
    session.delete(reference)
    session.commit()
    return {"deleted": True}
