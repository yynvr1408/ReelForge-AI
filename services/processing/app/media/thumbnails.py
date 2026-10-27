"""Thumbnail extraction via FFmpeg."""

from __future__ import annotations

import subprocess
from pathlib import Path


class ThumbnailError(RuntimeError):
    pass


def extract_thumbnail(
    ffmpeg_path: Path,
    source_path: Path,
    output_path: Path,
    timestamp_seconds: float = 1.0,
    width: int = 480,
) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    args = [
        str(ffmpeg_path),
        "-y",
        "-ss", str(max(timestamp_seconds, 0.0)),
        "-i", str(source_path),
        "-frames:v", "1",
        "-vf", f"scale={width}:-1",
        str(output_path),
    ]
    result = subprocess.run(args, capture_output=True, text=True, timeout=30.0, check=False)
    if result.returncode != 0 or not output_path.exists():
        raise ThumbnailError(f"ffmpeg thumbnail extraction failed: {result.stderr.strip()[:500]}")
    return output_path
