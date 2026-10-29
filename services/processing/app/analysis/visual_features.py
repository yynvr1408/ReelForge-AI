"""Lightweight visual measurements for footage-based editorial assistance.

These are technical measurements, not semantic recognition. Motion combines
camera and subject movement; this module deliberately performs no face or
identity analysis.
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

from app.analysis.cancellation import check_cancelled


def estimate_motion_instability(flow_vectors: np.ndarray) -> dict:
    """Return a coarse global-flow reversal hint, not a shake classification."""
    if flow_vectors.ndim != 2 or flow_vectors.shape[1] != 2 or len(flow_vectors) < 3:
        return {"candidate_ratio": 0.0, "sample_count": int(len(flow_vectors))}
    vectors = np.asarray(flow_vectors, dtype=np.float32)
    speeds = np.linalg.norm(vectors, axis=1)
    reversals = np.sum(vectors[:-1] * vectors[1:], axis=1) < 0
    acceleration = np.linalg.norm(np.diff(vectors, n=2, axis=0), axis=1)
    moving = (speeds[:-2] >= 0.75) & (speeds[1:-1] >= 0.75) & (speeds[2:] >= 0.75)
    # An alternating global translation with abrupt direction changes can be
    # consistent with camera shake. Both cuts and subject movement can trigger it.
    abrupt_reversal = reversals[:-1] & (acceleration >= 1.5)
    eligible = moving & (np.maximum(reversals[:-1], reversals[1:]))
    ratio = float(np.mean(abrupt_reversal[eligible])) if np.any(eligible) else 0.0
    return {"candidate_ratio": round(ratio, 3), "sample_count": int(len(vectors))}


def analyze_visual_features(video_path: Path, max_samples: int = 300, cancelled=None) -> dict:
    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise ValueError(f"Could not open video for visual analysis: {video_path}")

    fps = capture.get(cv2.CAP_PROP_FPS) or 0.0
    frame_count = capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0.0
    duration = frame_count / fps if fps > 0 else 0.0
    sample_count = min(max_samples, max(1, int(duration)))
    sample_times = np.linspace(0, max(0.0, duration - 0.05), sample_count)

    blur_scores: list[float] = []
    brightness: list[float] = []
    saturation: list[float] = []
    motion_scores: list[float] = []
    global_flow_vectors: list[tuple[float, float]] = []
    previous_gray = None
    try:
        for seconds in sample_times:
            check_cancelled(cancelled)
            capture.set(cv2.CAP_PROP_POS_MSEC, float(seconds) * 1000)
            ok, frame = capture.read()
            if not ok or frame is None:
                continue
            small = cv2.resize(frame, (320, 180), interpolation=cv2.INTER_AREA)
            gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
            hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
            blur_scores.append(float(cv2.Laplacian(gray, cv2.CV_64F).var()))
            brightness.append(float(np.mean(hsv[:, :, 2])))
            saturation.append(float(np.mean(hsv[:, :, 1])))
            if previous_gray is not None:
                flow = cv2.calcOpticalFlowFarneback(
                    previous_gray, gray, None, 0.5, 2, 15, 2, 5, 1.1, 0
                )
                motion_scores.append(float(np.median(np.linalg.norm(flow, axis=2))))
                global_flow_vectors.append(
                    (float(np.median(flow[:, :, 0])), float(np.median(flow[:, :, 1])))
                )
            previous_gray = gray
    finally:
        capture.release()

    if not blur_scores:
        raise ValueError("No decodable frames found during visual analysis")

    exposure = float(np.mean(brightness))
    instability = estimate_motion_instability(np.asarray(global_flow_vectors, dtype=np.float32).reshape(-1, 2))
    return {
        "sample_count": len(blur_scores),
        "sharpness_laplacian_variance_median": round(float(np.median(blur_scores)), 2),
        "brightness_mean_0_255": round(exposure, 2),
        "underexposed_sample_ratio": round(float(np.mean(np.asarray(brightness) < 18)), 3),
        "overexposed_sample_ratio": round(float(np.mean(np.asarray(brightness) > 245)), 3),
        "saturation_mean_0_255": round(float(np.mean(saturation)), 2),
        "motion_magnitude_median": round(float(np.median(motion_scores)), 3) if motion_scores else 0.0,
        "camera_shake_candidate_ratio": instability["candidate_ratio"],
        "motion_measurement_note": "Optical flow combines camera and subject motion. Shake candidates use sparse global-flow reversals and require human review; pans, subject movement, and cuts can trigger them.",
    }
