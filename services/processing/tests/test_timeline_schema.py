from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.timeline.schema import Clip, ExportSettings, Timeline, Track
from app.timeline.validator import is_valid, validate_timeline


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
