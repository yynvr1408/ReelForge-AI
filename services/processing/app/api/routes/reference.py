from __future__ import annotations

from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.analysis.cancellation import AnalysisCancelled, check_cancelled
from app.analysis.scene_detection import analyze_scenes
from app.analysis.reference_similarity import compare_reference_features, reference_features
from app.analysis.audio_features import analyze_audio_features
from app.analysis.visual_features import analyze_visual_features
from app.core.config import Settings, get_settings
from app.database.models import ReferenceAnalysisJob, ReferenceCollection, ReferenceVideo
from app.database.session import get_session, session_scope
from app.jobs.manager import JobHandle, get_job_manager
from app.media.import_service import MediaImportError, import_media_file
from app.security.auth import require_service_token

router = APIRouter(prefix="/reference", tags=["reference"], dependencies=[Depends(require_service_token)])


class ReferenceImportRequest(BaseModel):
    source_path: str
    name: str | None = None


class ReferenceRelinkRequest(BaseModel):
    source_path: str


class ReferenceResponse(BaseModel):
    id: str
    name: str
    storage_path: str
    file_missing: bool
    duration_seconds: float | None
    width: int | None
    height: int | None
    frame_rate: float | None
    analysis_json: dict | None
    analysis_status: str
    excluded_from_aggregation: bool
    tags_json: list
    collection_id: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CollectionCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class CollectionResponse(BaseModel):
    id: str
    name: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ReferenceUpdateRequest(BaseModel):
    tags: list[str] | None = Field(default=None, max_length=30)
    collection_id: str | None = None
    excluded_from_aggregation: bool | None = None


class ReferenceCollectionUpdateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class ReferenceAnalysisJobResponse(BaseModel):
    id: str
    reference_id: str
    status: str
    stage: str | None
    progress: float | None = None
    error_message: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SimilarReferenceResponse(BaseModel):
    reference_id: str
    name: str
    similarity_score: float
    shared_signals: list[str]
    signal_differences: dict[str, float]


def _collect_analysis(reference_path: Path, probe_json: dict | None, settings: Settings, cancelled=None, stage=None) -> dict:
    check_cancelled(cancelled)
    if stage:
        stage("scene_detection", 0.15)
    analysis = asdict(analyze_scenes(reference_path, cancelled=cancelled))
    check_cancelled(cancelled)
    if stage:
        stage("visual_analysis", 0.50)
    analysis["visual"] = analyze_visual_features(reference_path, cancelled=cancelled)
    if probe_json and any(stream.get("codec_type") == "audio" for stream in probe_json.get("streams", [])):
        check_cancelled(cancelled)
        if stage:
            stage("audio_analysis", 0.85)
        analysis["audio"] = analyze_audio_features(settings.ffmpeg_path, reference_path, cancelled=cancelled)
    check_cancelled(cancelled)
    return analysis


def _set_analysis_stage(job_id: str, stage: str, progress: float | None = None) -> None:
    with session_scope() as session:
        job = session.get(ReferenceAnalysisJob, job_id)
        if job is not None and job.status == "running":
            job.stage = stage
            if progress is not None:
                job.progress = progress
            session.commit()


def _run_analysis_job(job_id: str, settings: Settings, handle: JobHandle) -> None:
    with session_scope() as session:
        job = session.get(ReferenceAnalysisJob, job_id)
        if job is None:
            return
        reference = session.get(ReferenceVideo, job.reference_id)
        if reference is None:
            job.status = "failed"
            job.error_message = "Reference video was deleted"
            session.commit()
            return
        job.status = "running"
        job.stage = "scene_detection"
        job.progress = 0.05
        reference.analysis_status = "running"
        session.commit()

    try:
        check_cancelled(handle.cancelled)
        with session_scope() as session:
            reference = session.get(ReferenceVideo, job.reference_id)
            if reference is None:
                raise ValueError("Reference video was deleted")
            reference_path = Path(reference.storage_path)
            probe_json = reference.probe_json
        analysis = _collect_analysis(
            reference_path,
            probe_json,
            settings,
            cancelled=handle.cancelled,
            stage=lambda s, p=None: _set_analysis_stage(job_id, s, p),
        )
        check_cancelled(handle.cancelled)
        with session_scope() as session:
            job = session.get(ReferenceAnalysisJob, job_id)
            reference = session.get(ReferenceVideo, job.reference_id) if job else None
            if job is None:
                return
            job.status = "complete"
            job.stage = "complete"
            job.progress = 1.0
            if reference is not None:
                reference.analysis_json = analysis
                reference.analysis_status = "complete"
            session.commit()
    except AnalysisCancelled:
        with session_scope() as session:
            job = session.get(ReferenceAnalysisJob, job_id)
            reference = session.get(ReferenceVideo, job.reference_id) if job else None
            if job is not None:
                job.status = "cancelled"
                job.stage = "cancelled"
            if reference is not None:
                reference.analysis_status = "cancelled"
            session.commit()
    except Exception as exc:
        with session_scope() as session:
            job = session.get(ReferenceAnalysisJob, job_id)
            reference = session.get(ReferenceVideo, job.reference_id) if job else None
            if job is not None:
                job.status = "failed"
                job.stage = "failed"
                job.error_message = str(exc)[:2000] or type(exc).__name__
            if reference is not None:
                reference.analysis_status = "failed"
            session.commit()


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


@router.post("/{reference_id}/relink", response_model=ReferenceResponse)
def relink_reference(
    reference_id: str,
    payload: ReferenceRelinkRequest,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> ReferenceVideo:
    reference = session.get(ReferenceVideo, reference_id)
    if reference is None:
        raise HTTPException(status_code=404, detail="Reference video not found")
    active_job = (
        session.query(ReferenceAnalysisJob)
        .filter(
            ReferenceAnalysisJob.reference_id == reference_id,
            ReferenceAnalysisJob.status.in_(["queued", "running"]),
        )
        .first()
    )
    if active_job and get_job_manager().is_active(active_job.id):
        raise HTTPException(status_code=409, detail="Wait for reference analysis to stop before relinking")
    try:
        replacement = import_media_file(settings, payload.source_path, settings.reference_dir)
    except MediaImportError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if replacement.kind != "video":
        Path(replacement.storage_path).unlink(missing_ok=True)
        if replacement.thumbnail_path:
            Path(replacement.thumbnail_path).unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail="Reference relinking requires a video file")

    reference.original_path = str(replacement.original_path)
    reference.storage_path = str(replacement.storage_path)
    reference.duration_seconds = replacement.probe.duration_seconds if replacement.probe else None
    reference.width = replacement.probe.width if replacement.probe else None
    reference.height = replacement.probe.height if replacement.probe else None
    reference.frame_rate = replacement.probe.frame_rate if replacement.probe else None
    reference.probe_json = replacement.probe.raw if replacement.probe else None
    reference.analysis_json = None
    reference.analysis_status = "pending"
    session.commit()
    session.refresh(reference)
    return reference


@router.post("/{reference_id}/analyze", response_model=ReferenceResponse)
def analyze_reference(
    reference_id: str,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> ReferenceVideo:
    reference = session.get(ReferenceVideo, reference_id)
    if reference is None:
        raise HTTPException(status_code=404, detail="Reference video not found")

    reference.analysis_status = "running"
    session.commit()

    try:
        analysis = _collect_analysis(Path(reference.storage_path), reference.probe_json, settings)
    except Exception as exc:
        reference.analysis_status = "failed"
        session.commit()
        raise HTTPException(status_code=500, detail=f"Reference analysis failed: {exc}") from exc

    reference.analysis_json = analysis
    reference.analysis_status = "complete"
    session.commit()
    session.refresh(reference)
    return reference


@router.post("/{reference_id}/analyze/start", response_model=ReferenceAnalysisJobResponse)
def start_reference_analysis(
    reference_id: str,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> ReferenceAnalysisJob:
    reference = session.get(ReferenceVideo, reference_id)
    if reference is None:
        raise HTTPException(status_code=404, detail="Reference video not found")
    active = (
        session.query(ReferenceAnalysisJob)
        .filter(
            ReferenceAnalysisJob.reference_id == reference_id,
            ReferenceAnalysisJob.status.in_(["queued", "running"]),
        )
        .order_by(ReferenceAnalysisJob.created_at.desc())
        .first()
    )
    manager = get_job_manager()
    if active and manager.is_active(active.id):
        return active
    if active:
        active.status = "failed"
        active.stage = "failed"
        active.error_message = "Analysis worker stopped before completing"
        session.commit()

    job = ReferenceAnalysisJob(reference_id=reference_id, status="queued", stage="queued")
    session.add(job)
    reference.analysis_status = "running"
    session.commit()
    session.refresh(job)
    manager.submit(job.id, lambda handle: _run_analysis_job(job.id, settings, handle))
    return job


@router.get("/analysis-jobs/{job_id}", response_model=ReferenceAnalysisJobResponse)
def get_reference_analysis_job(job_id: str, session: Session = Depends(get_session)) -> ReferenceAnalysisJob:
    job = session.get(ReferenceAnalysisJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Reference analysis job not found")
    if job.status in {"queued", "running"} and not get_job_manager().is_active(job_id):
        job.status = "failed"
        job.stage = "failed"
        job.error_message = "Analysis worker stopped before completing"
        reference = session.get(ReferenceVideo, job.reference_id)
        if reference is not None:
            reference.analysis_status = "failed"
        session.commit()
    return job


@router.post("/analysis-jobs/{job_id}/cancel", response_model=ReferenceAnalysisJobResponse)
def cancel_reference_analysis_job(job_id: str, session: Session = Depends(get_session)) -> ReferenceAnalysisJob:
    job = session.get(ReferenceAnalysisJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Reference analysis job not found")
    if job.status in {"queued", "running"}:
        if not get_job_manager().cancel(job_id):
            job.status = "failed"
            job.stage = "failed"
            job.error_message = "Analysis worker stopped before completing"
            reference = session.get(ReferenceVideo, job.reference_id)
            if reference is not None:
                reference.analysis_status = "failed"
        session.commit()
    return job


@router.post("/collections", response_model=CollectionResponse)
def create_collection(
    payload: CollectionCreateRequest,
    session: Session = Depends(get_session),
) -> ReferenceCollection:
    collection = ReferenceCollection(name=payload.name.strip())
    if not collection.name:
        raise HTTPException(status_code=422, detail="Collection name cannot be blank")
    session.add(collection)
    session.commit()
    session.refresh(collection)
    return collection


@router.get("/collections", response_model=list[CollectionResponse])
def list_collections(session: Session = Depends(get_session)) -> list[ReferenceCollection]:
    return session.query(ReferenceCollection).order_by(ReferenceCollection.name.asc()).all()


@router.patch("/collections/{collection_id}", response_model=CollectionResponse)
def update_collection(
    collection_id: str,
    payload: ReferenceCollectionUpdateRequest,
    session: Session = Depends(get_session),
) -> ReferenceCollection:
    collection = session.get(ReferenceCollection, collection_id)
    if collection is None:
        raise HTTPException(status_code=404, detail="Collection not found")
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Collection name cannot be blank")
    collection.name = name
    session.commit()
    session.refresh(collection)
    return collection


@router.delete("/collections/{collection_id}")
def delete_collection(collection_id: str, session: Session = Depends(get_session)) -> dict:
    collection = session.get(ReferenceCollection, collection_id)
    if collection is None:
        raise HTTPException(status_code=404, detail="Collection not found")
    session.query(ReferenceVideo).filter(ReferenceVideo.collection_id == collection_id).update(
        {ReferenceVideo.collection_id: None}, synchronize_session="fetch"
    )
    session.delete(collection)
    session.commit()
    return {"deleted": True}


@router.patch("/{reference_id}", response_model=ReferenceResponse)
def update_reference(
    reference_id: str,
    payload: ReferenceUpdateRequest,
    session: Session = Depends(get_session),
) -> ReferenceVideo:
    reference = session.get(ReferenceVideo, reference_id)
    if reference is None:
        raise HTTPException(status_code=404, detail="Reference video not found")
    if "collection_id" in payload.model_fields_set:
        if payload.collection_id and session.get(ReferenceCollection, payload.collection_id) is None:
            raise HTTPException(status_code=404, detail="Collection not found")
        reference.collection_id = payload.collection_id or None
    if payload.tags is not None:
        tags = [tag.strip() for tag in payload.tags]
        tags = [tag for tag in tags if tag]
        if any(len(tag) > 40 for tag in tags):
            raise HTTPException(status_code=422, detail="Tags must be 40 characters or fewer")
        reference.tags_json = sorted(set(tags), key=str.casefold)
    if payload.excluded_from_aggregation is not None:
        reference.excluded_from_aggregation = payload.excluded_from_aggregation
    session.commit()
    session.refresh(reference)
    return reference


@router.get("", response_model=list[ReferenceResponse])
def list_references(
    search: str | None = Query(default=None, max_length=120),
    collection_id: str | None = None,
    tag: str | None = Query(default=None, max_length=40),
    analysis_status: str | None = None,
    min_duration: float | None = Query(default=None, ge=0),
    max_duration: float | None = Query(default=None, ge=0),
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    session: Session = Depends(get_session),
) -> list[ReferenceVideo]:
    query = session.query(ReferenceVideo)
    if search:
        query = query.filter(ReferenceVideo.name.ilike(f"%{search.strip()}%"))
    if collection_id:
        query = query.filter(ReferenceVideo.collection_id == collection_id)
    if analysis_status:
        query = query.filter(ReferenceVideo.analysis_status == analysis_status)
    if min_duration is not None:
        query = query.filter(ReferenceVideo.duration_seconds >= min_duration)
    if max_duration is not None:
        query = query.filter(ReferenceVideo.duration_seconds <= max_duration)
    if tag:
        normalized_tag = tag.strip().casefold()
        tag_values = func.json_each(ReferenceVideo.tags_json).table_valued("value").alias("reference_tags")
        query = query.filter(
            select(1)
            .select_from(tag_values)
            .where(func.lower(tag_values.c.value) == normalized_tag)
            .exists()
        )
    return query.order_by(ReferenceVideo.created_at.desc(), ReferenceVideo.id.desc()).offset(offset).limit(limit).all()


@router.get("/similar/{reference_id}", response_model=list[SimilarReferenceResponse])
def find_similar_references(
    reference_id: str,
    limit: int = Query(default=10, ge=1, le=50),
    session: Session = Depends(get_session),
) -> list[dict]:
    reference = session.get(ReferenceVideo, reference_id)
    if reference is None:
        raise HTTPException(status_code=404, detail="Reference video not found")
    if reference.analysis_status != "complete" or not reference.analysis_json:
        raise HTTPException(status_code=409, detail="Analyze this reference before finding similar references")
    features = reference_features(reference.analysis_json)
    if len(features) < 3:
        raise HTTPException(status_code=422, detail="This reference has too few measured signals for comparison")

    candidates = (
        session.query(ReferenceVideo)
        .filter(ReferenceVideo.analysis_status == "complete", ReferenceVideo.id != reference_id)
        .order_by(ReferenceVideo.created_at.desc(), ReferenceVideo.id.desc())
        .limit(1000)
        .all()
    )
    results = []
    for candidate in candidates:
        comparison = compare_reference_features(features, reference_features(candidate.analysis_json))
        if comparison is not None:
            results.append({"reference_id": candidate.id, "name": candidate.name, **comparison})
    return sorted(results, key=lambda item: (-item["similarity_score"], item["name"].casefold()))[:limit]


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
