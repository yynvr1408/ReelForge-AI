"""FFprobe-based media inspection.

A file extension is never trusted as proof of validity. Every imported
file is probed with FFprobe before anything else is done with it.
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path


class ProbeError(RuntimeError):
    pass


@dataclass(frozen=True)
class MediaProbe:
    duration_seconds: float | None
    width: int | None
    height: int | None
    frame_rate: float | None
    has_video: bool
    has_audio: bool
    raw: dict


def _parse_frame_rate(rate_str: str | None) -> float | None:
    if not rate_str:
        return None
    if "/" in rate_str:
        num, _, den = rate_str.partition("/")
        try:
            num_f, den_f = float(num), float(den)
            return num_f / den_f if den_f else None
        except ValueError:
            return None
    try:
        return float(rate_str)
    except ValueError:
        return None


def probe_media(ffprobe_path: Path, file_path: Path, timeout_seconds: float = 30.0) -> MediaProbe:
    """Run ffprobe on `file_path` and return structured metadata.

    Raises ProbeError if ffprobe fails or the file cannot be parsed as
    media. Uses a fixed argument array; no shell, no string interpolation.
    """
    args = [
        str(ffprobe_path),
        "-v", "error",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        str(file_path),
    ]
    try:
        result = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise ProbeError(f"ffprobe timed out after {timeout_seconds}s") from exc
    except OSError as exc:
        raise ProbeError(f"Failed to execute ffprobe: {exc}") from exc

    if result.returncode != 0:
        raise ProbeError(f"ffprobe failed (exit {result.returncode}): {result.stderr.strip()[:500]}")

    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise ProbeError("ffprobe produced invalid JSON output") from exc

    streams = payload.get("streams", [])
    video_stream = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio_stream = next((s for s in streams if s.get("codec_type") == "audio"), None)
    fmt = payload.get("format", {})

    duration = None
    if fmt.get("duration") is not None:
        try:
            duration = float(fmt["duration"])
        except (TypeError, ValueError):
            duration = None
    elif video_stream and video_stream.get("duration") is not None:
        try:
            duration = float(video_stream["duration"])
        except (TypeError, ValueError):
            duration = None

    width = int(video_stream["width"]) if video_stream and video_stream.get("width") else None
    height = int(video_stream["height"]) if video_stream and video_stream.get("height") else None
    frame_rate = _parse_frame_rate(video_stream.get("avg_frame_rate") or video_stream.get("r_frame_rate")) if video_stream else None

    return MediaProbe(
        duration_seconds=duration,
        width=width,
        height=height,
        frame_rate=frame_rate,
        has_video=video_stream is not None,
        has_audio=audio_stream is not None,
        raw=payload,
    )
