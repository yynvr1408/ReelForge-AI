from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.database.models import FeedbackEntry, Project, StyleProfile
from app.database.session import get_session
from app.security.auth import require_service_token

router = APIRouter(prefix="/feedback", tags=["feedback"], dependencies=[Depends(require_service_token)])


class FeedbackCreateRequest(BaseModel):
    project_id: str | None = None
    style_profile_id: str | None = None
    subject: Literal["timeline_pacing", "clip_selection", "color"]
    action: Literal["accepted", "rejected", "too_fast", "too_slow", "adjusted"]
    payload: dict = Field(default_factory=dict)


class FeedbackResponse(BaseModel):
    id: str
    project_id: str | None
    style_profile_id: str | None
    subject: str
    action: str
    payload_json: dict
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


@router.post("", response_model=FeedbackResponse)
def create_feedback(payload: FeedbackCreateRequest, session: Session = Depends(get_session)) -> FeedbackEntry:
    if payload.project_id and session.get(Project, payload.project_id) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if payload.style_profile_id and session.get(StyleProfile, payload.style_profile_id) is None:
        raise HTTPException(status_code=404, detail="Style profile not found")
    entry = FeedbackEntry(
        project_id=payload.project_id,
        style_profile_id=payload.style_profile_id,
        subject=payload.subject,
        action=payload.action,
        payload_json=payload.payload,
    )
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry


@router.get("", response_model=list[FeedbackResponse])
def list_feedback(
    project_id: str | None = None,
    limit: int = Query(default=100, ge=1, le=1000),
    session: Session = Depends(get_session),
) -> list[FeedbackEntry]:
    query = session.query(FeedbackEntry)
    if project_id:
        query = query.filter(FeedbackEntry.project_id == project_id)
    return query.order_by(FeedbackEntry.created_at.desc()).limit(limit).all()


@router.delete("/{feedback_id}")
def delete_feedback(feedback_id: str, session: Session = Depends(get_session)) -> dict:
    entry = session.get(FeedbackEntry, feedback_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Feedback entry not found")
    session.delete(entry)
    session.commit()
    return {"deleted": True}
