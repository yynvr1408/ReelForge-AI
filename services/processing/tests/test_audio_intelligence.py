from __future__ import annotations

from app.analysis.beat_tracking import calculate_music_sync_score, generate_beat_grid, snap_cuts_to_beats
from app.analysis.transcription import (
    _timecode_to_seconds,
    generate_speech_timed_captions,
    parse_srt_to_captions,
)


def test_generate_beat_grid():
    # 120 BPM = 0.5s per beat
    grid = generate_beat_grid(tempo_bpm=120.0, total_duration_seconds=2.0, first_beat_offset_seconds=0.0)
    assert len(grid) == 5  # 0.0, 0.5, 1.0, 1.5, 2.0
    assert grid[0] == 0.0
    assert grid[1] == 0.5
    assert grid[2] == 1.0
    assert grid[3] == 1.5
    assert grid[4] == 2.0


def test_snap_cuts_to_beats():
    # Beats at 1.0, 2.0, 3.0, 4.0
    beats = [1.0, 2.0, 3.0, 4.0]
    # Cuts slightly off beat
    cuts = [0.95, 2.08, 3.8]

    snapped = snap_cuts_to_beats(cuts, beats, max_drift_seconds=0.2)
    # 0.95 snaps to 1.0 (drift = 0.05 <= 0.2)
    assert snapped[0] == 1.0
    # 2.08 snaps to 2.0 (drift = 0.08 <= 0.2)
    assert snapped[1] == 2.0
    # 3.8 drift is 0.2, snaps to 4.0 or keeps original
    assert snapped[2] == 4.0


def test_music_sync_score():
    beats = [1.0, 2.0, 3.0, 4.0]
    # Perfectly aligned cuts
    perfect_cuts = [1.0, 2.0, 3.0]
    score = calculate_music_sync_score(perfect_cuts, beats, tolerance_seconds=0.1)
    assert score["sync_score"] == 1.0
    assert score["aligned_cut_count"] == 3

    # Off-beat cuts
    off_cuts = [0.5, 1.5, 2.5]
    score_off = calculate_music_sync_score(off_cuts, beats, tolerance_seconds=0.1)
    assert score_off["sync_score"] == 0.0
    assert score_off["aligned_cut_count"] == 0


def test_srt_parsing_and_timecode_conversion():
    assert _timecode_to_seconds("00:01:23,450") == 83.45
    assert _timecode_to_seconds("01:00") == 60.0

    sample_srt = """1
00:00:01,000 --> 00:00:03,500
Welcome to ReelForge AI

2
00:00:04,200 --> 00:00:07,000
AI-assisted video editing
"""
    captions = parse_srt_to_captions(sample_srt)
    assert len(captions) == 2
    assert captions[0]["text"] == "Welcome to ReelForge AI"
    assert captions[0]["start_seconds"] == 1.0
    assert captions[0]["end_seconds"] == 3.5
    assert captions[1]["text"] == "AI-assisted video editing"
    assert captions[1]["start_seconds"] == 4.2
    assert captions[1]["end_seconds"] == 7.0


def test_generate_speech_timed_captions():
    ranges = [[1.2, 3.8], [5.0, 8.2]]
    captions = generate_speech_timed_captions(ranges)
    assert len(captions) == 2
    assert captions[0]["start_seconds"] == 1.2
    assert captions[0]["end_seconds"] == 3.8
    assert captions[0]["position"] == "bottom"


def test_snap_timeline_to_beats_route(app_client):
    timeline = {
        "tracks": [
            {
                "id": "t-video",
                "kind": "video",
                "clips": [
                    {
                        "id": "c1",
                        "source_media_id": "m1",
                        "source_in_seconds": 0.0,
                        "source_out_seconds": 1.05,
                        "timeline_position_seconds": 0.0,
                    },
                    {
                        "id": "c2",
                        "source_media_id": "m2",
                        "source_in_seconds": 0.0,
                        "source_out_seconds": 1.95,
                        "timeline_position_seconds": 1.05,
                    },
                ],
                "overlays": [],
            }
        ],
        "export_settings": {
            "width": 1080,
            "height": 1920,
            "frame_rate": 30.0,
            "video_codec": "libx264",
            "audio_codec": "aac",
            "container": "mp4",
            "crf": 20,
        },
    }
    # Snap with 60 BPM (1s beats at 0.0, 1.0, 2.0, 3.0)
    res = app_client.post(
        "/timeline/snap-to-beats",
        json={"timeline": timeline, "tempo_bpm": 60.0, "max_drift_seconds": 0.25},
    )
    assert res.status_code == 200
    data = res.json()
    assert "sync_report" in data
    assert data["sync_report"]["sync_score"] > 0
    # First cut was 1.05, should snap to 1.0
    clips = data["timeline"]["tracks"][0]["clips"]
    assert clips[0]["source_out_seconds"] == 1.0
