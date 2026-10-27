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
    for track in timeline.tracks:
        for clip in track.clips:
            if clip.source_media_id not in known_media_ids:
                issues.append(
                    ValidationIssue("error", f"Clip {clip.id} references unknown media {clip.source_media_id}")
                )
            if track.kind == "video":
                has_video_clip = True

    if not has_video_clip:
        issues.append(ValidationIssue("error", "Timeline has no video clips"))

    if timeline.total_duration_seconds <= 0:
        issues.append(ValidationIssue("error", "Timeline total duration must be greater than zero"))

    return issues


def is_valid(issues: list[ValidationIssue]) -> bool:
    return not any(issue.severity == "error" for issue in issues)
