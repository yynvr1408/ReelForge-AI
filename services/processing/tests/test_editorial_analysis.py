import numpy as np
import pytest

from app.analysis.audio_features import analyze_audio_features, analyze_rhythm_and_speech, estimate_tempo_candidates
from app.analysis.cancellation import AnalysisCancelled
from app.analysis.scene_detection import analyze_scenes
from app.analysis.visual_features import analyze_visual_features, estimate_motion_instability
from app.analysis.moment_selection import rank_moments


def test_visual_measurements_return_technical_scores(synthetic_clip_factory):
    clip = synthetic_clip_factory(duration_seconds=2, name="visual_measure", with_cuts=False)
    result = analyze_visual_features(clip)
    assert result["sample_count"] > 0
    assert result["sharpness_laplacian_variance_median"] >= 0
    assert 0 <= result["underexposed_sample_ratio"] <= 1
    assert 0 <= result["camera_shake_candidate_ratio"] <= 1
    assert "require human review" in result["motion_measurement_note"]


def test_motion_instability_marks_abrupt_global_reversals_as_review_candidates():
    steady = estimate_motion_instability(np.array([[2, 0], [2, 0], [2, 0], [2, 0]]))
    jitter = estimate_motion_instability(np.array([[3, 0], [-3, 0], [3, 0], [-3, 0]]))
    assert steady["candidate_ratio"] == 0
    assert jitter["candidate_ratio"] == 1


def test_audio_measurements_report_energy_and_candidate_events(ffmpeg_path, synthetic_clip_factory):
    clip = synthetic_clip_factory(duration_seconds=2, name="audio_measure", with_cuts=False)
    result = analyze_audio_features(ffmpeg_path, clip)
    assert result["duration_seconds"] > 1.8
    assert result["rms_mean"] > 0
    assert isinstance(result["transient_candidates_seconds"], list)
    assert "may reflect music" in result["analysis_note"]
    assert isinstance(result["tempo_candidates_bpm"], list)


def test_source_moment_ranking_attaches_coarse_audio_activity_scores(ffmpeg_path, synthetic_clip_factory):
    clip = synthetic_clip_factory(duration_seconds=2, name="moment_audio", with_cuts=False)
    moments = rank_moments(clip, ffmpeg_path=ffmpeg_path, analyze_motion=True)
    assert moments
    assert 0 <= moments[0]["shake_candidate_ratio"] <= 1
    assert 0 <= moments[0]["rhythmic_activity_score"] <= 1
    assert 0 <= moments[0]["speech_like_activity_score"] <= 1
    assert "midpoint frame" in moments[0]["analysis_note"]


def test_audio_decode_observes_cancellation(ffmpeg_path, synthetic_clip_factory):
    clip = synthetic_clip_factory(duration_seconds=2, name="audio_cancel", with_cuts=False)
    with pytest.raises(AnalysisCancelled):
        analyze_audio_features(ffmpeg_path, clip, cancelled=lambda: True)


def test_tempo_estimator_finds_reviewable_periodic_pulse_candidates():
    rms = np.full(300, 0.04, dtype=np.float32)
    for index in range(5, rms.size, 5):
        rms[index] = 0.3
        if index + 1 < rms.size:
            rms[index + 1] = 0.05
    candidates = estimate_tempo_candidates(rms)
    assert candidates
    assert any(abs(candidate["bpm"] - 120) <= 3 for candidate in candidates)
    assert all(0 <= candidate["confidence"] <= 1 for candidate in candidates)


def test_tempo_estimator_omits_unstructured_or_too_short_audio():
    assert estimate_tempo_candidates(np.full(100, 0.05, dtype=np.float32)) == []
    assert estimate_tempo_candidates(np.array([0.0, 0.1, 0.0], dtype=np.float32)) == []


def test_rhythm_analysis_finds_pulsed_onsets_and_speech_like_activity():
    sample_rate = 8000
    duration = 3.0
    time_axis = np.arange(round(sample_rate * duration), dtype=np.float32) / sample_rate
    # A synthetic speech-like harmonic signal with gentle pitch and amplitude variation.
    frequency = 170 + 35 * np.sin(2 * np.pi * 1.4 * time_axis)
    phase = 2 * np.pi * np.cumsum(frequency) / sample_rate
    speech = (0.18 * np.sin(phase) + 0.08 * np.sin(2 * phase) + 0.04 * np.sin(3 * phase))
    speech *= 0.65 + 0.35 * np.sin(2 * np.pi * 3.2 * time_axis) ** 2
    result = analyze_rhythm_and_speech(speech.astype(np.float32), sample_rate)
    assert result["speech_like_ranges_seconds"]
    assert result["speech_like_ranges_seconds"][0][1] > result["speech_like_ranges_seconds"][0][0]

    pulses = np.zeros(round(sample_rate * 3), dtype=np.float32)
    for start in np.arange(0.25, 2.8, 0.5):
        offset = round(start * sample_rate)
        pulse_time = np.arange(240, dtype=np.float32) / sample_rate
        pulses[offset : offset + pulse_time.size] = 0.5 * np.sin(2 * np.pi * 900 * pulse_time) * np.hanning(pulse_time.size)
    rhythmic = analyze_rhythm_and_speech(pulses, sample_rate)
    assert len(rhythmic["beat_candidates_seconds"]) >= 4


def test_scene_analysis_observes_cancellation(synthetic_clip_factory):
    clip = synthetic_clip_factory(duration_seconds=2, name="scene_cancel", with_cuts=False)
    with pytest.raises(AnalysisCancelled):
        analyze_scenes(clip, cancelled=lambda: True)


def test_scene_detection_callback_stops_after_cancellation_is_requested(synthetic_clip_factory):
    clip = synthetic_clip_factory(duration_seconds=4, name="scene_callback_cancel", with_cuts=True)
    checks = 0

    def cancelled_after_detection_event():
        nonlocal checks
        checks += 1
        return checks > 1

    with pytest.raises(AnalysisCancelled):
        analyze_scenes(clip, cancelled=cancelled_after_detection_event)
    assert checks >= 2


def test_visual_sampling_observes_cancellation(synthetic_clip_factory):
    clip = synthetic_clip_factory(duration_seconds=2, name="visual_cancel", with_cuts=False)
    with pytest.raises(AnalysisCancelled):
        analyze_visual_features(clip, cancelled=lambda: True)
