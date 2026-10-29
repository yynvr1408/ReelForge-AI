from __future__ import annotations

from app.database.models import FeedbackEntry
from app.training.dataset import build_dataset_manifest


def test_empty_dataset_manifest(route_session):
    manifest = build_dataset_manifest(route_session)
    assert manifest.total_samples == 0
    assert manifest.meets_training_threshold is False
    assert manifest.validation_status == "needs_more_samples"
    assert manifest.checksum_sha256 != ""


def test_dataset_manifest_threshold_and_balance(route_session):
    # Add 4 too_fast and 4 too_slow entries
    for i in range(4):
        route_session.add(
            FeedbackEntry(
                subject="timeline_pacing",
                action="too_fast",
                payload_json={"target_duration_seconds": 15.0, "asset_count": 3},
            )
        )
        route_session.add(
            FeedbackEntry(
                subject="timeline_pacing",
                action="too_slow",
                payload_json={"target_duration_seconds": 30.0, "asset_count": 5},
            )
        )
    route_session.commit()

    manifest = build_dataset_manifest(route_session)
    assert manifest.total_samples == 8
    assert manifest.class_distribution == {"too_fast": 4, "too_slow": 4}
    assert manifest.meets_training_threshold is True
    assert manifest.is_balanced is True
    assert manifest.validation_status == "ready"
    assert len(manifest.samples) == 8
