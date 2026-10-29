"""Rule-based editing planner.

Converts a style profile and a list of source media into a validated
Timeline, with no LLM involved. This is the required offline fallback:
basic editing must work without a local or cloud language model. A
bounded offline instruction parser may translate explicit duration,
aspect-ratio, and pacing phrases into the same parameters this function
accepts. This planner never executes free-form text or model output.
"""

from __future__ import annotations

import uuid

from app.timeline.schema import Clip, ColorAdjustment, ExportSettings, Timeline, Track

DEFAULT_SHOT_DURATION_SECONDS = 3.0
MIN_SHOT_DURATION_SECONDS = 0.6


def generate_timeline(
    source_media: list[dict],
    style_profile: dict | None,
    target_duration_seconds: float | None = None,
    export_settings: ExportSettings | None = None,
    selection_preferences: dict[str, float] | None = None,
    color_preferences: dict[str, dict[str, float]] | None = None,
    audio_priority: str | None = None,
    avoid_shake_candidates: bool = False,
) -> Timeline:
    """Build a sequential timeline from source media using profile pacing.

    `source_media` items must contain: id, duration_seconds (optional),
    has_audio (optional), and optional ranked `moments`. Clips are trimmed
    to the profile's median shot duration (or a sane default) and laid
    end-to-end. Long source moments are divided into non-overlapping ranges.
    A target never causes source footage to be repeated; if unique usable
    footage is insufficient, the returned timeline is shorter than requested.
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
    candidates = []
    for media in source_media:
        moments = media.get("moments") or []
        if moments:
            candidates.extend({**moment, "media": media} for moment in moments)
        elif media.get("duration_seconds"):
            candidates.append({
                "media": media,
                "source_in_seconds": 0.0,
                "source_out_seconds": float(media["duration_seconds"]),
                "quality_score": None,
                "selection_reason": "Only full-source timing is available; no moment analysis was produced.",
            })
    if not candidates:
        raise ValueError("No usable video moments were found")
    # Split long scenes into distinct shot-sized source ranges so a long edit
    # can use more of each original without looping the same frames.
    distinct_candidates = []
    for candidate in candidates:
        start = float(candidate["source_in_seconds"])
        end = float(candidate["source_out_seconds"])
        cursor = start
        while end - cursor >= MIN_SHOT_DURATION_SECONDS:
            next_end = min(cursor + shot_duration, end)
            if 0 < end - next_end < MIN_SHOT_DURATION_SECONDS:
                next_end = end
            distinct_candidates.append(
                {
                    **candidate,
                    "source_in_seconds": cursor,
                    "source_out_seconds": next_end,
                }
            )
            cursor = next_end
    candidates = distinct_candidates
    if not candidates:
        raise ValueError("No source moment is long enough to create a clip")
    preferences = selection_preferences or {}
    feedback_color = color_preferences or {}
    user_adjustments = (style_profile or {}).get("user_adjustments") or {}
    profile_color = user_adjustments.get("color") or {}
    color_by_media: dict[str, dict[str, float]] = {}
    color_limits = {
        "exposure": (-1.0, 1.0),
        "contrast": (-0.9, 1.0),
        "saturation": (-1.0, 2.0),
        "temperature": (-1.0, 1.0),
    }
    for media in source_media:
        learned = feedback_color.get(media["id"], {})
        color_by_media[media["id"]] = {
            key: round(
                min(max(float(profile_color.get(key, 0.0)) + float(learned.get(key, 0.0)), lower), upper),
                4,
            )
            for key, (lower, upper) in color_limits.items()
        }
    audio_score_field = {
        "rhythmic_activity": "rhythmic_activity_score",
        "speech_like_activity": "speech_like_activity_score",
    }.get(audio_priority)
    candidates.sort(
        key=lambda item: (item.get("quality_score") or 0.0)
        + preferences.get(item["media"]["id"], 0.0)
        + (0.12 * float(item.get(audio_score_field, 0.0)) if audio_score_field else 0.0)
        - (0.2 * float(item.get("shake_candidate_ratio", 0.0)) if avoid_shake_candidates else 0.0),
        reverse=True,
    )
    clip_count = 0
    max_clips = len(candidates) if target_duration_seconds is None else max(
        1, int(target_duration_seconds / shot_duration) + 1
    )

    while clip_count < min(max_clips, len(candidates)):
        candidate = candidates[clip_count]
        media = candidate["media"]
        available_duration = candidate["source_out_seconds"] - candidate["source_in_seconds"]
        remaining = (
            target_duration_seconds - position
            if target_duration_seconds is not None
            else shot_duration
        )
        clip_duration = min(shot_duration, available_duration, remaining)
        if clip_duration < MIN_SHOT_DURATION_SECONDS:
            clip_count += 1
            continue

        if target_duration_seconds is not None and position >= target_duration_seconds:
            break

        source_in = candidate["source_in_seconds"] + max(0.0, (available_duration - clip_duration) / 2)
        preference_score = preferences.get(media["id"], 0.0)
        reason = candidate.get("selection_reason")
        if audio_score_field and candidate.get(audio_score_field, 0.0) > 0:
            label = "rhythmic audio activity" if audio_priority == "rhythmic_activity" else "speech-like audio activity"
            reason = f"{reason + '; ' if reason else ''}preferred for higher {label} (coarse heuristic, review before use)"
        if avoid_shake_candidates and candidate.get("shake_candidate_ratio", 0.0) > 0:
            reason = f"{reason + '; ' if reason else ''}rank adjusted for possible camera instability (coarse motion heuristic; review required)"
        elif avoid_shake_candidates and "shake_candidate_ratio" in candidate:
            reason = f"{reason + '; ' if reason else ''}no instability candidate in sparse motion samples (not a stability guarantee)"
        if preference_score:
            reason = f"{reason or 'Selected source moment'} User clip feedback adjusted its ranking."
        video_track.clips.append(
            Clip(
                id=f"clip-{uuid.uuid4().hex[:8]}",
                source_media_id=media["id"],
                source_in_seconds=round(source_in, 3),
                source_out_seconds=round(source_in + clip_duration, 3),
                timeline_position_seconds=round(position, 3),
                color=ColorAdjustment(**color_by_media.get(media["id"], {})),
                transition_in="cut",
                transition_duration_seconds=0.0,
                quality_score=candidate.get("quality_score"),
                selection_reason=reason,
            )
        )
        position += clip_duration
        clip_count += 1

    return Timeline(
        tracks=[video_track],
        export_settings=export_settings or ExportSettings(),
    )
