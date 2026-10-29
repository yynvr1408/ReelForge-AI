from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.database.models import Project, ProjectVersion
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


class ProjectVersionResponse(BaseModel):
    id: str
    project_id: str
    version_number: int
    snapshot_json: dict
    reason: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


def _snapshot(project: Project) -> dict:
    return {
        "name": project.name,
        "schema_version": project.schema_version,
        "output_settings": project.output_settings or {},
        "selected_style_profile_id": project.selected_style_profile_id,
        "timeline_json": project.timeline_json,
        "is_archived": bool(project.is_archived),
    }


def _save_version(project: Project, session: Session, reason: str) -> ProjectVersion:
    latest = (
        session.query(ProjectVersion)
        .filter(ProjectVersion.project_id == project.id)
        .order_by(ProjectVersion.version_number.desc())
        .first()
    )
    snapshot = _snapshot(project)
    if latest and latest.snapshot_json == snapshot and reason == "save":
        return latest
    version = ProjectVersion(
        project_id=project.id,
        version_number=(latest.version_number + 1) if latest else 1,
        snapshot_json=snapshot,
        reason=reason,
    )
    session.add(version)
    return version


@router.post("", response_model=ProjectResponse)
def create_project(payload: ProjectCreateRequest, session: Session = Depends(get_session)) -> Project:
    project = Project(name=payload.name)
    session.add(project)
    session.commit()
    session.refresh(project)
    _save_version(project, session, "created")
    session.commit()
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
    session.flush()
    _save_version(project, session, "save")
    session.commit()
    session.refresh(project)
    return project


@router.get("/{project_id}/versions", response_model=list[ProjectVersionResponse])
def list_project_versions(project_id: str, session: Session = Depends(get_session)) -> list[ProjectVersion]:
    if session.get(Project, project_id) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return (
        session.query(ProjectVersion)
        .filter(ProjectVersion.project_id == project_id)
        .order_by(ProjectVersion.version_number.desc())
        .all()
    )


@router.post("/{project_id}/versions/{version_id}/restore", response_model=ProjectResponse)
def restore_project_version(
    project_id: str,
    version_id: str,
    session: Session = Depends(get_session),
) -> Project:
    project = session.get(Project, project_id)
    version = session.get(ProjectVersion, version_id)
    if project is None or version is None or version.project_id != project_id:
        raise HTTPException(status_code=404, detail="Project version not found")
    snapshot = version.snapshot_json
    for field in (
        "name",
        "schema_version",
        "output_settings",
        "selected_style_profile_id",
        "timeline_json",
        "is_archived",
    ):
        if field in snapshot:
            setattr(project, field, snapshot[field])
    session.flush()
    _save_version(project, session, f"restore:{version.version_number}")
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
