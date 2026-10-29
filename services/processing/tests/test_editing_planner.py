from app.editing_planner.brief_parser import parse_editing_brief
from app.editing_planner.rule_based import generate_timeline


def test_brief_parser_returns_visible_bounded_constraints():
    parsed = parse_editing_brief("Make a 30 second vertical reel with fast cuts and keep original colors")
    assert parsed["target_duration_seconds"] == 30
    assert parsed["aspect_ratio"] == "vertical"
    assert parsed["shot_duration_seconds"] == 1.5
    assert parsed["preserve_original_colors"] is True
    assert len(parsed["recognized"]) == 4


def test_brief_parser_ignores_unsupported_duration():
    parsed = parse_editing_brief("Make a 2 hour cinematic reel")
    assert "target_duration_seconds" not in parsed
    assert parsed["shot_duration_seconds"] == 4.0


def test_brief_parser_surfaces_unsupported_requests_instead_of_silently_ignoring():
    parsed = parse_editing_brief("Cut on music beats and avoid shaky camera")
    assert parsed["not_yet_supported"] == [
        "exact music beat alignment",
    ]
    assert parsed["avoid_shake_candidates"] is True


def test_brief_parser_exposes_audio_preferences_without_claiming_sync_or_recognition():
    music = parse_editing_brief("prioritize music, cut on music beats")
    assert music["audio_priority"] == "rhythmic_activity"
    assert any("not beat sync" in item for item in music["recognized"])
    assert "exact music beat alignment" in music["not_yet_supported"]

    speech = parse_editing_brief("prioritize dialogue")
    assert speech["audio_priority"] == "speech_like_activity"
    assert any("not speech recognition" in item for item in speech["recognized"])

    stability = parse_editing_brief("avoid shaky camera; prefer stable footage")
    assert stability["avoid_shake_candidates"] is True
    assert all("shake" not in item for item in stability["not_yet_supported"])


def test_planner_selects_ranked_source_moments_and_preserves_source_ranges():
    timeline = generate_timeline(
        source_media=[
            {
                "id": "media-1",
                "duration_seconds": 8,
                "moments": [
                    {
                        "source_in_seconds": 0,
                        "source_out_seconds": 3,
                        "quality_score": 0.3,
                        "selection_reason": "soft frame",
                    },
                    {
                        "source_in_seconds": 4,
                        "source_out_seconds": 8,
                        "quality_score": 0.9,
                        "selection_reason": "sharper frame",
                    },
                ],
            }
        ],
        style_profile={"pacing": {"median_shot_duration_seconds": 2}},
    )
    first_clip = timeline.tracks[0].clips[0]
    assert first_clip.source_in_seconds >= 4
    assert first_clip.quality_score == 0.9
    assert first_clip.selection_reason == "sharper frame"


def test_audio_priority_ranks_measured_moment_activity_and_explains_choice():
    source = [{
        "id": "media-1",
        "duration_seconds": 6,
        "moments": [
            {"source_in_seconds": 0, "source_out_seconds": 3, "quality_score": 0.5,
             "rhythmic_activity_score": 0.0, "speech_like_activity_score": 0.0},
            {"source_in_seconds": 3, "source_out_seconds": 6, "quality_score": 0.5,
             "rhythmic_activity_score": 1.0, "speech_like_activity_score": 0.0},
        ],
    }]
    visual = generate_timeline(source, None, 2)
    music = generate_timeline(source, None, 2, audio_priority="rhythmic_activity")
    assert visual.tracks[0].clips[0].source_in_seconds < 3
    selected = music.tracks[0].clips[0]
    assert selected.source_in_seconds >= 3
    assert "rhythmic audio activity" in selected.selection_reason


def test_audio_priority_without_measurements_keeps_visual_ranking():
    source = [{
        "id": "media-1", "duration_seconds": 6,
        "moments": [
            {"source_in_seconds": 0, "source_out_seconds": 3, "quality_score": 0.4},
            {"source_in_seconds": 3, "source_out_seconds": 6, "quality_score": 0.8},
        ],
    }]
    timeline = generate_timeline(source, None, 2, audio_priority="speech_like_activity")
    assert timeline.tracks[0].clips[0].source_in_seconds >= 3


def test_shake_avoidance_penalizes_candidates_and_explains_heuristic():
    source = [{
        "id": "media-1", "duration_seconds": 6,
        "moments": [
            {"source_in_seconds": 0, "source_out_seconds": 3, "quality_score": 0.7,
             "shake_candidate_ratio": 1.0},
            {"source_in_seconds": 3, "source_out_seconds": 6, "quality_score": 0.6,
             "shake_candidate_ratio": 0.0},
        ],
    }]
    visual = generate_timeline(source, None, 2)
    filtered = generate_timeline(source, None, 2, avoid_shake_candidates=True)
    assert visual.tracks[0].clips[0].source_in_seconds < 3
    selected = filtered.tracks[0].clips[0]
    assert selected.source_in_seconds >= 3
    assert "not a stability guarantee" in selected.selection_reason


def test_clip_selection_preference_can_adjust_but_not_replace_analysis_rank():
    timeline = generate_timeline(
        source_media=[
            {
                "id": "media-1",
                "duration_seconds": 4,
                "moments": [{"source_in_seconds": 0, "source_out_seconds": 4, "quality_score": 0.8}],
            },
            {
                "id": "media-2",
                "duration_seconds": 4,
                "moments": [{"source_in_seconds": 0, "source_out_seconds": 4, "quality_score": 0.7}],
            },
        ],
        style_profile=None,
        target_duration_seconds=2,
        selection_preferences={"media-2": 0.2},
    )
    selected = timeline.tracks[0].clips[0]
    assert selected.source_media_id == "media-2"
    assert selected.quality_score == 0.7
    assert "User clip feedback" in selected.selection_reason


def test_clip_selection_preferences_are_bounded_and_explainable():
    timeline = generate_timeline(
        source_media=[
            {
                "id": "media-1",
                "duration_seconds": 4,
                "moments": [{"source_in_seconds": 0, "source_out_seconds": 4, "quality_score": 0.9}],
            },
            {
                "id": "media-2",
                "duration_seconds": 4,
                "moments": [{"source_in_seconds": 0, "source_out_seconds": 4, "quality_score": 0.1}],
            },
        ],
        style_profile=None,
        target_duration_seconds=2,
        selection_preferences={"media-2": 0.25},
    )
    assert timeline.tracks[0].clips[0].source_media_id == "media-1"


def test_color_preference_is_applied_only_when_explicitly_supplied():
    source = [{"id": "media-1", "duration_seconds": 4}]
    default_timeline = generate_timeline(source_media=source, style_profile=None)
    preferred_timeline = generate_timeline(
        source_media=source,
        style_profile=None,
        color_preferences={"media-1": {"exposure": 0.2, "saturation": -0.1}},
    )
    assert default_timeline.tracks[0].clips[0].color.exposure == 0
    assert preferred_timeline.tracks[0].clips[0].color.exposure == 0.2
    assert preferred_timeline.tracks[0].clips[0].color.saturation == -0.1


def test_planner_splits_long_source_into_distinct_ranges_without_repeating():
    timeline = generate_timeline(
        source_media=[{"id": "media-1", "duration_seconds": 8}],
        style_profile={"pacing": {"median_shot_duration_seconds": 3}},
        target_duration_seconds=8,
    )
    clips = timeline.tracks[0].clips
    ranges = sorted((clip.source_in_seconds, clip.source_out_seconds) for clip in clips)
    assert len(clips) == 3
    assert ranges == [(0.0, 3.0), (3.0, 6.0), (6.0, 8.0)]
    assert sum(end - start for start, end in ranges) == 8


def test_planner_reports_underfilled_request_without_repeating_source():
    timeline = generate_timeline(
        source_media=[{"id": "media-1", "duration_seconds": 4}],
        style_profile={"pacing": {"median_shot_duration_seconds": 3}},
        target_duration_seconds=8,
    )
    ranges = [(clip.source_in_seconds, clip.source_out_seconds) for clip in timeline.tracks[0].clips]
    assert ranges == [(0.0, 3.0), (3.0, 4.0)]


def test_saved_style_profile_grade_is_applied_to_generated_clips():
    timeline = generate_timeline(
        source_media=[{"id": "media-1", "duration_seconds": 4}],
        style_profile={
            "pacing": {"median_shot_duration_seconds": 2},
            "user_adjustments": {"color": {"exposure": 0.2, "saturation": 0.3}},
        },
    )
    assert timeline.tracks[0].clips[0].color.exposure == 0.2
    assert timeline.tracks[0].clips[0].color.saturation == 0.3
    assert timeline.tracks[0].clips[0].color.temperature == 0


def test_style_grade_combines_with_bounded_media_feedback():
    timeline = generate_timeline(
        source_media=[{"id": "media-1", "duration_seconds": 4}],
        style_profile={"user_adjustments": {"color": {"exposure": 0.8}}},
        color_preferences={"media-1": {"exposure": 0.5}},
    )
    assert timeline.tracks[0].clips[0].color.exposure == 1.0
