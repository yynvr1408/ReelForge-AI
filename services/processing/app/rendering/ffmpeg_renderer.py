"""FFmpeg-based timeline renderer.

Builds a filter graph from a validated Timeline and executes it as a
safe subprocess argument array. Never concatenates model- or
user-supplied strings into a shell command; FFmpeg filter expressions
are built from numeric/validated fields only, and text overlay content
is escaped for the drawtext filter.
"""

from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path

from app.timeline.schema import Clip, Timeline


class RenderError(RuntimeError):
    pass


@dataclass(frozen=True)
class RenderProgress:
    stage: str


def _escape_drawtext(text: str) -> str:
    return text.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")


def build_filter_graph(timeline: Timeline, media_paths: dict[str, Path]) -> tuple[list[str], str, str]:
    """Build the ffmpeg input args and filter_complex graph for a timeline.

    Returns (input_args, filter_complex, final_video_label, final_audio_label)
    collapsed into (input_args, filter_complex_str, video_out, audio_out)
    via a 4-tuple below for clarity.
    """
    video_track = next((t for t in timeline.tracks if t.kind == "video" and t.clips), None)
    if video_track is None:
        raise RenderError("Timeline has no video track with clips")

    export = timeline.export_settings
    input_args: list[str] = []
    filter_parts: list[str] = []
    video_labels: list[str] = []
    audio_labels: list[str] = []

    for index, clip in enumerate(sorted(video_track.clips, key=lambda c: c.timeline_position_seconds)):
        source_path = media_paths.get(clip.source_media_id)
        if source_path is None:
            raise RenderError(f"No resolved file path for media {clip.source_media_id}")

        input_args.extend(["-i", str(source_path)])

        v_label = f"v{index}"
        a_label = f"a{index}"

        color = clip.color
        eq_parts = []
        if color.exposure:
            eq_parts.append(f"brightness={color.exposure:.3f}")
        if color.contrast:
            eq_parts.append(f"contrast={1.0 + color.contrast:.3f}")
        if color.saturation:
            eq_parts.append(f"saturation={1.0 + color.saturation:.3f}")
        eq_filter = f",eq={':'.join(eq_parts)}" if eq_parts else ""

        video_filter = (
            f"[{index}:v]trim=start={clip.source_in_seconds:.3f}:end={clip.source_out_seconds:.3f},"
            f"setpts=PTS-STARTPTS,"
            f"scale={export.width}:{export.height}:force_original_aspect_ratio=increase,"
            f"crop={export.width}:{export.height}"
            f"{eq_filter},fps={export.frame_rate:.3f}[{v_label}]"
        )
        filter_parts.append(video_filter)
        video_labels.append(f"[{v_label}]")

        audio = clip.audio
        audio_filter = (
            f"[{index}:a]atrim=start={clip.source_in_seconds:.3f}:end={clip.source_out_seconds:.3f},"
            f"asetpts=PTS-STARTPTS,volume={10 ** (audio.gain_db / 20):.4f}[{a_label}]"
        )
        filter_parts.append(audio_filter)
        audio_labels.append(f"[{a_label}]")

    concat_inputs = "".join(f"{v}{a}" for v, a in zip(video_labels, audio_labels))
    n_clips = len(video_labels)
    filter_parts.append(f"{concat_inputs}concat=n={n_clips}:v=1:a=1[outv][outa]")

    filter_complex = ";".join(filter_parts)
    return input_args, filter_complex, "[outv]", "[outa]"


def render_timeline(
    ffmpeg_path: Path,
    timeline: Timeline,
    media_paths: dict[str, Path],
    output_path: Path,
    on_progress=None,
) -> Path:
    """Render the given timeline to `output_path` using FFmpeg.

    `on_progress` is an optional callable(RenderProgress) invoked at
    coarse stage boundaries. FFmpeg's own byte/time progress is not
    parsed yet; callers should treat this as stage-only progress, not a
    percentage, per the no-invented-progress rule.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    input_args, filter_complex, video_out, audio_out = build_filter_graph(timeline, media_paths)

    if on_progress:
        on_progress(RenderProgress(stage="building_filter_graph"))

    export = timeline.export_settings
    args = [
        str(ffmpeg_path),
        "-y",
        *input_args,
        "-filter_complex", filter_complex,
        "-map", video_out,
        "-map", audio_out,
        "-c:v", export.video_codec,
        "-crf", str(export.crf),
        "-c:a", export.audio_codec,
        "-movflags", "+faststart",
        str(output_path),
    ]

    if on_progress:
        on_progress(RenderProgress(stage="encoding"))

    result = subprocess.run(args, capture_output=True, text=True, timeout=600.0, check=False)
    if result.returncode != 0:
        raise RenderError(f"ffmpeg render failed (exit {result.returncode}): {result.stderr.strip()[-2000:]}")

    if not output_path.exists() or output_path.stat().st_size == 0:
        raise RenderError("ffmpeg reported success but produced no output file")

    if on_progress:
        on_progress(RenderProgress(stage="complete"))

    return output_path
