"""Dataset manifest authoring, validation, and inspection for Training Studio.

Satisfies Section 25 & 26 of the product specification:
- Dataset inspection, sample counts, and class balance checks.
- Structured dataset manifests with versioning and cryptographic checksums.
- Validation for minimum sample requirements and balance criteria before training.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database.models import FeedbackEntry


class DatasetSample(BaseModel):
    id: str
    target_duration_seconds: float
    asset_count: int
    label: str  # "too_fast" (increase) or "too_slow" (decrease)
    created_at: str


class DatasetManifest(BaseModel):
    id: str
    task: str = "pacing_preference"
    version: int = 1
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    total_samples: int
    class_distribution: dict[str, int]
    is_balanced: bool
    meets_training_threshold: bool
    validation_status: str  # "ready" | "needs_more_samples" | "unbalanced"
    validation_message: str
    feature_names: list[str] = Field(default_factory=lambda: ["target_duration_seconds", "asset_count"])
    samples: list[DatasetSample] = Field(default_factory=list)
    checksum_sha256: str = ""


def build_dataset_manifest(
    session: Session,
    style_profile_id: str | None = None,
    project_id: str | None = None,
) -> DatasetManifest:
    """Build a validated dataset manifest from user pacing feedback."""
    query = session.query(FeedbackEntry).filter(FeedbackEntry.subject == "timeline_pacing")
    if style_profile_id:
        query = query.filter(FeedbackEntry.style_profile_id == style_profile_id)
    elif project_id:
        query = query.filter(FeedbackEntry.project_id == project_id)

    feedback_rows = query.order_by(FeedbackEntry.created_at.desc()).limit(5000).all()

    samples: list[DatasetSample] = []
    class_counts: dict[str, int] = {"too_fast": 0, "too_slow": 0}

    for row in feedback_rows:
        if row.action not in class_counts:
            continue
        class_counts[row.action] += 1
        payload = row.payload_json or {}
        samples.append(
            DatasetSample(
                id=row.id,
                target_duration_seconds=float(payload.get("target_duration_seconds", 30.0)),
                asset_count=int(payload.get("asset_count", 1)),
                label=row.action,
                created_at=row.created_at.isoformat(),
            )
        )

    total = len(samples)
    min_count = min(class_counts.values()) if total > 0 else 0
    max_count = max(class_counts.values()) if total > 0 else 0

    # Rule: at least 8 samples with at least 3 per class
    meets_threshold = total >= 8 and min_count >= 3
    is_balanced = (max_count <= min_count * 3) if min_count > 0 else (total == 0)

    if not meets_threshold:
        status = "needs_more_samples"
        message = (
            f"Dataset has {total} samples (too_fast: {class_counts['too_fast']}, "
            f"too_slow: {class_counts['too_slow']}). Needs at least 8 samples with >= 3 per class."
        )
    elif not is_balanced:
        status = "unbalanced"
        message = (
            f"Class imbalance detected: {class_counts['too_fast']} vs {class_counts['too_slow']}. "
            "Training will use stratified holdout, but consider balancing feedback."
        )
    else:
        status = "ready"
        message = f"Dataset is ready for model training ({total} samples)."

    # Deterministic SHA-256 manifest hash
    raw_content = json.dumps(
        {"total": total, "classes": class_counts, "sample_ids": [s.id for s in samples]},
        sort_keys=True,
    )
    checksum = hashlib.sha256(raw_content.encode("utf-8")).hexdigest()

    manifest_id = f"dataset-manifest-{checksum[:12]}"
    return DatasetManifest(
        id=manifest_id,
        total_samples=total,
        class_distribution=class_counts,
        is_balanced=is_balanced,
        meets_training_threshold=meets_threshold,
        validation_status=status,
        validation_message=message,
        samples=samples,
        checksum_sha256=checksum,
    )
