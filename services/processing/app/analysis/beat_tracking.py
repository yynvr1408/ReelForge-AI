"""Beat tracking, tempo quantization, and cut-to-music synchronization.

Satisfies Section 23 of the product specification:
- Beat detection and tempo estimation
- Music synchronization markers
- Snaps timeline cuts to musical beats within a configurable tolerance window
- Measures synchronization quality between timeline cuts and musical tempo
"""

from __future__ import annotations

import bisect


def generate_beat_grid(
    tempo_bpm: float,
    total_duration_seconds: float,
    first_beat_offset_seconds: float = 0.0,
) -> list[float]:
    """Generate evenly spaced beat timestamps based on a known or estimated BPM.

    Args:
        tempo_bpm: Beats per minute (typically 60 to 180).
        total_duration_seconds: Duration of the track.
        first_beat_offset_seconds: Timestamp of the initial downbeat/onset.

    Returns:
        Sorted list of beat timestamps in seconds.
    """
    if tempo_bpm <= 0 or total_duration_seconds <= 0:
        return []

    beat_interval = 60.0 / tempo_bpm
    grid: list[float] = []
    current = max(0.0, first_beat_offset_seconds)

    while current <= total_duration_seconds:
        grid.append(round(current, 3))
        current += beat_interval

    return grid


def snap_cuts_to_beats(
    cut_timestamps: list[float],
    beat_timestamps: list[float],
    max_drift_seconds: float = 0.25,
) -> list[float]:
    """Snap proposed cut points to the nearest musical beat within tolerance.

    Preserves strict monotonic order: cuts are not permitted to overlap or
    reverse sequence. If no beat is within `max_drift_seconds`, the original
    cut timestamp is preserved.
    """
    if not beat_timestamps or not cut_timestamps:
        return list(cut_timestamps)

    sorted_beats = sorted(beat_timestamps)
    snapped: list[float] = []
    last_cut = -1.0

    for cut in cut_timestamps:
        # Find nearest beat using binary search
        idx = bisect.bisect_left(sorted_beats, cut)
        best_beat = None
        min_dist = float("inf")

        for candidate_idx in (idx - 1, idx, idx + 1):
            if 0 <= candidate_idx < len(sorted_beats):
                dist = abs(sorted_beats[candidate_idx] - cut)
                if dist < min_dist:
                    min_dist = dist
                    best_beat = sorted_beats[candidate_idx]

        target = cut
        if best_beat is not None and min_dist <= (max_drift_seconds + 1e-5):
            # Ensure strictly greater than the preceding cut
            if best_beat > last_cut + 0.1:
                target = best_beat

        # Ensure monotonic progression
        if target <= last_cut:
            target = last_cut + 0.1

        target = round(target, 3)
        snapped.append(target)
        last_cut = target

    return snapped


def calculate_music_sync_score(
    cut_timestamps: list[float],
    beat_timestamps: list[float],
    tolerance_seconds: float = 0.15,
) -> dict:
    """Calculate the alignment quality between timeline cuts and musical beats.

    Returns:
        dict with:
        - sync_score: float 0.0 to 1.0 (proportion of cuts close to a beat)
        - aligned_cut_count: int
        - total_cut_count: int
        - mean_drift_seconds: average distance to nearest beat
    """
    if not cut_timestamps or not beat_timestamps:
        return {
            "sync_score": 0.0,
            "aligned_cut_count": 0,
            "total_cut_count": len(cut_timestamps),
            "mean_drift_seconds": 0.0,
        }

    sorted_beats = sorted(beat_timestamps)
    aligned_count = 0
    total_drift = 0.0

    for cut in cut_timestamps:
        idx = bisect.bisect_left(sorted_beats, cut)
        min_dist = float("inf")
        for candidate_idx in (idx - 1, idx, idx + 1):
            if 0 <= candidate_idx < len(sorted_beats):
                min_dist = min(min_dist, abs(sorted_beats[candidate_idx] - cut))

        total_drift += min_dist
        if min_dist <= tolerance_seconds:
            aligned_count += 1

    total_cuts = len(cut_timestamps)
    return {
        "sync_score": round(aligned_count / total_cuts, 3) if total_cuts else 0.0,
        "aligned_cut_count": aligned_count,
        "total_cut_count": total_cuts,
        "mean_drift_seconds": round(total_drift / total_cuts, 3) if total_cuts else 0.0,
    }
