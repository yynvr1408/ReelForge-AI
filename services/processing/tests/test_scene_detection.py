from __future__ import annotations

from app.analysis.scene_detection import analyze_scenes


def test_analyze_scenes_detects_cuts(synthetic_clip_factory):
    clip = synthetic_clip_factory(duration_seconds=4.0, name="cuts_clip", with_cuts=True)
    analysis = analyze_scenes(clip, threshold=15.0)

    assert analysis.cut_count >= 1
    assert len(analysis.shot_durations_seconds) == analysis.cut_count
    assert analysis.mean_shot_duration_seconds is not None
    assert 0.0 <= analysis.confidence <= 1.0


def test_analyze_scenes_handles_static_clip(synthetic_clip_factory):
    clip = synthetic_clip_factory(duration_seconds=2.0, name="static_clip", with_cuts=False)
    analysis = analyze_scenes(clip)

    # A single-color clip may be detected as zero or one scene depending
    # on encoder noise; either way it must not crash and must report a
    # sane duration.
    assert analysis.duration_seconds > 0
