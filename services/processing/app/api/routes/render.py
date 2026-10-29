from __future__ import annotations

from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, ValidationError
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.database.models import MediaAsset, Project, RenderJob
from app.database.session import get_session, session_scope
from app.jobs.manager import get_job_manager
from app.jobs.manager import JobHandle
from app.rendering.ffmpeg_renderer import RenderCancelled, RenderProgress, render_timeline
from app.rendering.output_validator import validate_render_output
from app.rendering.quality_analysis import analyze_render_quality
from app.security.auth import require_service_token
from app.security.paths import UnsafePathError, resolve_within
from app.timeline.schema import Timeline
from app.timeline.validator import is_valid, validate_timeline

router = APIRouter(prefix="/render", tags=["render"], dependencies=[Depends(require_service_token)])


class RenderStartRequest(BaseModel):
    project_id: str
    timeline: dict
    output_filename: str | None = None


class RenderJobResponse(BaseModel):
    id: str
    project_id: str
    job_type: str
    status: str
    stage: str | None
    progress: float | None
    error_message: str | None
    output_path: str | None
    validation_json: dict | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


def _run_render_job(job_id: str, settings: Settings, timeline: Timeline, media_paths: dict[str, Path], media_has_audio: dict[str, bool], output_path: Path, handle: JobHandle):
    with session_scope() as session:
        job = session.get(RenderJob, job_id)
        if job is None:
            return
        job.status = "running"
        job.stage = "encoding"
        session.commit()

    def on_progress(progress: RenderProgress):
        with session_scope() as session:
            job = session.get(RenderJob, job_id)
            if job is not None:
                job.stage = progress.stage
                session.commit()

    try:
        if handle.cancelled():
            raise RenderCancelled("Render cancelled")
        render_timeline(
            settings.ffmpeg_path,
            timeline,
            media_paths,
            output_path,
            on_progress=on_progress,
            cancelled=handle.cancelled,
            media_has_audio=media_has_audio,
        )
        validation = validate_render_output(
            settings.ffprobe_path, output_path, timeline.total_duration_seconds, timeline.export_settings
        )
        quality_report = analyze_render_quality(settings.ffmpeg_path, output_path)
        with session_scope() as session:
            job = session.get(RenderJob, job_id)
            if job is not None:
                job.status = "complete" if validation.is_valid else "failed"
                job.stage = "complete"
                job.output_path = str(output_path)
                job.validation_json = {
                    "is_valid": validation.is_valid,
                    "issues": validation.issues,
                    "quality_report": quality_report,
                }
                if not validation.is_valid:
                    job.error_message = "; ".join(validation.issues)
                session.commit()
    except RenderCancelled:
        with session_scope() as session:
            job = session.get(RenderJob, job_id)
            if job is not None:
                job.status = "cancelled"
                job.stage = "cancelled"
                session.commit()
    except Exception as exc:
        # Persist every worker failure so a queued/running job cannot remain stuck forever.
        with session_scope() as session:
            job = session.get(RenderJob, job_id)
            if job is not None:
                job.status = "failed"
                job.error_message = str(exc)[:2000] or type(exc).__name__
                session.commit()


@router.post("/start", response_model=RenderJobResponse)
def start_render(
    payload: RenderStartRequest,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> RenderJob:
    project = session.get(Project, payload.project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        timeline = Timeline.model_validate(payload.timeline)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid timeline: {exc}") from exc

    media_ids = {clip.source_media_id for track in timeline.tracks for clip in track.clips}
    assets = session.query(MediaAsset).filter(MediaAsset.id.in_(media_ids)).all()
    found_ids = {a.id for a in assets}

    issues = validate_timeline(timeline, found_ids)
    if not is_valid(issues):
        raise HTTPException(status_code=422, detail=[i.__dict__ for i in issues])

    media_paths = {a.id: Path(a.storage_path) for a in assets}
    media_has_audio = {a.id: bool(a.has_audio) for a in assets}

    job = RenderJob(project_id=project.id, job_type="render", status="queued")
    session.add(job)
    session.commit()
    session.refresh(job)

    output_name = payload.output_filename or f"{job.id}.mp4"
    # Only accept a simple MP4 filename. Reject both POSIX and Windows path
    # separators so a caller cannot escape the project export directory.
    if (Path(output_name).name != output_name or "\\" in output_name or "/" in output_name
            or output_name in {".", ".."} or not output_name.lower().endswith(".mp4")):
        session.delete(job)
        session.commit()
        raise HTTPException(status_code=422, detail="output_filename must be a plain .mp4 filename")
    project_export_dir = settings.exports_dir / project.id
    try:
        output_path = resolve_within(project_export_dir, Path(output_name))
    except UnsafePathError as exc:
        session.delete(job)
        session.commit()
        raise HTTPException(status_code=422, detail="Invalid output path") from exc

    get_job_manager().submit(
        job.id,
        lambda handle: _run_render_job(job.id, settings, timeline, media_paths, media_has_audio, output_path, handle),
    )

    return job


@router.get("/{job_id}", response_model=RenderJobResponse)
def get_render_job(job_id: str, session: Session = Depends(get_session)) -> RenderJob:
    job = session.get(RenderJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Render job not found")
    return job


@router.get("", response_model=list[RenderJobResponse])
def list_render_jobs(project_id: str | None = None, session: Session = Depends(get_session)) -> list[RenderJob]:
    query = session.query(RenderJob)
    if project_id:
        query = query.filter(RenderJob.project_id == project_id)
    return query.order_by(RenderJob.created_at.desc()).all()


@router.post("/{job_id}/cancel")
def cancel_render_job(job_id: str, session: Session = Depends(get_session)) -> dict:
    job = session.get(RenderJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Render job not found")
    cancelled = get_job_manager().cancel(job_id)
    # The worker owns the terminal state transition after FFmpeg has stopped.
    return {"cancelled": cancelled, "status": job.status}
