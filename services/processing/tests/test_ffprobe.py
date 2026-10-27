from __future__ import annotations

from app.media.ffprobe import probe_media


def test_probe_reports_duration_dimensions_and_audio(ffprobe_path, synthetic_clip_factory):
    clip = synthetic_clip_factory(duration_seconds=2.0, name="probe_clip", with_cuts=False)
    probe = probe_media(ffprobe_path, clip)

    assert probe.has_video is True
    assert probe.has_audio is True
    assert probe.width == 320
    assert probe.height == 240
    assert probe.duration_seconds is not None
    assert abs(probe.duration_seconds - 2.0) < 0.5


def test_probe_rejects_nonexistent_file(ffprobe_path, tmp_path):
    from app.media.ffprobe import ProbeError
    import pytest

    missing = tmp_path / "does-not-exist.mp4"
    with pytest.raises(ProbeError):
        probe_media(ffprobe_path, missing)
