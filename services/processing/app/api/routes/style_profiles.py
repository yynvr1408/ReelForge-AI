from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.orm import Session

from app.database.models import ReferenceVideo, StyleProfile
from app.database.session import get_session
from app.security.auth import require_service_token
from app.style_profiles.aggregator import ReferenceSample, build_style_profile
from app.timeline.schema import ColorAdjustment

router = APIRouter(prefix="/style-profiles", tags=["style-profiles"], dependencies=[Depends(require_service_token)])


class StyleProfileCreateRequest(BaseModel):
    name: str
    reference_ids: list[str]


class StyleProfileImportRequest(BaseModel):
    format: str
    schema_version: int
    name: str = Field(min_length=1, max_length=120)
    version: int = Field(ge=1, le=10000)
    source_reference_ids: list[str] = Field(default_factory=list, max_length=500)
    profile_json: dict
    confidence: float = Field(ge=0, le=1)

    @field_validator("format")
    @classmethod
    def supported_format(cls, value: str) -> str:
        if value != "reelforge-style-profile":
            raise ValueError("Unsupported style profile format")
        return value

    @field_validator("schema_version")
    @classmethod
    def supported_schema(cls, value: int) -> int:
        if value != 1:
            raise ValueError("Unsupported style profile schema version")
        return value

    @field_validator("profile_json")
    @classmethod
    def validate_profile_json(cls, value: dict) -> dict:
        allowed = {"pacing", "visual", "audio", "user_adjustments", "source_reference_count", "sample_count", "confidence"}
        if set(value) - allowed:
            raise ValueError("Profile contains unsupported fields")
        pacing = value.get("pacing")
        if not isinstance(pacing, dict) or not isinstance(pacing.get("median_shot_duration_seconds"), (int, float)):
            raise ValueError("Profile must include pacing.median_shot_duration_seconds")
        if not 0.3 <= pacing["median_shot_duration_seconds"] <= 30:
            raise ValueError("Median shot duration must be between 0.3 and 30 seconds")
        for section in ("visual", "audio"):
            if section in value and not isinstance(value[section], dict):
                raise ValueError(f"Profile {section} data must be an object")
        adjustments = value.get("user_adjustments", {})
        if not isinstance(adjustments, dict) or set(adjustments) - {"color"}:
            raise ValueError("Profile contains unsupported user adjustments")
        if "color" in adjustments:
            if not isinstance(adjustments["color"], dict) or set(adjustments["color"]) - {
                "exposure", "contrast", "saturation", "temperature"
            }:
                raise ValueError("Profile contains unsupported color settings")
            try:
                ColorAdjustment.model_validate(adjustments["color"])
            except Exception as exc:
                raise ValueError("Profile color adjustment is outside supported limits") from exc
        return value


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

    included_references = [r for r in references if not r.excluded_from_aggregation]
    if not included_references:
        raise HTTPException(status_code=422, detail="All selected references are excluded from aggregation")

    not_analyzed = [r.id for r in included_references if r.analysis_status != "complete" or not r.analysis_json]
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
            visual=r.analysis_json.get("visual"),
            audio=r.analysis_json.get("audio"),
        )
        for r in included_references
    ]

    try:
        profile_json = build_style_profile(samples)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    profile = StyleProfile(
        name=payload.name,
        source_reference_ids=[reference.id for reference in included_references],
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


@router.post("/import", response_model=StyleProfileResponse, status_code=201)
def import_style_profile(payload: StyleProfileImportRequest, session: Session = Depends(get_session)) -> StyleProfile:
    profile = StyleProfile(
        name=payload.name,
        version=payload.version,
        source_reference_ids=payload.source_reference_ids,
        profile_json=payload.profile_json,
        confidence=payload.confidence,
    )
    session.add(profile)
    session.commit()
    session.refresh(profile)
    return profile


class StyleProfileUpdate(BaseModel):
    median_shot_duration_seconds: float | None = None
    color: dict[str, float] | None = None


@router.patch("/{profile_id}", response_model=StyleProfileResponse)
def update_style_profile(
    profile_id: str,
    payload: StyleProfileUpdate,
    session: Session = Depends(get_session),
) -> StyleProfile:
    if payload.median_shot_duration_seconds is not None and not 0.3 <= payload.median_shot_duration_seconds <= 30:
        raise HTTPException(status_code=422, detail="Shot duration must be between 0.3 and 30 seconds")
    if payload.median_shot_duration_seconds is None and payload.color is None:
        raise HTTPException(status_code=422, detail="At least one editable style setting is required")
    profile = session.get(StyleProfile, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Style profile not found")
    profile_json = dict(profile.profile_json or {})
    if payload.median_shot_duration_seconds is not None:
        pacing = dict(profile_json.get("pacing", {}))
        pacing["median_shot_duration_seconds"] = round(payload.median_shot_duration_seconds, 3)
        pacing["user_adjusted"] = True
        profile_json["pacing"] = pacing
    if payload.color is not None:
        if set(payload.color) - {"exposure", "contrast", "saturation", "temperature"}:
            raise HTTPException(status_code=422, detail="Color grade contains unsupported settings")
        try:
            grade = ColorAdjustment.model_validate(payload.color).model_dump()
        except Exception as exc:
            raise HTTPException(status_code=422, detail="Color grade is outside supported limits") from exc
        profile_json["user_adjustments"] = {"color": grade}
    profile.profile_json = profile_json
    profile.version += 1
    session.commit()
    session.refresh(profile)
    return profile


@router.delete("/{profile_id}")
def delete_style_profile(profile_id: str, session: Session = Depends(get_session)) -> dict:
    profile = session.get(StyleProfile, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Style profile not found")
    session.delete(profile)
    session.commit()
    return {"deleted": True}
