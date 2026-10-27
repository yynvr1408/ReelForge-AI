from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.database.models import Project
from app.database.session import get_session
from app.security.auth import require_service_token

router = APIRouter(prefix="/projects", tags=["projects"], dependencies=[Depends(require_service_token)])


class ProjectCreateRequest(BaseModel):
    name: str


class ProjectResponse(BaseModel):
    id: str
    name: str
    schema_version: int
    created_at: datetime
    updated_at: datetime
    output_settings: dict
    selected_style_profile_id: str | None
    timeline_json: dict | None
    is_archived: bool

    model_config = ConfigDict(from_attributes=True)


@router.post("", response_model=ProjectResponse)
def create_project(payload: ProjectCreateRequest, session: Session = Depends(get_session)) -> Project:
    project = Project(name=payload.name)
    session.add(project)
    session.commit()
    session.refresh(project)
    return project


@router.get("", response_model=list[ProjectResponse])
def list_projects(session: Session = Depends(get_session)) -> list[Project]:
    return session.query(Project).order_by(Project.updated_at.desc()).all()


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(project_id: str, session: Session = Depends(get_session)) -> Project:
    project = session.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


class ProjectUpdateRequest(BaseModel):
    name: str | None = None
    output_settings: dict | None = None
    selected_style_profile_id: str | None = None
    timeline_json: dict | None = None


@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: str, payload: ProjectUpdateRequest, session: Session = Depends(get_session)
) -> Project:
    project = session.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    session.commit()
    session.refresh(project)
    return project


@router.delete("/{project_id}")
def delete_project(project_id: str, session: Session = Depends(get_session)) -> dict:
    project = session.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    session.delete(project)
    session.commit()
    return {"deleted": True}
