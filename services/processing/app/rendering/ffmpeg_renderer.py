"""FFmpeg-based timeline renderer.

Builds a filter graph from a validated Timeline and executes it as a
safe subprocess argument array. Never concatenates model- or
user-supplied strings into a shell command; FFmpeg filter expressions
are built from numeric/validated fields only, and text overlay content
is escaped for the drawtext filter.
"""

from __future__ import annotations

import subprocess
import os
import sys
import tempfile
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from app.timeline.schema import Clip, Timeline


class RenderError(RuntimeError):
    pass


class RenderCancelled(RenderError):
    pass


@dataclass(frozen=True)
class RenderProgress:
    stage: str


def _fontfile_option() -> str:
    candidates = (
        [Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts" / "arial.ttf",
         Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts" / "segoeui.ttf"]
        if sys.platform == "win32"
        else [Path("/System/Library/Fonts/Supplemental/Arial.ttf")]
        if sys.platform == "darwin"
        else [Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"), Path("/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf")]
    )
    font_path = next((candidate for candidate in candidates if candidate.is_file()), None)
    if font_path is None:
        return ""
    escaped_path = str(font_path).replace("\\", "\\\\").replace(":", "\\:")
    return f"fontfile='{escaped_path}':"


def _atempo_chain(speed: float) -> str:
    """Build legal chained atempo filters (each factor must be 0.5–2)."""
    factors = []
    remaining = speed
    while remaining > 2.0:
        factors.append(2.0)
        remaining /= 2.0
    while remaining < 0.5:
        factors.append(0.5)
        remaining /= 0.5
    factors.append(remaining)
    return ",".join(f"atempo={factor:.6f}" for factor in factors)


def build_filter_graph(
    timeline: Timeline,
    media_paths: dict[str, Path],
    media_has_audio: dict[str, bool] | None = None,
    caption_text_paths: list[Path] | None = None,
) -> tuple[list[str], str, str, str]:
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

    ordered_clips = sorted(video_track.clips, key=lambda c: c.timeline_position_seconds)
    for index, clip in enumerate(ordered_clips):
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
        temperature_filter = (
            f",colorbalance=rs={color.temperature * 0.18:.3f}:bs={-color.temperature * 0.18:.3f}"
            if color.temperature
            else ""
        )
        stabilization_filter = ",deshake=rx=16:ry=16:edge=blank" if clip.stabilize else ""
        fade_in_filter = (
            f",fade=t=in:st=0:d={clip.transition_duration_seconds:.3f}"
            if clip.transition_in == "fade" and clip.transition_duration_seconds > 0
            else ""
        )

        video_filter = (
            f"[{index}:v]trim=start={clip.source_in_seconds:.3f}:end={clip.source_out_seconds:.3f},"
            f"setpts=(PTS-STARTPTS)/{clip.playback_speed:.6f},"
            f"scale={export.width}:{export.height}:force_original_aspect_ratio=increase,"
            f"crop={export.width}:{export.height}:"
            f"x=(iw-ow)*{clip.reframe_x:.4f}:y=(ih-oh)*{clip.reframe_y:.4f}"
            f"{eq_filter}{temperature_filter}{stabilization_filter}{fade_in_filter},"
            f"fps={export.frame_rate:.3f},settb=AVTB,format=yuv420p[{v_label}]"
        )
        filter_parts.append(video_filter)
        video_labels.append(f"[{v_label}]")

        audio = clip.audio
        if media_has_audio is not None and not media_has_audio.get(clip.source_media_id, False):
            audio_filter = (
                f"anullsrc=r=48000:cl=stereo,atrim=duration={clip.duration_seconds:.3f},"
                f"asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:channel_layouts=stereo[{a_label}]"
            )
        else:
            audio_filter = (
                f"[{index}:a]atrim=start={clip.source_in_seconds:.3f}:end={clip.source_out_seconds:.3f},"
                f"asetpts=PTS-STARTPTS,{_atempo_chain(clip.playback_speed)},"
                f"volume={10 ** (audio.gain_db / 20):.4f},aresample=48000,"
                f"aformat=sample_fmts=fltp:channel_layouts=stereo"
                f"{f',afade=t=in:st=0:d={clip.transition_duration_seconds:.3f}' if clip.transition_in == 'fade' and clip.transition_duration_seconds > 0 else ''}"
                f"[{a_label}]"
            )
        filter_parts.append(audio_filter)
        audio_labels.append(f"[{a_label}]")

    current_video = video_labels[0]
    current_audio = audio_labels[0]
    accumulated_duration = ordered_clips[0].duration_seconds
    for index, clip in enumerate(ordered_clips[1:], start=1):
        next_video = video_labels[index]
        next_audio = audio_labels[index]
        output_video = f"[joinv{index}]"
        output_audio = f"[joina{index}]"
        transition_duration = clip.transition_duration_seconds
        if clip.transition_in == "crossfade":
            if transition_duration <= 0 or transition_duration > min(accumulated_duration, clip.duration_seconds):
                raise RenderError(f"Invalid crossfade duration on clip {clip.id}")
            offset = accumulated_duration - transition_duration
            filter_parts.append(
                f"{current_video}{next_video}xfade=transition=fade:duration={transition_duration:.3f}:"
                f"offset={offset:.3f}{output_video}"
            )
            filter_parts.append(
                f"{current_audio}{next_audio}acrossfade=d={transition_duration:.3f}:c1=tri:c2=tri{output_audio}"
            )
            accumulated_duration += clip.duration_seconds - transition_duration
        else:
            filter_parts.append(f"{current_video}{next_video}concat=n=2:v=1:a=0{output_video}")
            filter_parts.append(f"{current_audio}{next_audio}concat=n=2:v=0:a=1{output_audio}")
            accumulated_duration += clip.duration_seconds
        current_video = output_video
        current_audio = output_audio

    video_output = current_video
    audio_output = current_audio
    caption_index = 0
    overlays = [overlay for track in timeline.tracks if track.kind == "text" for overlay in track.overlays]
    if overlays and (caption_text_paths is None or len(caption_text_paths) != len(overlays)):
        raise ValueError("A text file must be prepared for each caption overlay")
    for overlay, caption_path in zip(overlays, caption_text_paths or []):
        y_expression = {
            "top": "h*0.10",
            "center": "(h-text_h)/2",
            "bottom": "h-text_h-h*0.10",
        }[overlay.position]
        next_label = f"[caption{caption_index}]"
        filter_parts.append(
            f"{video_output}drawtext={_fontfile_option()}textfile='{caption_path.name}':expansion=none:fontcolor=white:"
            f"fontsize=h/18:borderw=3:bordercolor=black:x=(w-text_w)/2:y={y_expression}:"
            f"enable='between(t\\,{overlay.start_seconds:.3f}\\,{overlay.end_seconds:.3f})'{next_label}"
        )
        video_output = next_label
        caption_index += 1

    filter_complex = ";".join(filter_parts)
    return input_args, filter_complex, video_output, audio_output


def render_timeline(
    ffmpeg_path: Path,
    timeline: Timeline,
    media_paths: dict[str, Path],
    output_path: Path,
    on_progress=None,
    cancelled: Callable[[], bool] | None = None,
    media_has_audio: dict[str, bool] | None = None,
) -> Path:
    overlays = [overlay for track in timeline.tracks if track.kind == "text" for overlay in track.overlays]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="reelforge-captions-", dir=output_path.parent) as caption_dir:
        caption_paths = []
        for index, overlay in enumerate(overlays):
            caption_path = Path(caption_dir) / f"caption-{index:04d}.txt"
            caption_path.write_text(overlay.text, encoding="utf-8", newline="\n")
            caption_paths.append(caption_path)
        return _render_timeline_with_caption_files(
            ffmpeg_path,
            timeline,
            media_paths,
            output_path,
            caption_paths,
            on_progress=on_progress,
            cancelled=cancelled,
            media_has_audio=media_has_audio,
        )


def _render_timeline_with_caption_files(
    ffmpeg_path: Path,
    timeline: Timeline,
    media_paths: dict[str, Path],
    output_path: Path,
    caption_text_paths: list[Path],
    on_progress=None,
    cancelled: Callable[[], bool] | None = None,
    media_has_audio: dict[str, bool] | None = None,
) -> Path:
    """Render the given timeline to `output_path` using FFmpeg.

    `on_progress` is an optional callable(RenderProgress) invoked at
    coarse stage boundaries. FFmpeg's own byte/time progress is not
    parsed yet; callers should treat this as stage-only progress, not a
    percentage, per the no-invented-progress rule.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    input_args, filter_complex, video_out, audio_out = build_filter_graph(
        timeline, media_paths, media_has_audio, caption_text_paths
    )

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

    with tempfile.TemporaryFile(mode="w+t", encoding="utf-8") as stderr_file:
        caption_work_dir = caption_text_paths[0].parent if caption_text_paths else None
        process = subprocess.Popen(
            args,
            stdout=subprocess.DEVNULL,
            stderr=stderr_file,
            text=True,
            cwd=caption_work_dir,
        )
        started = time.monotonic()
        while process.poll() is None:
            if cancelled and cancelled():
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
                output_path.unlink(missing_ok=True)
                raise RenderCancelled("Render cancelled")
            if time.monotonic() - started > 600.0:
                process.kill()
                process.wait()
                stderr_file.seek(0)
                stderr = stderr_file.read()
                output_path.unlink(missing_ok=True)
                raise RenderError(f"ffmpeg render timed out: {stderr.strip()[-2000:]}")
            time.sleep(0.1)
        stderr_file.seek(0)
        stderr = stderr_file.read()
    if process.returncode != 0:
        output_path.unlink(missing_ok=True)
        raise RenderError(f"ffmpeg render failed (exit {process.returncode}): {stderr.strip()[-2000:]}")

    if not output_path.exists() or output_path.stat().st_size == 0:
        raise RenderError("ffmpeg reported success but produced no output file")

    if on_progress:
        on_progress(RenderProgress(stage="complete"))

    return output_path
