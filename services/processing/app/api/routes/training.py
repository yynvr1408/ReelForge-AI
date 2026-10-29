"""Training input staging.

This only covers getting reels onto disk in a folder the user can see
and manage directly in Explorer, and listing what's there. It is
deliberately scoped short of the actual Training Studio (dataset
manifests, task/model selection, resource checks, checkpoints,
evaluation, promotion) described in the product spec's Phase 9 — that
remains future work, tracked in docs/development/known-limitations.md.
Nothing here trains a model.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.config import Settings, get_settings
from app.media.ffprobe import ProbeError, probe_media
from app.media.import_service import MediaImportError, import_media_file
from app.security.auth import require_service_token
from app.database.models import FeedbackEntry, TrainingJob
from app.database.session import get_session, session_scope
from app.jobs.manager import JobHandle, get_job_manager
from app.training.pacing_model import (
    TrainingCancelled,
    TrainingError,
    model_status,
    promote_candidate,
    rollback_model,
    train_candidate,
)
from sqlalchemy.orm import Session

router = APIRouter(prefix="/training", tags=["training"], dependencies=[Depends(require_service_token)])

VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"}


class InputReel(BaseModel):
    filename: str
    path: str
    size_bytes: int
    duration_seconds: float | None
    modified_at: datetime


class ImportInputReelRequest(BaseModel):
    source_path: str


@router.get("/input-reels", response_model=list[InputReel])
def list_input_reels(settings: Settings = Depends(get_settings)) -> list[InputReel]:
    reels: list[InputReel] = []
    for entry in sorted(settings.training_input_dir.glob("*")):
        if not entry.is_file() or entry.suffix.lower() not in VIDEO_EXTENSIONS:
            continue
        stat = entry.stat()
        duration: float | None = None
        try:
            probe = probe_media(settings.ffprobe_path, entry, timeout_seconds=10.0)
            duration = probe.duration_seconds
        except ProbeError:
            duration = None
        reels.append(
            InputReel(
                filename=entry.name,
                path=str(entry),
                size_bytes=stat.st_size,
                duration_seconds=duration,
                modified_at=datetime.fromtimestamp(stat.st_mtime),
            )
        )
    return reels


@router.post("/input-reels/import", response_model=InputReel)
def import_input_reel(payload: ImportInputReelRequest, settings: Settings = Depends(get_settings)) -> InputReel:
    try:
        result = import_media_file(settings, payload.source_path, settings.training_input_dir)
    except MediaImportError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if result.kind != "video":
        result.storage_path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail="Only video files can be staged for training")

    stat = result.storage_path.stat()
    return InputReel(
        filename=result.storage_path.name,
        path=str(result.storage_path),
        size_bytes=stat.st_size,
        duration_seconds=result.probe.duration_seconds if result.probe else None,
        modified_at=datetime.fromtimestamp(stat.st_mtime),
    )


@router.delete("/input-reels/{filename}")
def delete_input_reel(filename: str, settings: Settings = Depends(get_settings)) -> dict:
    target = settings.training_input_dir / filename
    try:
        target.relative_to(settings.training_input_dir.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid filename") from None
    resolved = (settings.training_input_dir / filename).resolve()
    if resolved.parent != settings.training_input_dir.resolve() or not resolved.is_file():
        raise HTTPException(status_code=404, detail="Input reel not found")
    resolved.unlink()
    return {"deleted": True}


@router.get("/models/pacing")
def get_pacing_model_status(settings: Settings = Depends(get_settings)) -> dict:
    return model_status(settings.checkpoints_dir)


@router.post("/models/pacing/train")
def train_pacing_model(
    settings: Settings = Depends(get_settings), session: Session = Depends(get_session)
) -> dict:
    entries = (
        session.query(FeedbackEntry)
        .filter(FeedbackEntry.subject == "timeline_pacing")
        .order_by(FeedbackEntry.created_at.asc())
        .limit(10000)
        .all()
    )
    try:
        candidate = train_candidate(entries, settings.checkpoints_dir)
    except TrainingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"candidate": candidate, **model_status(settings.checkpoints_dir)}


def _training_job_json(job: TrainingJob) -> dict:
    return {
        "id": job.id,
        "status": job.status,
        "stage": job.stage,
        "progress": job.progress,
        "error_message": job.error_message,
        "candidate": job.candidate_json,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "updated_at": job.updated_at.isoformat() if job.updated_at else None,
    }


def _set_training_job(job_id: str, **updates) -> TrainingJob | None:
    with session_scope() as session:
        job = session.get(TrainingJob, job_id)
        if job is None:
            return None
        for key, value in updates.items():
            setattr(job, key, value)
        session.commit()
        session.refresh(job)
        return job


@router.get("/models/pacing/runs/active")
def get_active_pacing_training(session: Session = Depends(get_session)) -> dict | None:
    job = (
        session.query(TrainingJob)
        .filter(TrainingJob.status.in_(["queued", "running", "cancel_requested"]))
        .order_by(TrainingJob.created_at.desc())
        .first()
    )
    return _training_job_json(job) if job else None


@router.post("/models/pacing/train/start")
def start_pacing_training(
    settings: Settings = Depends(get_settings), session: Session = Depends(get_session)
) -> dict:
    active = (
        session.query(TrainingJob)
        .filter(TrainingJob.status.in_(["queued", "running", "cancel_requested"]))
        .order_by(TrainingJob.created_at.desc())
        .first()
    )
    if active is not None:
        return _training_job_json(active)

    job = TrainingJob(status="queued", stage="queued", progress=0.0)
    session.add(job)
    session.commit()
    session.refresh(job)
    job_id = job.id

    def run(handle: JobHandle) -> None:
        current = _set_training_job(job_id, status="running", stage="preparing_dataset", progress=0.0)
        if current is None:
            return
        try:
            with session_scope() as worker_session:
                entries = (
                    worker_session.query(FeedbackEntry)
                    .filter(FeedbackEntry.subject == "timeline_pacing")
                    .order_by(FeedbackEntry.created_at.asc())
                    .limit(10000)
                    .all()
                )

            def report(stage: str, progress: float) -> None:
                _set_training_job(job_id, stage=stage, progress=progress)

            candidate = train_candidate(
                entries,
                settings.checkpoints_dir,
                cancelled=handle.cancelled,
                progress=report,
            )
        except TrainingCancelled:
            _set_training_job(job_id, status="cancelled", stage="cancelled", progress=0.0)
            return
        except TrainingError as exc:
            _set_training_job(job_id, status="failed", stage="failed", error_message=str(exc))
            return
        except Exception:
            _set_training_job(
                job_id,
                status="failed",
                stage="failed",
                error_message="Training failed unexpectedly; see the processing service log",
            )
            return
        _set_training_job(
            job_id,
            status="complete",
            stage="complete",
            progress=1.0,
            candidate_json=candidate,
        )

    get_job_manager().submit(job_id, run)
    return _training_job_json(job)


@router.get("/models/pacing/runs/{job_id}")
def get_pacing_training(job_id: str, session: Session = Depends(get_session)) -> dict:
    job = session.get(TrainingJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Training run not found")
    return _training_job_json(job)


@router.post("/models/pacing/runs/{job_id}/cancel")
def cancel_pacing_training(job_id: str, session: Session = Depends(get_session)) -> dict:
    job = session.get(TrainingJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Training run not found")
    if job.status in {"queued", "running"}:
        if get_job_manager().cancel(job_id):
            job.status = "cancel_requested"
            job.stage = "cancel_requested"
            session.commit()
            session.refresh(job)
    return _training_job_json(job)


@router.post("/models/pacing/promote")
def promote_pacing_model(settings: Settings = Depends(get_settings)) -> dict:
    try:
        return promote_candidate(settings.checkpoints_dir)
    except TrainingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/models/pacing/rollback")
def rollback_pacing_model(settings: Settings = Depends(get_settings)) -> dict:
    try:
        return rollback_model(settings.checkpoints_dir)
    except TrainingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
