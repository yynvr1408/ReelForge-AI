"""Scene boundary and shot-duration analysis for reference videos.

Uses PySceneDetect's content-aware detector, which is cheap enough to
run on every imported reference without a neural model. Results are
measured properties (cut timestamps), not inferred creative intent —
callers must not claim this recovers the original editor's exact
operations.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from scenedetect import SceneManager, open_video
from scenedetect.detectors import ContentDetector

from app.analysis.cancellation import AnalysisCancelled, check_cancelled


class SceneDetectionError(RuntimeError):
    pass


@dataclass(frozen=True)
class SceneAnalysis:
    scene_boundaries_seconds: list[float]
    shot_durations_seconds: list[float]
    cut_count: int
    mean_shot_duration_seconds: float | None
    median_shot_duration_seconds: float | None
    confidence: float
    duration_seconds: float = field(default=0.0)


def analyze_scenes(
    video_path: Path,
    threshold: float = 27.0,
    downscale_factor: int | None = None,
    cancelled=None,
) -> SceneAnalysis:
    """Detect scene cuts using content-aware frame-difference analysis.

    `threshold` follows PySceneDetect's ContentDetector convention
    (lower = more sensitive). Frame sampling is left at the library's
    adaptive default unless `downscale_factor` is supplied, which
    trades accuracy for speed on large source files.
    """
    try:
        video = open_video(str(video_path))
    except Exception as exc:  # pyscenedetect raises its own error types
        raise SceneDetectionError(f"Failed to open video for analysis: {exc}") from exc

    scene_manager = SceneManager()
    scene_manager.add_detector(ContentDetector(threshold=threshold))
    if downscale_factor:
        scene_manager.downscale = downscale_factor

    def cancellation_callback(_frame, _frame_number):
        check_cancelled(cancelled)

    try:
        check_cancelled(cancelled)
        scene_manager.detect_scenes(video=video, callback=cancellation_callback)
        scene_list = scene_manager.get_scene_list()
    except AnalysisCancelled:
        raise
    except Exception as exc:
        raise SceneDetectionError(f"Scene detection failed: {exc}") from exc

    total_duration = video.duration.get_seconds() if video.duration else 0.0

    if not scene_list:
        return SceneAnalysis(
            scene_boundaries_seconds=[],
            shot_durations_seconds=[round(total_duration, 3)] if total_duration else [],
            cut_count=0,
            mean_shot_duration_seconds=total_duration or None,
            median_shot_duration_seconds=total_duration or None,
            confidence=0.3,
            duration_seconds=total_duration,
        )

    boundaries = [round(start.get_seconds(), 3) for start, _end in scene_list]
    durations = [round((end - start).get_seconds(), 3) for start, end in scene_list]
    sorted_durations = sorted(durations)
    mid = len(sorted_durations) // 2
    median = (
        sorted_durations[mid]
        if len(sorted_durations) % 2
        else (sorted_durations[mid - 1] + sorted_durations[mid]) / 2
    )

    # Confidence grows with cut count, caps out once we have enough
    # samples to trust the distribution; this is a heuristic, not a
    # statistically calibrated estimate.
    confidence = min(0.95, 0.4 + 0.05 * len(durations))

    return SceneAnalysis(
        scene_boundaries_seconds=boundaries,
        shot_durations_seconds=durations,
        cut_count=len(scene_list),
        mean_shot_duration_seconds=round(sum(durations) / len(durations), 3),
        median_shot_duration_seconds=round(median, 3),
        confidence=confidence,
        duration_seconds=total_duration,
    )
