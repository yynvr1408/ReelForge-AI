from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ValidationError
from sqlalchemy.orm import Session

from app.database.models import MediaAsset, StyleProfile
from app.database.session import get_session
from app.editing_planner.rule_based import generate_timeline
from app.security.auth import require_service_token
from app.timeline.schema import ExportSettings, Timeline
from app.timeline.validator import is_valid, validate_timeline

router = APIRouter(prefix="/timeline", tags=["timeline"], dependencies=[Depends(require_service_token)])


class TimelineGenerateRequest(BaseModel):
    media_ids: list[str]
    style_profile_id: str | None = None
    target_duration_seconds: float | None = None
    export_settings: ExportSettings | None = None


class TimelineValidateRequest(BaseModel):
    timeline: dict
    known_media_ids: list[str]


class ValidationResponse(BaseModel):
    is_valid: bool
    issues: list[dict]


@router.post("/generate")
def generate(payload: TimelineGenerateRequest, session: Session = Depends(get_session)) -> dict:
    assets = session.query(MediaAsset).filter(MediaAsset.id.in_(payload.media_ids)).all()
    found_ids = {a.id for a in assets}
    missing = set(payload.media_ids) - found_ids
    if missing:
        raise HTTPException(status_code=404, detail=f"Media assets not found: {sorted(missing)}")

    profile_json = None
    if payload.style_profile_id:
        profile = session.get(StyleProfile, payload.style_profile_id)
        if profile is None:
            raise HTTPException(status_code=404, detail="Style profile not found")
        profile_json = profile.profile_json

    source_media = [
        {"id": a.id, "duration_seconds": a.duration_seconds, "has_audio": a.has_audio} for a in assets
    ]

    try:
        timeline = generate_timeline(
            source_media=source_media,
            style_profile=profile_json,
            target_duration_seconds=payload.target_duration_seconds,
            export_settings=payload.export_settings,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    issues = validate_timeline(timeline, found_ids)
    return {
        "timeline": timeline.model_dump(),
        "validation": {"is_valid": is_valid(issues), "issues": [i.__dict__ for i in issues]},
    }


@router.post("/validate", response_model=ValidationResponse)
def validate(payload: TimelineValidateRequest) -> dict:
    try:
        timeline = Timeline.model_validate(payload.timeline)
    except ValidationError as exc:
        return {"is_valid": False, "issues": [{"severity": "error", "message": str(exc)}]}

    issues = validate_timeline(timeline, set(payload.known_media_ids))
    return {"is_valid": is_valid(issues), "issues": [i.__dict__ for i in issues]}
