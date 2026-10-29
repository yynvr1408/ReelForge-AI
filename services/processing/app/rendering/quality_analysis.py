"""Conventional, non-generative checks on completed renders."""

from __future__ import annotations

import re
import subprocess
from pathlib import Path


_BLACK_START = re.compile(r"black_start:([0-9.]+)")
_BLACK_END = re.compile(r"black_end:([0-9.]+)")
_BLACK_DURATION = re.compile(r"black_duration:([0-9.]+)")
_MAX_VOLUME = re.compile(r"max_volume:\s*(-?(?:[0-9]+(?:\.[0-9]*)?|inf|nan))\s*dB", re.I)
_INTEGRATED_LUFS = re.compile(
    r"Integrated loudness:\s*I:\s*(-?(?:[0-9]+(?:\.[0-9]*)?|inf|nan))\s*LUFS", re.I
)
_TRUE_PEAK = re.compile(
    r"True peak:\s*Peak:\s*(-?(?:[0-9]+(?:\.[0-9]*)?|inf|nan))\s*dBFS", re.I
)


def analyze_render_quality(ffmpeg_path: Path, output_path: Path) -> dict:
    """Scan rendered video for sustained black, loudness, and peak levels.

    This is a warning report, never an automatic edit or render rejection.
    """
    command = [
        str(ffmpeg_path), "-hide_banner", "-nostats", "-i", str(output_path),
        "-vf", "blackdetect=d=0.1:pix_th=0.10", "-af", "volumedetect,ebur128=peak=true:framelog=quiet",
        "-f", "null", "-",
    ]
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=1800, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"available": False, "warnings": [f"Quality scan could not complete: {exc}"]}
    diagnostics = f"{result.stderr}\n{result.stdout}"
    if result.returncode != 0:
        return {"available": False, "warnings": ["Quality scan could not decode the rendered file"]}

    starts = list(_BLACK_START.finditer(diagnostics))
    ends = list(_BLACK_END.finditer(diagnostics))
    durations = list(_BLACK_DURATION.finditer(diagnostics))
    black_segments = [
        {
            "start_seconds": round(float(start.group(1)), 3),
            "end_seconds": round(float(end.group(1)), 3),
            "duration_seconds": round(float(duration.group(1)), 3),
        }
        for start, end, duration in zip(starts, ends, durations)
    ]
    volume_match = _MAX_VOLUME.search(diagnostics)
    max_volume_db = None
    if volume_match and volume_match.group(1).lower() not in {"nan", "inf", "-inf"}:
        max_volume_db = float(volume_match.group(1))

    integrated_match = _INTEGRATED_LUFS.search(diagnostics)
    integrated_lufs = None
    if integrated_match and integrated_match.group(1).lower() not in {"nan", "inf", "-inf"}:
        integrated_lufs = float(integrated_match.group(1))
    true_peak_match = _TRUE_PEAK.search(diagnostics)
    true_peak_dbfs = None
    if true_peak_match and true_peak_match.group(1).lower() not in {"nan", "inf", "-inf"}:
        true_peak_dbfs = float(true_peak_match.group(1))

    warnings = []
    if black_segments:
        warnings.append(f"Detected {len(black_segments)} sustained black segment(s); review for intentional fades or gaps")
    if max_volume_db is not None and max_volume_db >= -0.1:
        warnings.append(f"Audio peak is {max_volume_db:.1f} dBFS and may clip")
    elif true_peak_dbfs is not None and true_peak_dbfs >= -1.0:
        warnings.append(f"True peak is {true_peak_dbfs:.1f} dBFS and may clip")
    return {
        "available": True,
        "black_segments": black_segments,
        "max_volume_dbfs": max_volume_db,
        "integrated_loudness_lufs": integrated_lufs,
        "true_peak_dbfs": true_peak_dbfs,
        "warnings": warnings,
    }
