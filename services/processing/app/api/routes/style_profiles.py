from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.database.models import ReferenceVideo, StyleProfile
from app.database.session import get_session
from app.security.auth import require_service_token
from app.style_profiles.aggregator import ReferenceSample, build_style_profile

router = APIRouter(prefix="/style-profiles", tags=["style-profiles"], dependencies=[Depends(require_service_token)])


class StyleProfileCreateRequest(BaseModel):
    name: str
    reference_ids: list[str]


class StyleProfileResponse(BaseModel):
    id: str
    name: str
    version: int
    source_reference_ids: list
    profile_json: dict
    confidence: float
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


@router.post("", response_model=StyleProfileResponse)
def create_style_profile(payload: StyleProfileCreateRequest, session: Session = Depends(get_session)) -> StyleProfile:
    if not payload.reference_ids:
        raise HTTPException(status_code=422, detail="At least one reference_id is required")

    references = session.query(ReferenceVideo).filter(ReferenceVideo.id.in_(payload.reference_ids)).all()
    found_ids = {r.id for r in references}
    missing = set(payload.reference_ids) - found_ids
    if missing:
        raise HTTPException(status_code=404, detail=f"Reference videos not found: {sorted(missing)}")

    not_analyzed = [r.id for r in references if r.analysis_status != "complete" or not r.analysis_json]
    if not_analyzed:
        raise HTTPException(
            status_code=422,
            detail=f"References must be analyzed before building a style profile: {not_analyzed}",
        )

    samples = [
        ReferenceSample(
            reference_id=r.id,
            shot_durations_seconds=r.analysis_json.get("shot_durations_seconds", []),
            cut_count=r.analysis_json.get("cut_count", 0),
            confidence=r.analysis_json.get("confidence", 0.3),
        )
        for r in references
    ]

    try:
        profile_json = build_style_profile(samples)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    profile = StyleProfile(
        name=payload.name,
        source_reference_ids=payload.reference_ids,
        profile_json=profile_json,
        confidence=profile_json["confidence"],
    )
    session.add(profile)
    session.commit()
    session.refresh(profile)
    return profile


@router.get("", response_model=list[StyleProfileResponse])
def list_style_profiles(session: Session = Depends(get_session)) -> list[StyleProfile]:
    return session.query(StyleProfile).order_by(StyleProfile.updated_at.desc()).all()


@router.get("/{profile_id}", response_model=StyleProfileResponse)
def get_style_profile(profile_id: str, session: Session = Depends(get_session)) -> StyleProfile:
    profile = session.get(StyleProfile, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Style profile not found")
    return profile


@router.delete("/{profile_id}")
def delete_style_profile(profile_id: str, session: Session = Depends(get_session)) -> dict:
    profile = session.get(StyleProfile, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Style profile not found")
    session.delete(profile)
    session.commit()
    return {"deleted": True}
