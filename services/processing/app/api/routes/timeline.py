from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.orm import Session

from app.database.models import FeedbackEntry, MediaAsset, StyleProfile
from app.analysis.beat_tracking import calculate_music_sync_score, generate_beat_grid, snap_cuts_to_beats
from app.analysis.moment_selection import rank_moments
from app.analysis.transcription import transcribe_video_dialogue
from app.core.config import Settings, get_settings
from app.database.session import get_session
from app.editing_planner.rule_based import generate_timeline
from app.editing_planner.brief_parser import parse_editing_brief
from app.editing_planner.llm_adapters import get_adapter, list_available_adapters
from app.security.auth import require_service_token
from app.timeline.schema import ColorAdjustment, ExportSettings, Timeline
from app.timeline.validator import is_valid, validate_timeline
from app.training.pacing_model import predict_adjustment

router = APIRouter(prefix="/timeline", tags=["timeline"], dependencies=[Depends(require_service_token)])


class TimelineGenerateRequest(BaseModel):
    media_ids: list[str]
    project_id: str | None = None
    style_profile_id: str | None = None
    target_duration_seconds: float | None = Field(default=None, gt=0, le=900)
    export_settings: ExportSettings | None = None
    editing_brief: str | None = Field(default=None, max_length=1000)
    llm_adapter: str | None = None


class TimelineAlternativesRequest(BaseModel):
    editing_brief: str = Field(..., max_length=1000)
    llm_adapter: str | None = None
    count: int = Field(default=3, ge=1, le=5)


class TimelineSnapBeatsRequest(BaseModel):
    timeline: dict
    tempo_bpm: float = Field(default=120.0, ge=40.0, le=240.0)
    max_drift_seconds: float = Field(default=0.25, ge=0.05, le=1.0)


class TimelineAutoCaptionsRequest(BaseModel):
    project_id: str
    timeline: dict | None = None


class TimelineValidateRequest(BaseModel):
    timeline: dict
    known_media_ids: list[str]


class ValidationResponse(BaseModel):
    is_valid: bool
    issues: list[dict]


@router.post("/generate")
def generate(payload: TimelineGenerateRequest, session: Session = Depends(get_session)) -> dict:
    assets = session.query(MediaAsset).filter(MediaAsset.id.in_(payload.media_ids)).all()
    found_ids = {a.id for a in assets}
    missing = set(payload.media_ids) - found_ids
    if missing:
        raise HTTPException(status_code=404, detail=f"Media assets not found: {sorted(missing)}")
    if any(asset.kind != "video" for asset in assets):
        raise HTTPException(status_code=422, detail="Timeline generation currently accepts video assets only")

    adapter = get_adapter(payload.llm_adapter)
    interpretation = adapter.parse_brief(payload.editing_brief)

    profile_json = None
    if payload.style_profile_id:
        profile = session.get(StyleProfile, payload.style_profile_id)
        if profile is None:
            raise HTTPException(status_code=404, detail="Style profile not found")
        profile_json = profile.profile_json

    feedback_query = session.query(FeedbackEntry).filter(FeedbackEntry.subject == "timeline_pacing")
    if payload.style_profile_id:
        feedback_query = feedback_query.filter(FeedbackEntry.style_profile_id == payload.style_profile_id)
    elif payload.project_id:
        feedback_query = feedback_query.filter(FeedbackEntry.project_id == payload.project_id)
    else:
        feedback_query = feedback_query.filter(FeedbackEntry.project_id.is_(None))
    feedback_rows = feedback_query.limit(2000).all()
    too_fast_count = sum(entry.action == "too_fast" for entry in feedback_rows)
    too_slow_count = sum(entry.action == "too_slow" for entry in feedback_rows)
    feedback_total = too_fast_count + too_slow_count
    pacing_adjustment = (
        max(0.7, min(1.35, 1.0 + 0.35 * (too_fast_count - too_slow_count) / (feedback_total + 2)))
        if feedback_total
        else 1.0
    )
    selection_query = session.query(FeedbackEntry).filter(FeedbackEntry.subject == "clip_selection")
    if payload.style_profile_id:
        selection_query = selection_query.filter(FeedbackEntry.style_profile_id == payload.style_profile_id)
    elif payload.project_id:
        selection_query = selection_query.filter(FeedbackEntry.project_id == payload.project_id)
    else:
        selection_query = selection_query.filter(FeedbackEntry.project_id.is_(None))
    selection_votes: dict[str, list[int]] = {}
    selection_feedback_count = 0
    requested_media = set(payload.media_ids)
    for entry in selection_query.order_by(FeedbackEntry.created_at.desc()).limit(2000).all():
        media_id = entry.payload_json.get("media_id")
        if media_id not in requested_media or entry.action not in {"accepted", "rejected"}:
            continue
        selection_feedback_count += 1
        counts = selection_votes.setdefault(media_id, [0, 0])
        counts[0 if entry.action == "accepted" else 1] += 1
    # Each source receives a smoothed, bounded preference offset so technical
    # quality remains meaningful and a few votes cannot dominate analysis.
    selection_preferences = {
        media_id: 0.25 * (accepted - rejected) / (accepted + rejected + 2)
        for media_id, (accepted, rejected) in selection_votes.items()
    }
    color_query = session.query(FeedbackEntry).filter(
        FeedbackEntry.subject == "color", FeedbackEntry.action == "adjusted"
    )
    if payload.style_profile_id:
        color_query = color_query.filter(FeedbackEntry.style_profile_id == payload.style_profile_id)
    elif payload.project_id:
        color_query = color_query.filter(FeedbackEntry.project_id == payload.project_id)
    else:
        color_query = color_query.filter(FeedbackEntry.project_id.is_(None))
    color_sums: dict[str, dict[str, float]] = {}
    color_counts: dict[str, int] = {}
    for entry in color_query.order_by(FeedbackEntry.created_at.desc()).limit(2000).all():
        media_id = entry.payload_json.get("media_id")
        if media_id not in requested_media:
            continue
        try:
            color = ColorAdjustment.model_validate(entry.payload_json.get("color", {}))
        except Exception:
            continue
        totals = color_sums.setdefault(media_id, {"exposure": 0.0, "contrast": 0.0, "saturation": 0.0, "temperature": 0.0})
        for key in totals:
            totals[key] += getattr(color, key)
        color_counts[media_id] = color_counts.get(media_id, 0) + 1
    # A neutral prior prevents one accidental extreme slider value from being
    # copied blindly into a later plan. Users can save more grades to refine it.
    color_preferences = {
        media_id: {key: round(total / (color_counts[media_id] + 1), 4) for key, total in totals.items()}
        for media_id, totals in color_sums.items()
    }
    trained_adjustment = predict_adjustment(
        get_settings().checkpoints_dir,
        payload.target_duration_seconds or interpretation.get("target_duration_seconds") or 30.0,
        len(assets),
    )
    if trained_adjustment is not None:
        pacing_adjustment = trained_adjustment

    source_media = []
    for asset in assets:
        moments = []
        if asset.kind == "video" and Path(asset.storage_path).is_file():
            try:
                moments = rank_moments(
                    Path(asset.storage_path),
                    ffmpeg_path=get_settings().ffmpeg_path if interpretation.get("audio_priority") else None,
                    analyze_motion=interpretation.get("avoid_shake_candidates", False),
                )
            except Exception:
                # A media analysis failure should not prevent a valid basic edit.
                moments = []
        source_media.append({
            "id": asset.id,
            "duration_seconds": asset.duration_seconds,
            "has_audio": asset.has_audio,
            "moments": moments,
        })

    try:
        profile_for_plan = dict(profile_json or {})
        preserve_original_colors = interpretation.get("preserve_original_colors", False)
        if preserve_original_colors:
            # The user's explicit brief overrides both saved profile grades and
            # learned color preferences for this suggestion only.
            adjustments = dict(profile_for_plan.get("user_adjustments") or {})
            adjustments.pop("color", None)
            profile_for_plan["user_adjustments"] = adjustments
        if "shot_duration_seconds" in interpretation:
            profile_for_plan["pacing"] = {
                **profile_for_plan.get("pacing", {}),
                "median_shot_duration_seconds": interpretation["shot_duration_seconds"],
            }
        elif feedback_total:
            current_duration = profile_for_plan.get("pacing", {}).get("median_shot_duration_seconds", 3.0)
            profile_for_plan["pacing"] = {
                **profile_for_plan.get("pacing", {}),
                "median_shot_duration_seconds": current_duration * pacing_adjustment,
            }
        export_settings = payload.export_settings or ExportSettings()
        # An explicit export preset is authoritative; brief aspect words are
        # used only when no preset was selected in the editor.
        aspect = interpretation.get("aspect_ratio") if payload.export_settings is None else None
        if aspect == "vertical":
            export_settings = export_settings.model_copy(update={"width": 1080, "height": 1920})
        elif aspect == "horizontal":
            export_settings = export_settings.model_copy(update={"width": 1920, "height": 1080})
        elif aspect == "square":
            export_settings = export_settings.model_copy(update={"width": 1080, "height": 1080})
        timeline = generate_timeline(
            source_media=source_media,
            style_profile=profile_for_plan,
            target_duration_seconds=payload.target_duration_seconds or interpretation.get("target_duration_seconds"),
            export_settings=export_settings,
            selection_preferences=selection_preferences,
            color_preferences={} if preserve_original_colors else color_preferences,
            audio_priority=interpretation.get("audio_priority"),
            avoid_shake_candidates=interpretation.get("avoid_shake_candidates", False),
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    issues = validate_timeline(timeline, found_ids)
    requested_duration = payload.target_duration_seconds or interpretation.get("target_duration_seconds")
    actual_duration = sum(
        clip.source_out_seconds - clip.source_in_seconds
        for track in timeline.tracks
        for clip in track.clips
    )
    duration_shortfall = (
        max(0.0, requested_duration - actual_duration)
        if requested_duration is not None
        else 0.0
    )
    return {
        "timeline": timeline.model_dump(),
        "validation": {"is_valid": is_valid(issues), "issues": [i.__dict__ for i in issues]},
        "interpretation": interpretation,
        "planning": {
            "requested_duration_seconds": requested_duration,
            "actual_duration_seconds": round(actual_duration, 3),
            "duration_fulfilled": requested_duration is None or duration_shortfall <= 0.05,
            "duration_shortfall_seconds": round(duration_shortfall, 3),
            "repeated_source_ranges": False,
        },
        "preference_adjustment": {
            "feedback_count": feedback_total,
            "shot_duration_factor": round(pacing_adjustment, 3),
            "trained_model_used": trained_adjustment is not None,
            "clip_selection_feedback_count": selection_feedback_count,
            "color_feedback_count": 0 if preserve_original_colors else sum(color_counts.values()),
            "color_feedback_overridden_by_brief": preserve_original_colors,
        },
    }


@router.get("/adapters")
def get_adapters() -> list[dict]:
    return list_available_adapters()


@router.post("/alternatives")
def get_alternatives(payload: TimelineAlternativesRequest) -> list[dict]:
    adapter = get_adapter(payload.llm_adapter)
    return adapter.generate_alternatives(payload.editing_brief, count=payload.count)


@router.post("/validate", response_model=ValidationResponse)
def validate(payload: TimelineValidateRequest) -> dict:
    try:
        timeline = Timeline.model_validate(payload.timeline)
    except ValidationError as exc:
        return {"is_valid": False, "issues": [{"severity": "error", "message": str(exc)}]}

    issues = validate_timeline(timeline, set(payload.known_media_ids))
    return {"is_valid": is_valid(issues), "issues": [i.__dict__ for i in issues]}


@router.post("/snap-to-beats")
def snap_timeline_to_beats(payload: TimelineSnapBeatsRequest) -> dict:
    try:
        timeline = Timeline.model_validate(payload.timeline)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid timeline: {exc}") from exc

    video_track = next((t for t in timeline.tracks if t.kind == "video" and t.clips), None)
    if video_track is None or len(video_track.clips) < 2:
        return {
            "timeline": timeline.model_dump(),
            "sync_report": {
                "sync_score": 1.0,
                "aligned_cut_count": len(video_track.clips) if video_track else 0,
                "total_cut_count": len(video_track.clips) if video_track else 0,
                "mean_drift_seconds": 0.0,
            },
        }

    ordered_clips = sorted(video_track.clips, key=lambda c: c.timeline_position_seconds)
    total_duration = sum(c.duration_seconds for c in ordered_clips)

    # Extract cut timestamps (end point of each clip before the last)
    cut_timestamps: list[float] = []
    curr = 0.0
    for clip in ordered_clips[:-1]:
        curr += clip.duration_seconds
        cut_timestamps.append(round(curr, 3))

    beat_grid = generate_beat_grid(payload.tempo_bpm, total_duration)
    snapped_cuts = snap_cuts_to_beats(cut_timestamps, beat_grid, max_drift_seconds=payload.max_drift_seconds)
    sync_report = calculate_music_sync_score(snapped_cuts, beat_grid)

    # Reconstruct clip boundaries monotonically
    prev_pos = 0.0
    for i, clip in enumerate(ordered_clips[:-1]):
        target_end = snapped_cuts[i]
        new_dur = max(0.2, target_end - prev_pos)
        clip.timeline_position_seconds = prev_pos
        clip.source_out_seconds = clip.source_in_seconds + new_dur * clip.playback_speed
        prev_pos = target_end

    # Last clip
    last_clip = ordered_clips[-1]
    last_clip.timeline_position_seconds = prev_pos

    return {
        "timeline": timeline.model_dump(),
        "sync_report": sync_report,
    }


@router.post("/auto-captions")
def auto_generate_captions(
    payload: TimelineAutoCaptionsRequest,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> dict:
    assets = session.query(MediaAsset).filter(MediaAsset.project_id == payload.project_id).all()
    video_assets = [a for a in assets if a.kind == "video" and Path(a.storage_path).is_file()]
    if not video_assets:
        return {"captions": [], "source": "none", "count": 0}

    all_captions: list[dict] = []
    best_source = "speech_activity_heuristic"

    # If timeline is provided, map dialogue from source footage onto timeline clip placements
    timeline_obj = None
    if payload.timeline:
        try:
            timeline_obj = Timeline.model_validate(payload.timeline)
        except Exception:
            pass

    if timeline_obj:
        video_track = next((t for t in timeline_obj.tracks if t.kind == "video"), None)
        clips = sorted(video_track.clips, key=lambda c: c.timeline_position_seconds) if video_track else []
        asset_map = {a.id: a for a in video_assets}

        # Transcribe each unique source asset used in timeline
        cached_transcriptions = {}
        for clip in clips:
            asset = asset_map.get(clip.source_media_id)
            if not asset:
                continue
            if asset.id not in cached_transcriptions:
                res = transcribe_video_dialogue(
                    Path(asset.storage_path),
                    settings.ffmpeg_path,
                    settings.ffprobe_path,
                )
                cached_transcriptions[asset.id] = res
                if res.get("source") != "speech_activity_heuristic":
                    best_source = res.get("source", best_source)

            trans = cached_transcriptions[asset.id]
            for cap in trans.get("captions", []):
                c_start = cap["start_seconds"]
                c_end = cap["end_seconds"]
                overlap_start = max(c_start, clip.source_in_seconds)
                overlap_end = min(c_end, clip.source_out_seconds)
                if overlap_end > overlap_start + 0.3:
                    tl_start = clip.timeline_position_seconds + (overlap_start - clip.source_in_seconds) / clip.playback_speed
                    tl_end = clip.timeline_position_seconds + (overlap_end - clip.source_in_seconds) / clip.playback_speed
                    all_captions.append({
                        "text": cap["text"],
                        "start_seconds": round(tl_start, 2),
                        "end_seconds": round(tl_end, 2),
                        "position": cap.get("position", "bottom"),
                    })
    else:
        first_asset = video_assets[0]
        res = transcribe_video_dialogue(
            Path(first_asset.storage_path),
            settings.ffmpeg_path,
            settings.ffprobe_path,
        )
        best_source = res.get("source", best_source)
        all_captions = res.get("captions", [])

    return {
        "captions": all_captions,
        "source": best_source,
        "count": len(all_captions),
    }
