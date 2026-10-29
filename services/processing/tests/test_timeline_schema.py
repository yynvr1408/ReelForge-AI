from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.timeline.schema import Clip, ColorAdjustment, ExportSettings, TextOverlay, Timeline, Track
from app.timeline.validator import is_valid, validate_timeline
from app.rendering.ffmpeg_renderer import build_filter_graph, render_timeline


def _clip(**overrides) -> Clip:
    defaults = dict(
        id="clip-1",
        source_media_id="media-1",
        source_in_seconds=0.0,
        source_out_seconds=2.0,
        timeline_position_seconds=0.0,
    )
    defaults.update(overrides)
    return Clip(**defaults)


def test_clip_rejects_out_before_in():
    with pytest.raises(ValidationError):
        _clip(source_in_seconds=5.0, source_out_seconds=1.0)


def test_clip_stabilization_is_off_by_default():
    assert _clip().stabilize is False


def test_export_settings_bound_dimensions_and_frame_rate():
    with pytest.raises(ValidationError):
        ExportSettings(width=8000)
    with pytest.raises(ValidationError):
        ExportSettings(frame_rate=121)
    assert ExportSettings(width=1920, height=1080).width == 1920


def test_color_adjustments_are_bounded_and_temperature_renders(
    tmp_path, ffmpeg_path, synthetic_clip_factory
):
    with pytest.raises(ValidationError):
        ColorAdjustment(exposure=3.0)
    clip = _clip(
        color=ColorAdjustment(exposure=0.2, contrast=0.1, saturation=0.15, temperature=0.5),
        reframe_x=0.25,
        reframe_y=0.75,
        stabilize=True,
    )
    timeline = Timeline(
        tracks=[
            Track(id="t1", kind="video", clips=[clip]),
            Track(
                id="captions",
                kind="text",
                overlays=[
                    TextOverlay(
                        text="Don't stop: cut, move; [100%]",
                        start_seconds=0.1,
                        end_seconds=0.9,
                        position="bottom",
                    )
                ],
            ),
        ],
        export_settings=ExportSettings(width=240, height=320),
    )
    _inputs, graph, _video, _audio = build_filter_graph(
        timeline,
        {"media-1": tmp_path / "source.mp4"},
        {"media-1": False},
        [tmp_path / "caption-0.txt"],
    )
    assert "brightness=0.200" in graph
    assert "contrast=1.100" in graph
    assert "saturation=1.150" in graph
    assert "colorbalance=rs=0.090:bs=-0.090" in graph
    assert "x=(iw-ow)*0.2500:y=(ih-oh)*0.7500" in graph
    assert "deshake=rx=16:ry=16:edge=blank" in graph
    assert "textfile=" in graph
    assert "y=h-text_h-h*0.10" in graph
    assert "enable='between(t\\,0.100\\,0.900)'" in graph

    source = synthetic_clip_factory(duration_seconds=1.0, name="color-source", with_cuts=False)
    output = tmp_path / "color-adjusted.mp4"
    render_timeline(
        ffmpeg_path,
        timeline,
        {"media-1": source},
        output,
        media_has_audio={"media-1": True},
    )
    assert output.is_file() and output.stat().st_size > 0
    import cv2
    import numpy as np
    import subprocess

    preview = tmp_path / "caption-frame.png"
    subprocess.run(
        [str(ffmpeg_path), "-y", "-ss", "0.5", "-i", str(output), "-frames:v", "1", "-update", "1", str(preview)],
        check=True,
        capture_output=True,
    )
    frame = cv2.imread(str(preview))
    assert frame is not None and int(np.sum(np.all(frame > 230, axis=2))) > 0


def test_caption_timing_cannot_extend_past_video():
    with pytest.raises(ValidationError):
        TextOverlay(text="   ", start_seconds=0, end_seconds=1)
    timeline = Timeline(
        tracks=[
            Track(id="video", kind="video", clips=[_clip()]),
            Track(
                id="text",
                kind="text",
                overlays=[TextOverlay(text="Caption", start_seconds=1.5, end_seconds=3.0)],
            ),
        ]
    )
    issues = validate_timeline(timeline, known_media_ids={"media-1"})
    assert not is_valid(issues)
    assert any("exceeds timeline duration" in issue.message for issue in issues)


def test_timeline_total_duration_sums_clips():
    track = Track(id="t1", kind="video", clips=[_clip(), _clip(id="clip-2", timeline_position_seconds=2.0)])
    timeline = Timeline(tracks=[track], export_settings=ExportSettings())
    assert timeline.total_duration_seconds == pytest.approx(4.0)


def test_validate_timeline_flags_unknown_media():
    track = Track(id="t1", kind="video", clips=[_clip(source_media_id="unknown-media")])
    timeline = Timeline(tracks=[track])
    issues = validate_timeline(timeline, known_media_ids={"media-1"})
    assert not is_valid(issues)
    assert any("unknown" in issue.message for issue in issues)


def test_validate_timeline_accepts_known_media():
    track = Track(id="t1", kind="video", clips=[_clip()])
    timeline = Timeline(tracks=[track])
    issues = validate_timeline(timeline, known_media_ids={"media-1"})
    assert is_valid(issues)


def test_crossfade_transition_graph_and_duration_validation(tmp_path):
    first = _clip(source_out_seconds=2.0)
    second = _clip(
        id="clip-2",
        source_media_id="media-2",
        source_out_seconds=2.0,
        timeline_position_seconds=1.5,
        transition_in="crossfade",
        transition_duration_seconds=0.5,
    )
    timeline = Timeline(tracks=[Track(id="video", kind="video", clips=[first, second])])
    assert timeline.total_duration_seconds == pytest.approx(3.5)
    assert is_valid(validate_timeline(timeline, {"media-1", "media-2"}))
    _inputs, graph, _video, _audio = build_filter_graph(
        timeline,
        {"media-1": tmp_path / "first.mp4", "media-2": tmp_path / "second.mp4"},
        {"media-1": True, "media-2": True},
    )
    assert "xfade=transition=fade:duration=0.500:offset=1.500" in graph
    assert "acrossfade=d=0.500:c1=tri:c2=tri" in graph


def test_first_clip_cannot_crossfade_and_fade_requires_duration():
    first_crossfade = _clip(transition_in="crossfade", transition_duration_seconds=0.5)
    issues = validate_timeline(
        Timeline(tracks=[Track(id="video", kind="video", clips=[first_crossfade])]),
        {"media-1"},
    )
    assert any("cannot crossfade" in issue.message for issue in issues)

    second_fade = _clip(
        id="clip-2",
        timeline_position_seconds=1.5,
        transition_in="fade",
        transition_duration_seconds=0.0,
    )
    issues = validate_timeline(
        Timeline(tracks=[Track(id="video", kind="video", clips=[_clip(), second_fade])]),
        {"media-1"},
    )
    assert any("transition duration must be greater than zero" in issue.message for issue in issues)


def test_crossfade_renders_original_clips_with_expected_shorter_duration(
    tmp_path, ffmpeg_path, ffprobe_path, synthetic_clip_factory
):
    from app.rendering.output_validator import validate_render_output

    first_path = synthetic_clip_factory(duration_seconds=2.0, name="crossfade-first", color="red", with_cuts=False)
    second_path = synthetic_clip_factory(duration_seconds=2.0, name="crossfade-second", color="blue", with_cuts=False)
    clips = [
        _clip(source_out_seconds=2.0),
        _clip(
            id="clip-2",
            source_media_id="media-2",
            source_out_seconds=2.0,
            timeline_position_seconds=1.5,
            transition_in="crossfade",
            transition_duration_seconds=0.5,
        ),
    ]
    timeline = Timeline(
        tracks=[Track(id="video", kind="video", clips=clips)],
        export_settings=ExportSettings(width=240, height=320),
    )
    output = tmp_path / "crossfade.mp4"
    render_timeline(
        ffmpeg_path,
        timeline,
        {"media-1": first_path, "media-2": second_path},
        output,
        media_has_audio={"media-1": True, "media-2": True},
    )
    validation = validate_render_output(ffprobe_path, output, timeline.total_duration_seconds, timeline.export_settings)
    assert validation.is_valid, validation.issues


def test_renderer_supports_silent_video_and_playback_speed(tmp_path):
    clip = _clip(source_out_seconds=4.0, playback_speed=2.0)
    timeline = Timeline(tracks=[Track(id="t1", kind="video", clips=[clip])])
    _inputs, graph, _video, _audio = build_filter_graph(
        timeline,
        {"media-1": tmp_path / "silent.mp4"},
        {"media-1": False},
    )
    assert "setpts=(PTS-STARTPTS)/2.000000" in graph
    assert "anullsrc" in graph
    assert "duration=2.000" in graph


def test_renderer_chains_atempo_for_high_speed(tmp_path):
    clip = _clip(source_out_seconds=4.0, playback_speed=4.0)
    timeline = Timeline(tracks=[Track(id="t1", kind="video", clips=[clip])])
    _inputs, graph, _video, _audio = build_filter_graph(
        timeline,
        {"media-1": tmp_path / "with-audio.mp4"},
        {"media-1": True},
    )
    assert "atempo=2.000000,atempo=2.000000" in graph
