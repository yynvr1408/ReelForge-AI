"""Semantic validation beyond pydantic's structural checks.

Pydantic enforces field-level constraints; this module checks
cross-references that require knowledge of available media (clip
source IDs must refer to real, probed media assets).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.timeline.schema import Timeline


@dataclass(frozen=True)
class ValidationIssue:
    severity: Literal["error", "warning"]
    message: str


def validate_timeline(timeline: Timeline, known_media_ids: set[str]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []

    if not timeline.tracks:
        issues.append(ValidationIssue("error", "Timeline has no tracks"))

    has_video_clip = False
    timeline_duration = timeline.total_duration_seconds
    for track in timeline.tracks:
        for overlay in track.overlays:
            if overlay.end_seconds > timeline_duration:
                issues.append(
                    ValidationIssue(
                        "error",
                        f"Text overlay ending at {overlay.end_seconds:.3f}s exceeds timeline duration {timeline_duration:.3f}s",
                    )
                )
        ordered_video_clips = sorted(track.clips, key=lambda clip: clip.timeline_position_seconds) if track.kind == "video" else []
        for clip in track.clips:
            if clip.source_media_id not in known_media_ids:
                issues.append(
                    ValidationIssue("error", f"Clip {clip.id} references unknown media {clip.source_media_id}")
                )
            if track.kind == "video":
                has_video_clip = True
                if clip.transition_in in {"fade", "crossfade"}:
                    if clip.transition_duration_seconds <= 0:
                        issues.append(ValidationIssue("error", f"Clip {clip.id} transition duration must be greater than zero"))
                    if clip.transition_duration_seconds > clip.duration_seconds:
                        issues.append(ValidationIssue("error", f"Clip {clip.id} transition exceeds its duration"))
                    if clip.transition_in == "crossfade":
                        ordered_index = next(
                            (index for index, item in enumerate(ordered_video_clips) if item is clip),
                            -1,
                        )
                        if ordered_index == 0:
                            issues.append(ValidationIssue("error", f"First video clip {clip.id} cannot crossfade from a previous clip"))
                        elif clip.transition_duration_seconds > ordered_video_clips[ordered_index - 1].duration_seconds:
                            issues.append(ValidationIssue("error", f"Clip {clip.id} crossfade exceeds the previous clip duration"))

    if not has_video_clip:
        issues.append(ValidationIssue("error", "Timeline has no video clips"))

    if timeline.total_duration_seconds <= 0:
        issues.append(ValidationIssue("error", "Timeline total duration must be greater than zero"))

    return issues


def is_valid(issues: list[ValidationIssue]) -> bool:
    return not any(issue.severity == "error" for issue in issues)
