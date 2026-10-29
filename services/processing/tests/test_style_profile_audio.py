from app.style_profiles.aggregator import ReferenceSample, build_style_profile


def test_style_profile_exposes_only_reviewable_tempo_hypotheses():
    profile = build_style_profile(
        [
            ReferenceSample(
                reference_id="ref-1",
                shot_durations_seconds=[1.0, 2.0],
                cut_count=1,
                confidence=0.8,
                audio={
                    "duration_seconds": 10,
                    "rms_mean": 0.1,
                    "silence_ranges_seconds": [],
                    "transient_candidates_seconds": [0.5, 1.0],
                    "beat_candidates_seconds": [0.5, 1.0, 1.5],
                    "speech_like_ranges_seconds": [[2.0, 5.0]],
                    "tempo_candidates_bpm": [
                        {"bpm": 120.0, "confidence": 0.8},
                        {"bpm": 90.0, "confidence": 0.2},
                    ],
                },
            )
        ]
    )
    assert profile["audio"]["tempo_candidates_bpm"] == [120.0]
    assert profile["audio"]["beat_candidates_per_minute"] == 18.0
    assert profile["audio"]["speech_like_ratio"] == 0.3
    assert "review" in profile["audio"]["tempo_note"]
