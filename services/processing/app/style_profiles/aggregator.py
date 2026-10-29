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
    visual: dict | None = None
    audio: dict | None = None


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
    visual_samples = [sample.visual for sample in usable if sample.visual]
    if visual_samples:
        visual_fields = (
            "sharpness_laplacian_variance_median",
            "brightness_mean_0_255",
            "underexposed_sample_ratio",
            "overexposed_sample_ratio",
            "saturation_mean_0_255",
            "motion_magnitude_median",
            "camera_shake_candidate_ratio",
        )
        profile["visual"] = {
            key: round(mean(float(item[key]) for item in visual_samples if key in item), 3)
            for key in visual_fields
            if any(key in item for item in visual_samples)
        }
    audio_samples = [sample.audio for sample in usable if sample.audio]
    if audio_samples:
        tempo_values = [
            float(candidate["bpm"])
            for item in audio_samples
            for candidate in item.get("tempo_candidates_bpm", [])
            if float(candidate.get("confidence", 0.0)) >= 0.35
        ]
        profile["audio"] = {
            "mean_rms": round(mean(float(item.get("rms_mean", 0.0)) for item in audio_samples), 5),
            "transient_candidates_per_minute": round(
                mean(
                    len(item.get("transient_candidates_seconds", []))
                    / max(float(item.get("duration_seconds", 0.0)) / 60, 1 / 60)
                    for item in audio_samples
                ),
                2,
            ),
            "silence_ratio": round(
                mean(
                    sum(max(0.0, end - start) for start, end in item.get("silence_ranges_seconds", []))
                    / max(float(item.get("duration_seconds", 0.0)), 0.001)
                    for item in audio_samples
                ),
                3,
            ),
            "tempo_candidates_bpm": sorted({round(value, 1) for value in tempo_values}),
            "beat_candidates_per_minute": round(
                mean(
                    len(item.get("beat_candidates_seconds", []))
                    / max(float(item.get("duration_seconds", 0.0)) / 60, 1 / 60)
                    for item in audio_samples
                ),
                2,
            ),
            "speech_like_ratio": round(
                mean(
                    sum(max(0.0, end - start) for start, end in item.get("speech_like_ranges_seconds", []))
                    / max(float(item.get("duration_seconds", 0.0)), 0.001)
                    for item in audio_samples
                ),
                3,
            ),
            "tempo_note": "Beat and tempo values are review hypotheses, not reliable beat tracking; speech-like ranges are coarse spectral estimates, not speech recognition or dependable voice detection.",
        }
    return profile
