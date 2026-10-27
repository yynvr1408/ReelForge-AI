"""Builds a reusable style profile from one or more analyzed reference videos.

A profile aggregates measured pacing statistics across references; it
never simply copies the settings of one arbitrary source video.
"""

from __future__ import annotations

from dataclasses import dataclass
from statistics import mean, median, pstdev


@dataclass(frozen=True)
class ReferenceSample:
    reference_id: str
    shot_durations_seconds: list[float]
    cut_count: int
    confidence: float


def build_style_profile(samples: list[ReferenceSample]) -> dict:
    """Aggregate shot-duration statistics from one or more references.

    Returns a JSON-serializable profile dict. Raises ValueError if no
    usable samples (empty shot lists) are provided.
    """
    usable = [s for s in samples if s.shot_durations_seconds]
    if not usable:
        raise ValueError("No usable reference samples with shot-duration data")

    all_durations = [d for s in usable for d in s.shot_durations_seconds]
    cut_counts = [s.cut_count for s in usable]
    confidences = [s.confidence for s in usable]

    profile = {
        "pacing": {
            "mean_shot_duration_seconds": round(mean(all_durations), 3),
            "median_shot_duration_seconds": round(median(all_durations), 3),
            "stdev_shot_duration_seconds": round(pstdev(all_durations), 3) if len(all_durations) > 1 else 0.0,
            "min_shot_duration_seconds": round(min(all_durations), 3),
            "max_shot_duration_seconds": round(max(all_durations), 3),
            "mean_cut_count": round(mean(cut_counts), 2),
        },
        "source_reference_count": len(usable),
        "sample_count": len(all_durations),
        "confidence": round(min(0.95, mean(confidences) * (0.6 + 0.08 * len(usable))), 3),
    }
    return profile
