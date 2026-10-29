"""Explainable reference similarity from measured, non-semantic signals."""

from __future__ import annotations

import math


def reference_features(analysis: dict | None) -> dict[str, float]:
    """Map available analysis into bounded features; omit unavailable signals."""
    if not isinstance(analysis, dict):
        return {}
    features: dict[str, float] = {}
    shot_mean = analysis.get("mean_shot_duration_seconds")
    duration = analysis.get("duration_seconds")
    cuts = analysis.get("cut_count")
    if isinstance(shot_mean, (int, float)) and math.isfinite(shot_mean):
        features["mean shot length"] = min(max(float(shot_mean) / 10, 0), 1)
    if isinstance(cuts, (int, float)) and isinstance(duration, (int, float)) and duration > 0:
        features["cut rate"] = min(max(float(cuts) * 60 / duration / 30, 0), 1)

    visual = analysis.get("visual") if isinstance(analysis.get("visual"), dict) else {}
    for key, label, scale in (
        ("brightness_mean_0_255", "brightness", 255),
        ("saturation_mean_0_255", "saturation", 255),
        ("motion_magnitude_median", "motion estimate", 10),
        ("camera_shake_candidate_ratio", "shake candidate ratio", 1),
        ("underexposed_sample_ratio", "underexposure ratio", 1),
        ("overexposed_sample_ratio", "overexposure ratio", 1),
    ):
        value = visual.get(key)
        if isinstance(value, (int, float)) and math.isfinite(value):
            features[label] = min(max(float(value) / scale, 0), 1)
    sharpness = visual.get("sharpness_laplacian_variance_median")
    if isinstance(sharpness, (int, float)) and math.isfinite(sharpness):
        features["sharpness"] = min(max(math.log1p(max(0, float(sharpness))) / math.log1p(5000), 0), 1)

    audio = analysis.get("audio") if isinstance(analysis.get("audio"), dict) else {}
    audio_duration = audio.get("duration_seconds")
    if isinstance(audio_duration, (int, float)) and audio_duration > 0:
        for key, label in (
            ("silence_ranges_seconds", "silence ratio"),
            ("speech_like_ranges_seconds", "speech-like ratio"),
        ):
            ranges = audio.get(key)
            if isinstance(ranges, list):
                seconds = sum(
                    max(0.0, float(item[1]) - float(item[0]))
                    for item in ranges
                    if isinstance(item, (list, tuple))
                    and len(item) == 2
                    and all(isinstance(point, (int, float)) and math.isfinite(point) for point in item)
                )
                features[label] = min(max(seconds / audio_duration, 0), 1)
        for key, label in (
            ("transient_candidates_seconds", "transient density"),
            ("beat_candidates_seconds", "rhythmic onset density"),
        ):
            events = audio.get(key)
            if isinstance(events, list):
                per_minute = len(events) * 60 / audio_duration
                features[label] = min(max(per_minute / 60, 0), 1)
    tempos = audio.get("tempo_candidates_bpm")
    if isinstance(tempos, list):
        values = [
            float(item["bpm"])
            for item in tempos
            if isinstance(item, dict)
            and isinstance(item.get("bpm"), (int, float))
            and math.isfinite(item["bpm"])
        ]
        if values:
            features["tempo hypothesis"] = min(max(sorted(values)[len(values) // 2] / 240, 0), 1)
    return features


def compare_reference_features(left: dict[str, float], right: dict[str, float]) -> dict | None:
    """Score overlap only, returning None when fewer than three signals match."""
    common = sorted(left.keys() & right.keys())
    if len(common) < 3:
        return None
    differences = {name: round(abs(left[name] - right[name]), 3) for name in common}
    score = round(100 * (1 - sum(differences.values()) / len(differences)), 1)
    return {"similarity_score": score, "shared_signals": common, "signal_differences": differences}
