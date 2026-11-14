from __future__ import annotations

from pathlib import Path
import pytest

from app.timeline.schema import (
    BackgroundMusic,
    Clip,
    ColorAdjustment,
    ExportSettings,
    TextOverlay,
    Timeline,
    Track,
    VoiceoverTrack,
)
from app.rendering.ffmpeg_renderer import build_filter_graph
from app.rendering.lut_manager import list_luts, validate_cube_file, seed_default_luts, import_lut


def _make_clip(**overrides) -> Clip:
    defaults = dict(
        id="clip-1",
        source_media_id="media-1",
        source_in_seconds=0.0,
        source_out_seconds=3.0,
        timeline_position_seconds=0.0,
    )
    defaults.update(overrides)
    return Clip(**defaults)


def test_lut_manager_seeds_and_lists(tmp_path: Path):
    luts_dir = tmp_path / "luts"
    luts = list_luts(luts_dir)
    assert len(luts) >= 4
    filenames = [l.filename for l in luts]
    assert "Teal_and_Orange.cube" in filenames
    assert "Warm_Golden.cube" in filenames

    # Test cube validation
    sample_cube = luts_dir / "Teal_and_Orange.cube"
    assert validate_cube_file(sample_cube) is True

    # Test importing a custom LUT
    custom_cube = tmp_path / "Custom_Vibe.cube"
    custom_cube.write_text('TITLE "Custom Vibe"\nLUT_3D_SIZE 2\n0 0 0\n1 1 1\n', encoding="utf-8")
    imported = import_lut(custom_cube, luts_dir)
    assert imported.filename == "Custom_Vibe.cube" or any(l.filename == "Custom_Vibe.cube" for l in list_luts(luts_dir))


def test_custom_lut_renders_in_filter_graph(tmp_path: Path):
    cube_path = tmp_path / "sample.cube"
    cube_path.write_text('TITLE "Sample"\nLUT_3D_SIZE 2\n0 0 0\n', encoding="utf-8")

    clip = _make_clip(
        color=ColorAdjustment(lut_path=str(cube_path), lut_name="Sample", exposure=0.1)
    )
    timeline = Timeline(
        tracks=[Track(id="t1", kind="video", clips=[clip])],
        export_settings=ExportSettings(width=1080, height=1920),
    )

    inputs, graph, video_out, audio_out = build_filter_graph(
        timeline,
        {"media-1": tmp_path / "clip.mp4"},
        {"media-1": True},
    )

    assert "lut3d=file=" in graph
    assert "sample.cube" in graph


def test_styled_and_animated_captions_in_filter_graph(tmp_path: Path):
    clip = _make_clip()
    overlay1 = TextOverlay(
        text="VIRAL HOOK HERE",
        start_seconds=0.0,
        end_seconds=1.5,
        position="center",
        style_preset="bold_yellow",
        animation_preset="pop_in",
        font_size=48,
    )
    overlay2 = TextOverlay(
        text="Smooth minimal thought",
        start_seconds=1.5,
        end_seconds=3.0,
        position="bottom",
        style_preset="minimal_white",
        animation_preset="slide_up",
    )

    timeline = Timeline(
        tracks=[
            Track(id="t1", kind="video", clips=[clip]),
            Track(id="t_text", kind="text", overlays=[overlay1, overlay2]),
        ]
    )

    caption_path1 = tmp_path / "cap1.txt"
    caption_path2 = tmp_path / "cap2.txt"
    caption_path1.write_text("VIRAL HOOK HERE", encoding="utf-8")
    caption_path2.write_text("Smooth minimal thought", encoding="utf-8")

    inputs, graph, video_out, audio_out = build_filter_graph(
        timeline,
        {"media-1": tmp_path / "clip.mp4"},
        {"media-1": True},
        [caption_path1, caption_path2],
    )

    assert "fontcolor=yellow" in graph
    assert "borderw=4" in graph
    assert "fontsize=48" in graph
    assert "alpha='if(lt(t-0.000" in graph
    assert "h-text_h-h*0.10+if(lt(t-1.500" in graph


def test_transitions_wipe_and_dissolve(tmp_path: Path):
    clip1 = _make_clip(id="c1", timeline_position_seconds=0.0, source_out_seconds=2.0)
    clip2 = _make_clip(
        id="c2",
        timeline_position_seconds=2.0,
        source_out_seconds=2.0,
        transition_in="wipeleft",
        transition_duration_seconds=0.5,
    )
    timeline = Timeline(tracks=[Track(id="t1", kind="video", clips=[clip1, clip2])])

    inputs, graph, video_out, audio_out = build_filter_graph(
        timeline,
        {"media-1": tmp_path / "clip1.mp4"},
        {"media-1": True},
    )

    assert "xfade=transition=wipeleft:duration=0.500" in graph
    assert "acrossfade=d=0.500" in graph


def test_multi_track_audio_mixing_with_ducking(tmp_path: Path):
    clip = _make_clip(source_out_seconds=5.0)
    bgm_file = tmp_path / "background.mp3"
    bgm_file.write_text("dummy", encoding="utf-8")
    vo_file = tmp_path / "voiceover.wav"
    vo_file.write_text("dummy", encoding="utf-8")

    timeline = Timeline(
        tracks=[Track(id="t1", kind="video", clips=[clip])],
        background_music=BackgroundMusic(
            media_path=str(bgm_file),
            volume_db=-10.0,
            ducking_enabled=True,
            ducking_attenuation_db=-14.0,
        ),
        voiceover=VoiceoverTrack(
            media_path=str(vo_file),
            volume_db=2.0,
            start_time_seconds=0.5,
        ),
    )

    inputs, graph, video_out, audio_out = build_filter_graph(
        timeline,
        {"media-1": tmp_path / "clip.mp4"},
        {"media-1": True},
    )

    # Check input arguments include voiceover and bgm
    assert str(vo_file) in inputs
    assert str(bgm_file) in inputs
    # Check sidechain compression for ducking
    assert "sidechaincompress=" in graph
    assert "aloop=loop=-1" in graph
    assert "adelay=500|500" in graph
    assert "[final_mix]" in graph
