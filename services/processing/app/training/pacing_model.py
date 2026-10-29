"""Small, offline preference model trained only from explicit user feedback."""

from __future__ import annotations

import hashlib
import json
import math
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from app.database.models import FeedbackEntry

MODEL_NAME = "pacing-preference-logistic-v1"
FEATURES = ("log_target_duration", "log_clip_count")


class TrainingError(ValueError):
    pass


class TrainingCancelled(TrainingError):
    pass


def build_dataset(entries: list[FeedbackEntry]) -> tuple[list[list[float]], list[int], str]:
    rows: list[list[float]] = []
    labels: list[int] = []
    source_rows: list[tuple[str, str, float, float]] = []
    for entry in entries:
        if entry.subject != "timeline_pacing" or entry.action not in {"too_fast", "too_slow"}:
            continue
        payload = entry.payload_json or {}
        duration = payload.get("target_duration_seconds")
        clip_count = payload.get("clip_count")
        if not isinstance(duration, (int, float)) or not 0 < duration <= 900:
            continue
        if not isinstance(clip_count, (int, float)) or not 1 <= clip_count <= 1000:
            continue
        rows.append([math.log(float(duration)), math.log(float(clip_count))])
        labels.append(1 if entry.action == "too_fast" else 0)
        source_rows.append((entry.id, entry.action, float(duration), float(clip_count)))
    digest_payload = json.dumps(sorted(source_rows), separators=(",", ":"), ensure_ascii=True)
    digest = hashlib.sha256(digest_payload.encode()).hexdigest()
    return rows, labels, digest


def _sigmoid(value: float) -> float:
    value = max(-30.0, min(30.0, value))
    return 1.0 / (1.0 + math.exp(-value))


def _predict(model: dict[str, Any], row: list[float]) -> float:
    normalized = [(value - model["means"][i]) / model["scales"][i] for i, value in enumerate(row)]
    return _sigmoid(model["bias"] + sum(w * x for w, x in zip(model["weights"], normalized, strict=True)))


def _fit(
    rows: list[list[float]],
    labels: list[int],
    cancelled: Callable[[], bool] | None = None,
    progress: Callable[[float], None] | None = None,
) -> dict[str, Any]:
    means = [sum(row[i] for row in rows) / len(rows) for i in range(len(FEATURES))]
    scales = [max(1e-6, math.sqrt(sum((row[i] - means[i]) ** 2 for row in rows) / len(rows))) for i in range(len(FEATURES))]
    normalized = [[(row[i] - means[i]) / scales[i] for i in range(len(FEATURES))] for row in rows]
    weights = [0.0] * len(FEATURES)
    bias = 0.0
    learning_rate = 0.08
    for epoch in range(600):
        if cancelled and cancelled():
            raise TrainingCancelled("Training was cancelled")
        grad = [0.0] * len(FEATURES)
        grad_bias = 0.0
        for row, label in zip(normalized, labels, strict=True):
            error = _sigmoid(bias + sum(w * x for w, x in zip(weights, row, strict=True))) - label
            grad_bias += error
            for i, value in enumerate(row):
                grad[i] += error * value
        bias -= learning_rate * grad_bias / len(rows)
        weights = [w - learning_rate * (grad[i] / len(rows) + 0.01 * w) for i, w in enumerate(weights)]
        if progress and (epoch + 1) % 60 == 0:
            progress((epoch + 1) / 600)
    return {"weights": weights, "bias": bias, "means": means, "scales": scales}


def train_candidate(
    entries: list[FeedbackEntry],
    checkpoint_dir: Path,
    cancelled: Callable[[], bool] | None = None,
    progress: Callable[[str, float], None] | None = None,
) -> dict[str, Any]:
    if cancelled and cancelled():
        raise TrainingCancelled("Training was cancelled")
    if progress:
        progress("preparing_dataset", 0.03)
    rows, labels, digest = build_dataset(entries)
    positives = sum(labels)
    negatives = len(labels) - positives
    if len(rows) < 8 or positives < 3 or negatives < 3:
        raise TrainingError("Need at least 8 valid too-fast/too-slow ratings, with at least 3 of each")

    # Deterministic, stratified 25% holdout by feature-row fingerprint. Keep
    # at least two fit examples per class, even at the minimum data size.
    train_idx: list[int] = []
    test_idx: list[int] = []
    for label in (0, 1):
        class_indices = [i for i, value in enumerate(labels) if value == label]
        class_indices.sort(
            key=lambda i: hashlib.sha256(
                json.dumps(rows[i], separators=(",", ":")).encode()
            ).digest()
        )
        holdout_count = min(max(1, math.ceil(len(class_indices) * 0.25)), len(class_indices) - 2)
        test_idx.extend(class_indices[:holdout_count])
        train_idx.extend(class_indices[holdout_count:])
    train_idx.sort()
    test_idx.sort()
    train_rows = [rows[i] for i in train_idx]
    train_labels = [labels[i] for i in train_idx]
    test_rows = [rows[i] for i in test_idx]
    test_labels = [labels[i] for i in test_idx]
    if progress:
        progress("training_model", 0.05)
    model = _fit(
        train_rows,
        train_labels,
        cancelled=cancelled,
        progress=(lambda fraction: progress("training_model", 0.05 + fraction * 0.82)) if progress else None,
    )
    if cancelled and cancelled():
        raise TrainingCancelled("Training was cancelled")
    if progress:
        progress("evaluating_candidate", 0.9)
    predictions = [int(_predict(model, row) >= 0.5) for row in test_rows]
    correct = sum(prediction == label for prediction, label in zip(predictions, test_labels, strict=True))
    accuracy = correct / len(test_labels)
    majority_baseline = max(sum(test_labels), len(test_labels) - sum(test_labels)) / len(test_labels)
    true_positive = sum(prediction == label == 1 for prediction, label in zip(predictions, test_labels, strict=True))
    true_negative = sum(prediction == label == 0 for prediction, label in zip(predictions, test_labels, strict=True))
    positive_count = sum(test_labels)
    negative_count = len(test_labels) - positive_count
    balanced_accuracy = 0.5 * (true_positive / positive_count + true_negative / negative_count)
    # Compare against both the majority classifier and chance-level balanced
    # performance. A tie with an uninformative baseline is not promotable.
    promotable = accuracy >= majority_baseline and balanced_accuracy > 0.5
    if cancelled and cancelled():
        raise TrainingCancelled("Training was cancelled")
    if progress:
        progress("training_final_model", 0.93)
    final_model = _fit(
        rows,
        labels,
        cancelled=cancelled,
        progress=(lambda fraction: progress("training_final_model", 0.91 + fraction * 0.05)) if progress else None,
    )
    result = {
        "model_name": MODEL_NAME,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "dataset_sha256": digest,
        "sample_count": len(rows),
        "training_count": len(rows),
        "evaluation_training_count": len(train_rows),
        "evaluation_count": len(test_rows),
        "evaluation_accuracy": accuracy,
        "majority_baseline_accuracy": majority_baseline,
        "evaluation_balanced_accuracy": balanced_accuracy,
        "majority_baseline_balanced_accuracy": 0.5,
        "promotable": promotable,
        **final_model,
    }
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    candidate_path = checkpoint_dir / "pacing-candidate.json"
    if cancelled and cancelled():
        raise TrainingCancelled("Training was cancelled")
    if progress:
        progress("saving_candidate", 0.97)
    candidate_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    if progress:
        progress("complete", 1.0)
    return {key: value for key, value in result.items() if key not in {"weights", "bias", "means", "scales"}}


def read_model(path: Path) -> dict[str, Any] | None:
    try:
        checksum_path = path.with_suffix(path.suffix + ".sha256")
        if path.name == "pacing-active.json" and checksum_path.exists():
            expected = checksum_path.read_text(encoding="ascii").strip()
            actual = hashlib.sha256(path.read_bytes()).hexdigest()
            if not expected or actual != expected:
                return None
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("model_name") != MODEL_NAME or not all(isinstance(data.get(k), list) for k in ("weights", "means", "scales")):
            return None
        if not all(len(data[k]) == len(FEATURES) for k in ("weights", "means", "scales")):
            return None
        numeric_values = [*data["weights"], *data["means"], *data["scales"], data.get("bias")]
        if not all(isinstance(value, (int, float)) and math.isfinite(value) for value in numeric_values):
            return None
        if any(scale <= 0 for scale in data["scales"]):
            return None
        return data
    except (OSError, ValueError, TypeError):
        return None


def model_status(checkpoint_dir: Path) -> dict[str, Any]:
    active = read_model(checkpoint_dir / "pacing-active.json")
    candidate = read_model(checkpoint_dir / "pacing-candidate.json")
    previous = read_model(checkpoint_dir / "pacing-previous.json")
    def summary(item: dict[str, Any] | None) -> dict[str, Any] | None:
        if item is None:
            return None
        result = {key: item.get(key) for key in (
            "model_name", "created_at", "sample_count", "training_count", "evaluation_training_count",
            "evaluation_count", "evaluation_accuracy", "majority_baseline_accuracy",
            "evaluation_balanced_accuracy", "majority_baseline_balanced_accuracy", "promotable", "dataset_sha256",
        )}
        # Older checkpoints lack balanced metrics; do not expose them as
        # promotable after tightening the evaluation gate.
        result["promotable"] = bool(
            item.get("promotable")
            and isinstance(item.get("evaluation_accuracy"), (int, float))
            and isinstance(item.get("majority_baseline_accuracy"), (int, float))
            and item.get("evaluation_accuracy") >= item.get("majority_baseline_accuracy")
            and isinstance(item.get("evaluation_balanced_accuracy"), (int, float))
            and item.get("evaluation_balanced_accuracy") > 0.5
            and isinstance(item.get("evaluation_count"), int)
            and item.get("evaluation_count") > 0
        )
        return result
    return {"active": summary(active), "candidate": summary(candidate), "rollback_available": previous is not None}


def promote_candidate(checkpoint_dir: Path) -> dict[str, Any]:
    candidate_path = checkpoint_dir / "pacing-candidate.json"
    candidate = read_model(candidate_path)
    evaluation_accuracy = candidate.get("evaluation_accuracy") if candidate else None
    majority_baseline = candidate.get("majority_baseline_accuracy") if candidate else None
    balanced_accuracy = candidate.get("evaluation_balanced_accuracy") if candidate else None
    evaluation_count = candidate.get("evaluation_count") if candidate else None
    evaluation_is_valid = (
        isinstance(evaluation_accuracy, (int, float))
        and isinstance(majority_baseline, (int, float))
        and evaluation_accuracy >= majority_baseline
        and isinstance(balanced_accuracy, (int, float))
        and balanced_accuracy > 0.5
        and isinstance(evaluation_count, int)
        and evaluation_count > 0
    )
    if candidate is None or not candidate.get("promotable") or not evaluation_is_valid:
        raise TrainingError("There is no evaluated candidate that meets the majority and balanced-accuracy baselines")
    active_path = checkpoint_dir / "pacing-active.json"
    if active_path.exists():
        shutil.copy2(active_path, checkpoint_dir / "pacing-previous.json")
    shutil.copy2(candidate_path, active_path)
    (checkpoint_dir / "pacing-active.json.sha256").write_text(
        hashlib.sha256(active_path.read_bytes()).hexdigest(), encoding="ascii"
    )
    return model_status(checkpoint_dir)


def rollback_model(checkpoint_dir: Path) -> dict[str, Any]:
    previous_path = checkpoint_dir / "pacing-previous.json"
    if read_model(previous_path) is None:
        raise TrainingError("No previous promoted model is available")
    active_path = checkpoint_dir / "pacing-active.json"
    current_path = checkpoint_dir / "pacing-rollback.json"
    if active_path.exists():
        shutil.copy2(active_path, current_path)
    shutil.copy2(previous_path, active_path)
    if current_path.exists():
        shutil.copy2(current_path, previous_path)
    (checkpoint_dir / "pacing-active.json.sha256").write_text(
        hashlib.sha256(active_path.read_bytes()).hexdigest(), encoding="ascii"
    )
    return model_status(checkpoint_dir)


def predict_adjustment(checkpoint_dir: Path, duration_seconds: float, clip_count: int) -> float | None:
    model = read_model(checkpoint_dir / "pacing-active.json")
    if model is None:
        return None
    probability_too_fast = _predict(model, [math.log(max(duration_seconds, 1.0)), math.log(max(clip_count, 1))])
    return max(0.85, min(1.15, 0.9 + probability_too_fast * 0.2))
