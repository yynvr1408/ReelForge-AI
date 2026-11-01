"""SQLAlchemy ORM models.

Only metadata and managed-file references live here. Video files, images,
audio, and model weights are never stored as blobs — the `storage_path`
columns point at files managed under the configured data directories.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def new_id() -> str:
    return uuid.uuid4().hex


def now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class SchemaMigration(Base):
    __tablename__ = "schema_migrations"

    version: Mapped[int] = mapped_column(Integer, primary_key=True)
    applied_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    description: Mapped[str] = mapped_column(Text, default="")


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String, nullable=False)
    schema_version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)
    output_settings: Mapped[dict] = mapped_column(JSON, default=dict)
    selected_style_profile_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("style_profiles.id"), nullable=True
    )
    timeline_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)

    media_assets: Mapped[list["MediaAsset"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    render_jobs: Mapped[list["RenderJob"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    versions: Mapped[list["ProjectVersion"]] = relationship(back_populates="project", cascade="all, delete-orphan")


class ProjectVersion(Base):
    __tablename__ = "project_versions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(String, ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    version_number: Mapped[int] = mapped_column(Integer)
    snapshot_json: Mapped[dict] = mapped_column(JSON)
    reason: Mapped[str] = mapped_column(String, default="save")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    project: Mapped[Project] = relationship(back_populates="versions")


class MediaAsset(Base):
    __tablename__ = "media_assets"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    project_id: Mapped[str | None] = mapped_column(String, ForeignKey("projects.id"), nullable=True)
    kind: Mapped[str] = mapped_column(String)  # "video" | "image" | "audio" | "subtitle"
    original_path: Mapped[str] = mapped_column(Text)
    storage_path: Mapped[str] = mapped_column(Text)
    file_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    frame_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    has_audio: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    thumbnail_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    probe_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String, default="imported")  # imported | missing | invalid
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

    project: Mapped[Project | None] = relationship(back_populates="media_assets")


class ReferenceVideo(Base):
    __tablename__ = "reference_videos"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String)
    original_path: Mapped[str] = mapped_column(Text)
    storage_path: Mapped[str] = mapped_column(Text)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    frame_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    probe_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    analysis_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    analysis_status: Mapped[str] = mapped_column(String, default="pending")  # pending|running|complete|failed
    excluded_from_aggregation: Mapped[bool] = mapped_column(Boolean, default=False)
    collection_id: Mapped[str | None] = mapped_column(String, ForeignKey("reference_collections.id"), nullable=True)
    tags_json: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

    @property
    def file_missing(self) -> bool:
        return not Path(self.storage_path).is_file()


class ReferenceCollection(Base):
    __tablename__ = "reference_collections"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class StyleProfile(Base):
    __tablename__ = "style_profiles"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String)
    version: Mapped[int] = mapped_column(Integer, default=1)
    source_reference_ids: Mapped[list] = mapped_column(JSON, default=list)
    profile_json: Mapped[dict] = mapped_column(JSON, default=dict)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class RenderJob(Base):
    __tablename__ = "render_jobs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(String, ForeignKey("projects.id"))
    job_type: Mapped[str] = mapped_column(String, default="render")
    status: Mapped[str] = mapped_column(String, default="queued")  # queued|running|complete|failed|cancelled
    stage: Mapped[str | None] = mapped_column(String, nullable=True)
    progress: Mapped[float | None] = mapped_column(Float, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    output_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    validation_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)

    project: Mapped[Project] = relationship(back_populates="render_jobs")


class ReferenceAnalysisJob(Base):
    __tablename__ = "reference_analysis_jobs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    reference_id: Mapped[str] = mapped_column(
        String, ForeignKey("reference_videos.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[str] = mapped_column(String, default="queued")
    stage: Mapped[str | None] = mapped_column(String, nullable=True)
    progress: Mapped[float | None] = mapped_column(Float, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class TrainingJob(Base):
    __tablename__ = "training_jobs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    status: Mapped[str] = mapped_column(String, default="queued")
    stage: Mapped[str | None] = mapped_column(String, nullable=True)
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    candidate_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class FeedbackEntry(Base):
    __tablename__ = "feedback_entries"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    project_id: Mapped[str | None] = mapped_column(String, ForeignKey("projects.id"), nullable=True)
    style_profile_id: Mapped[str | None] = mapped_column(String, ForeignKey("style_profiles.id"), nullable=True)
    subject: Mapped[str] = mapped_column(String)  # e.g. "clip_selection", "transition", "color_intensity"
    action: Mapped[str] = mapped_column(String)  # "accepted" | "rejected" | "adjusted"
    payload_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
