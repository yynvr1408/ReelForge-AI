"""Bounded local audio measurements for editing suggestions."""

from __future__ import annotations

import subprocess
import time
from pathlib import Path

import numpy as np

from app.analysis.cancellation import AnalysisCancelled, check_cancelled


def estimate_tempo_candidates(rms: np.ndarray, frame_seconds: float = 0.1) -> list[dict]:
    """Return cautious autocorrelation tempo hypotheses from RMS novelty.

    These are review hints, not beat annotations. The short, bounded energy
    envelope deliberately avoids classifying speech or effects as music.
    """
    if rms.size < 80 or float(np.std(rms)) < 0.003:
        return []
    novelty = np.maximum(0.0, np.diff(rms, prepend=rms[0]))
    novelty -= float(np.mean(novelty))
    scale = float(np.linalg.norm(novelty))
    if scale < 1e-6:
        return []
    correlations: list[tuple[float, int]] = []
    # 60–180 BPM, at most 10 seconds of energy bins.
    for lag in range(max(1, round(60 / (180 * frame_seconds))), round(60 / (60 * frame_seconds)) + 1):
        left, right = novelty[:-lag], novelty[lag:]
        denom = float(np.linalg.norm(left) * np.linalg.norm(right))
        score = float(np.dot(left, right) / denom) if denom > 1e-9 else 0.0
        correlations.append((score, lag))
    candidates = []
    for score, lag in sorted(correlations, reverse=True):
        if score < 0.3:
            break
        bpm = round(60 / (lag * frame_seconds), 1)
        if all(abs(bpm - existing["bpm"]) > 4 for existing in candidates):
            candidates.append({"bpm": bpm, "confidence": round(score, 3)})
        if len(candidates) == 3:
            break
    return candidates


def analyze_rhythm_and_speech(samples: np.ndarray, sample_rate: int = 8000, frame_seconds: float = 0.02) -> dict:
    """Return review-only onset and speech-like activity candidates.

    Spectral flux proposes rhythmic onsets. Speech-like ranges use coarse
    spectral/zero-crossing thresholds and are explicitly not a voice detector;
    music, singing, and effects can be confused with speech.
    """
    frame_size = max(1, round(sample_rate * frame_seconds))
    frame_count = samples.size // frame_size
    if frame_count < 2:
        return {"beat_candidates_seconds": [], "speech_like_ranges_seconds": []}

    frames = samples[: frame_count * frame_size].reshape(frame_count, frame_size)
    window = np.hanning(frame_size).astype(np.float32)
    spectra = np.abs(np.fft.rfft(frames * window, n=512, axis=1))
    spectral_sum = np.sum(spectra, axis=1)
    normalized = spectra / np.maximum(spectral_sum[:, None], 1e-8)
    flux = np.sum(np.maximum(0.0, np.diff(normalized, axis=0, prepend=normalized[:1])), axis=1)
    flux[0] = 0.0
    median_flux = float(np.median(flux))
    mad_flux = float(np.median(np.abs(flux - median_flux)))
    threshold = max(median_flux + 2.5 * mad_flux, float(np.percentile(flux, 90)) * 0.55)
    peaks = np.flatnonzero((flux >= threshold) & (flux >= np.r_[flux[0], flux[:-1]]) & (flux >= np.r_[flux[1:], flux[-1]]))
    beat_candidates: list[float] = []
    for index in peaks:
        stamp = index * frame_seconds
        if not beat_candidates or stamp - beat_candidates[-1] >= 0.2:
            beat_candidates.append(round(float(stamp), 3))
        elif flux[index] > flux[round(beat_candidates[-1] / frame_seconds)]:
            beat_candidates[-1] = round(float(stamp), 3)
        if len(beat_candidates) == 500:
            break

    rms = np.sqrt(np.mean(frames**2, axis=1))
    crossings = np.mean((frames[:, 1:] >= 0) != (frames[:, :-1] >= 0), axis=1)
    frequencies = np.fft.rfftfreq(512, d=1 / sample_rate)
    centroid = np.sum(spectra * frequencies[None, :], axis=1) / np.maximum(spectral_sum, 1e-8)
    geometric = np.exp(np.mean(np.log(np.maximum(spectra[:, 1:], 1e-8)), axis=1))
    arithmetic = np.mean(spectra[:, 1:], axis=1)
    flatness = geometric / np.maximum(arithmetic, 1e-8)
    active = rms > max(0.008, float(np.percentile(rms, 60)) * 0.2)
    speech_mask = active & (crossings >= 0.015) & (crossings <= 0.32) & (centroid >= 180) & (centroid <= 3600) & (flatness >= 0.0001) & (flatness <= 0.92)
    starts = np.flatnonzero(speech_mask & ~np.r_[False, speech_mask[:-1]])
    ends = np.flatnonzero(speech_mask & ~np.r_[speech_mask[1:], False]) + 1
    speech_ranges = [
        [round(float(start * frame_seconds), 2), round(float(end * frame_seconds), 2)]
        for start, end in zip(starts, ends)
        if (end - start) * frame_seconds >= 0.25
    ]
    return {
        "beat_candidates_seconds": beat_candidates,
        "speech_like_ranges_seconds": speech_ranges,
    }


def analyze_audio_features(ffmpeg_path: Path, media_path: Path, max_seconds: int = 300, cancelled=None) -> dict:
    """Measure RMS energy, silence ranges, and candidate transients.

    Transient candidates are not asserted to be musical beats; speech and
    sound effects can also create peaks. Decode is capped to five minutes.
    """
    args = [
        str(ffmpeg_path), "-v", "error", "-i", str(media_path), "-t", str(max_seconds),
        "-vn", "-ac", "1", "-ar", "8000", "-f", "s16le", "pipe:1",
    ]
    process = None
    try:
        process = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        deadline = time.monotonic() + max_seconds + 30
        while True:
            check_cancelled(cancelled)
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                process.kill()
                process.communicate()
                raise ValueError("Audio feature extraction timed out")
            try:
                stdout, stderr = process.communicate(timeout=min(0.25, remaining))
                break
            except subprocess.TimeoutExpired:
                continue
    except AnalysisCancelled:
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.communicate(timeout=2)
            except subprocess.TimeoutExpired:
                process.kill()
                process.communicate()
        raise
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ValueError(f"Audio feature extraction failed: {exc}") from exc
    if process.returncode != 0:
        raise ValueError("FFmpeg could not decode an audio stream")

    samples = np.frombuffer(stdout, dtype="<i2").astype(np.float32) / 32768.0
    if samples.size == 0:
        return {"duration_seconds": 0.0, "silence_ranges_seconds": [], "transient_candidates_seconds": [], "rms_mean": 0.0}

    rate = 8000
    window = 800  # 100 ms energy windows
    usable = samples[: (samples.size // window) * window]
    if usable.size == 0:
        usable = samples
        window = samples.size
    rms = np.sqrt(np.mean(usable.reshape(-1, window) ** 2, axis=1))
    duration = samples.size / rate
    silence_mask = rms < 0.008
    silence_ranges: list[list[float]] = []
    starts = np.flatnonzero(silence_mask & ~np.r_[False, silence_mask[:-1]])
    ends = np.flatnonzero(silence_mask & ~np.r_[silence_mask[1:], False]) + 1
    for start, end in zip(starts, ends):
        if (end - start) * 0.1 >= 0.3:
            silence_ranges.append([round(float(start * 0.1), 2), round(min(duration, float(end * 0.1)), 2)])

    # Positive RMS rises are useful candidate sync points, not beat labels.
    rise = np.maximum(0.0, np.diff(rms, prepend=rms[0]))
    threshold = max(float(np.percentile(rise, 90)), 0.015)
    peaks = np.flatnonzero((rise >= threshold) & (rms > 0.02))
    selected: list[float] = []
    for idx in peaks:
        check_cancelled(cancelled)
        stamp = float(idx * 0.1)
        if not selected or stamp - selected[-1] >= 0.25:
            selected.append(round(stamp, 2))
        if len(selected) >= 500:
            break

    check_cancelled(cancelled)
    rhythm = analyze_rhythm_and_speech(samples, rate)
    check_cancelled(cancelled)
    tempo_candidates = estimate_tempo_candidates(rms)
    return {
        "duration_seconds": round(duration, 2),
        "rms_mean": round(float(np.mean(rms)), 5),
        "silence_ranges_seconds": silence_ranges,
        "transient_candidates_seconds": selected,
        "tempo_candidates_bpm": tempo_candidates,
        **rhythm,
        "analysis_note": "Transient and tempo candidates may reflect music, speech, or sound effects; review before syncing cuts.",
        "speech_analysis_note": "Speech-like ranges are coarse spectral estimates, not speech recognition or reliable voice activity detection; music and effects can be confused with speech.",
    }
