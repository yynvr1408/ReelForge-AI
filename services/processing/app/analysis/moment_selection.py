"""Rank source-video scene moments using simple, explainable signals."""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

from app.analysis.scene_detection import analyze_scenes
from app.analysis.visual_features import estimate_motion_instability


def rank_moments(
    video_path: Path,
    max_moments: int = 120,
    ffmpeg_path: Path | None = None,
    analyze_motion: bool = False,
) -> list[dict]:
    """Return scene time ranges scored for sharpness and usable exposure.

    The score is a technical quality heuristic, not an action/subject detector.
    No face, identity, or semantic recognition is performed.
    """
    scene_data = analyze_scenes(video_path)
    durations = scene_data.shot_durations_seconds
    boundaries = scene_data.scene_boundaries_seconds
    if not durations:
        return []
    moments = []
    audio = None
    if ffmpeg_path is not None:
        try:
            from app.analysis.audio_features import analyze_audio_features

            audio = analyze_audio_features(ffmpeg_path, video_path)
        except (OSError, ValueError):
            # Audio is optional; retain the visual-only planner fallback.
            audio = None
    onset_times = (audio or {}).get("beat_candidates_seconds", [])
    speech_ranges = (audio or {}).get("speech_like_ranges_seconds", [])
    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        return []
    try:
        for index, duration in enumerate(durations[:max_moments]):
            start = boundaries[index] if index < len(boundaries) else sum(durations[:index])
            end = min(scene_data.duration_seconds, start + duration)
            if end <= start:
                continue
            midpoint = (start + end) / 2
            capture.set(cv2.CAP_PROP_POS_MSEC, midpoint * 1000)
            ok, frame = capture.read()
            if not ok or frame is None:
                continue
            small = cv2.resize(frame, (320, 180), interpolation=cv2.INTER_AREA)
            gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
            brightness = float(np.mean(gray))
            sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
            sharpness_score = min(1.0, sharpness / 180.0)
            exposure_score = max(0.0, 1.0 - abs(brightness - 128.0) / 128.0)
            score = 0.65 * sharpness_score + 0.35 * exposure_score
            shake_ratio = None
            if analyze_motion:
                flow_vectors = []
                previous_gray = None
                sample_count = min(6, max(3, int((end - start) / 0.5)))
                for sample_time in np.linspace(start, max(start, end - 0.04), sample_count):
                    capture.set(cv2.CAP_PROP_POS_MSEC, float(sample_time) * 1000)
                    frame_ok, motion_frame = capture.read()
                    if not frame_ok or motion_frame is None:
                        continue
                    motion_small = cv2.resize(motion_frame, (160, 90), interpolation=cv2.INTER_AREA)
                    motion_gray = cv2.cvtColor(motion_small, cv2.COLOR_BGR2GRAY)
                    if previous_gray is not None:
                        flow = cv2.calcOpticalFlowFarneback(
                            previous_gray, motion_gray, None, 0.5, 2, 15, 2, 5, 1.1, 0
                        )
                        flow_vectors.append((float(np.median(flow[:, :, 0])), float(np.median(flow[:, :, 1]))))
                    previous_gray = motion_gray
                shake_ratio = estimate_motion_instability(
                    np.asarray(flow_vectors, dtype=np.float32).reshape(-1, 2)
                )["candidate_ratio"]
            reasons = []
            reasons.append("sharper sampled frame" if sharpness_score >= 0.5 else "soft sampled frame")
            if brightness < 35:
                reasons.append("may be underexposed")
            elif brightness > 225:
                reasons.append("may be overexposed")
            else:
                reasons.append("usable sampled exposure")
            moment = {
                "source_in_seconds": round(start, 3),
                "source_out_seconds": round(end, 3),
                "quality_score": round(score, 3),
                "selection_reason": "; ".join(reasons),
                "analysis_note": "Heuristic uses one midpoint frame for sharpness/exposure; it does not identify actions or people.",
            }
            if shake_ratio is not None:
                moment["shake_candidate_ratio"] = shake_ratio
            duration_safe = max(end - start, 0.001)
            if audio is not None:
                onset_count = sum(start <= float(stamp) < end for stamp in onset_times)
                speech_overlap = sum(
                    max(0.0, min(end, float(range_end)) - max(start, float(range_start)))
                    for range_start, range_end in speech_ranges
                )
                moment["rhythmic_activity_score"] = round(min(1.0, onset_count / max(duration_safe * 1.5, 1.0)), 3)
                moment["speech_like_activity_score"] = round(min(1.0, speech_overlap / duration_safe), 3)
            moments.append(moment)
    finally:
        capture.release()
    return moments
