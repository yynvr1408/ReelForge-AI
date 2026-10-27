"""Rule-based editing planner.

Converts a style profile and a list of source media into a validated
Timeline, with no LLM involved. This is the required offline fallback:
basic editing must work without a local or cloud language model. A
natural-language instruction layer (not yet implemented) will sit in
front of this and translate free text into the same parameters
(target duration, transition style, etc.) that this function accepts.
"""

from __future__ import annotations

import uuid

from app.timeline.schema import Clip, ExportSettings, Timeline, Track

DEFAULT_SHOT_DURATION_SECONDS = 3.0
MIN_SHOT_DURATION_SECONDS = 0.6


def generate_timeline(
    source_media: list[dict],
    style_profile: dict | None,
    target_duration_seconds: float | None = None,
    export_settings: ExportSettings | None = None,
) -> Timeline:
    """Build a sequential timeline from source media using profile pacing.

    `source_media` items must contain: id, duration_seconds (optional),
    has_audio (optional). Clips are trimmed to the profile's median shot
    duration (or a sane default) and laid end-to-end. If a
    `target_duration_seconds` is given, clips are cycled/truncated to
    approximately fill it; otherwise each source clip is used once.
    """
    if not source_media:
        raise ValueError("At least one source media item is required")

    shot_duration = DEFAULT_SHOT_DURATION_SECONDS
    if style_profile and "pacing" in style_profile:
        shot_duration = max(
            MIN_SHOT_DURATION_SECONDS,
            style_profile["pacing"].get("median_shot_duration_seconds", DEFAULT_SHOT_DURATION_SECONDS),
        )

    video_track = Track(id=f"track-{uuid.uuid4().hex[:8]}", kind="video")
    position = 0.0
    media_index = 0
    clip_count = 0
    max_clips = len(source_media) if target_duration_seconds is None else max(
        1, int(target_duration_seconds / shot_duration) + 1
    )

    while clip_count < max_clips:
        media = source_media[media_index % len(source_media)]
        available_duration = media.get("duration_seconds") or shot_duration
        clip_duration = min(shot_duration, available_duration)
        if clip_duration < MIN_SHOT_DURATION_SECONDS:
            media_index += 1
            clip_count += 1
            continue

        if target_duration_seconds is not None and position >= target_duration_seconds:
            break

        video_track.clips.append(
            Clip(
                id=f"clip-{uuid.uuid4().hex[:8]}",
                source_media_id=media["id"],
                source_in_seconds=0.0,
                source_out_seconds=clip_duration,
                timeline_position_seconds=round(position, 3),
                transition_in="cut" if clip_count == 0 else "crossfade",
                transition_duration_seconds=0.0 if clip_count == 0 else 0.3,
            )
        )
        position += clip_duration
        media_index += 1
        clip_count += 1

    return Timeline(
        tracks=[video_track],
        export_settings=export_settings or ExportSettings(),
    )
