from __future__ import annotations

import json

import pytest

from app.database.models import FeedbackEntry
from app.model_manager.registry import get_model_manager_info
from app.training.pacing_model import (
    TrainingCancelled,
    TrainingError,
    model_status,
    predict_adjustment,
    promote_candidate,
    rollback_model,
    train_candidate,
)


def _feedback(index: int, action: str) -> FeedbackEntry:
    return FeedbackEntry(
        id=f"feedback-{index}",
        subject="timeline_pacing",
        action=action,
        payload_json={"target_duration_seconds": 20 + index * 3, "clip_count": 4 + index},
    )


def test_training_requires_balanced_explicit_feedback(tmp_path):
    rows = [_feedback(i, "too_fast") for i in range(8)]
    with pytest.raises(TrainingError, match="at least 3 of each"):
        train_candidate(rows, tmp_path)
    assert not (tmp_path / "pacing-candidate.json").exists()


def test_uninformative_candidate_cannot_be_promoted(tmp_path):
    entries = [_feedback(i, "too_fast" if i % 2 == 0 else "too_slow") for i in range(12)]
    candidate = train_candidate(entries, tmp_path)
    assert candidate["evaluation_count"] == 4
    assert candidate["evaluation_balanced_accuracy"] < 0.5
    assert candidate["promotable"] is False
    with pytest.raises(TrainingError, match="majority and balanced-accuracy baselines"):
        promote_candidate(tmp_path)


def test_legacy_candidate_without_balanced_evaluation_cannot_be_promoted(tmp_path):
    entries = [_feedback(i, "too_fast" if i < 6 else "too_slow") for i in range(12)]
    train_candidate(entries, tmp_path)
    candidate_path = tmp_path / "pacing-candidate.json"
    legacy = json.loads(candidate_path.read_text())
    legacy.pop("evaluation_balanced_accuracy")
    legacy.pop("majority_baseline_balanced_accuracy")
    legacy.pop("evaluation_count")
    legacy["promotable"] = True
    candidate_path.write_text(json.dumps(legacy))

    assert model_status(tmp_path)["candidate"]["promotable"] is False
    with pytest.raises(TrainingError, match="balanced-accuracy baselines"):
        promote_candidate(tmp_path)


def test_train_evaluate_promote_and_rollback(tmp_path):
    entries = [_feedback(i, "too_fast" if i < 6 else "too_slow") for i in range(12)]
    candidate = train_candidate(entries, tmp_path)
    assert candidate["sample_count"] == 12
    assert candidate["evaluation_count"] == 4
    assert candidate["training_count"] == 12
    assert candidate["evaluation_training_count"] == 8
    assert candidate["evaluation_balanced_accuracy"] > 0.5
    assert candidate["promotable"] is True
    assert candidate["dataset_sha256"]
    assert json.loads((tmp_path / "pacing-candidate.json").read_text())
    assert model_status(tmp_path)["active"] is None

    promote_candidate(tmp_path)
    assert model_status(tmp_path)["active"] is not None
    assert predict_adjustment(tmp_path, 30, 5) is not None
    managed = get_model_manager_info(tmp_path)
    assert managed["models"][0]["integrity"] == "verified"
    assert managed["models"][0]["license"].startswith("MIT")
    assert managed["hardware"]["logical_cpu_count"]

    # Promote another version to create a previous checkpoint, then verify rollback.
    changed = [_feedback(i + 20, "too_slow" if i < 6 else "too_fast") for i in range(12)]
    train_candidate(changed, tmp_path)
    promote_candidate(tmp_path)
    status = rollback_model(tmp_path)
    assert status["active"]["dataset_sha256"] != status["candidate"]["dataset_sha256"]
    assert status["rollback_available"] is True


def test_invalid_model_checkpoint_is_not_loaded(tmp_path):
    (tmp_path / "pacing-active.json").write_text('{"weights": ["bad"]}')
    assert predict_adjustment(tmp_path, 30, 5) is None


def test_training_cancellation_does_not_write_a_candidate(tmp_path):
    entries = [_feedback(i, "too_fast" if i < 6 else "too_slow") for i in range(12)]
    checks = 0

    def cancel_during_fit():
        nonlocal checks
        checks += 1
        return checks > 2

    with pytest.raises(TrainingCancelled):
        train_candidate(entries, tmp_path, cancelled=cancel_during_fit)
    assert not (tmp_path / "pacing-candidate.json").exists()


def test_active_checkpoint_checksum_fails_closed_when_modified(tmp_path):
    entries = [_feedback(i, "too_fast" if i < 6 else "too_slow") for i in range(12)]
    train_candidate(entries, tmp_path)
    promote_candidate(tmp_path)
    active_path = tmp_path / "pacing-active.json"
    active_path.write_text(active_path.read_text() + " ")
    assert predict_adjustment(tmp_path, 30, 5) is None
    assert get_model_manager_info(tmp_path)["models"][0]["integrity"] == "unverified"

