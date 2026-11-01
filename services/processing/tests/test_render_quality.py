import subprocess

from app.rendering.quality_analysis import analyze_render_quality


def test_render_quality_flags_black_segments_and_near_clipping_audio(
    ffmpeg_path, tmp_path
):
    output = tmp_path / "quality-sample.mp4"
    command = [
        str(ffmpeg_path), "-y",
        "-f", "lavfi", "-i", "color=c=white:s=320x240:d=0.7:r=24",
        "-f", "lavfi", "-i", "color=c=black:s=320x240:d=0.5:r=24",
        "-f", "lavfi", "-i", "color=c=white:s=320x240:d=0.7:r=24",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=1.9",
        "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v];[3:a]volume=10[a]",
        "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-c:a", "aac",
        "-shortest", str(output),
    ]
    result = subprocess.run(command, capture_output=True, text=True, timeout=60)
    assert result.returncode == 0, result.stderr

    report = analyze_render_quality(ffmpeg_path, output)
    assert report["available"] is True
    assert report["black_segments"]
    assert report["max_volume_dbfs"] is not None
    assert report["max_volume_dbfs"] >= -0.1
    assert report["integrated_loudness_lufs"] is not None
    assert report["true_peak_dbfs"] is not None
    assert len(report["warnings"]) == 2


def test_render_progress_dataclass_and_time_parser():
    from app.rendering.ffmpeg_renderer import RenderProgress, _parse_time_str

    prog = RenderProgress(
        stage="encoding",
        percent=0.452,
        frames=135,
        fps=30.0,
        speed="1.5x",
        eta_seconds=12.4,
    )
    assert prog.stage == "encoding"
    assert prog.percent == 0.452
    assert prog.frames == 135
    assert prog.speed == "1.5x"
    assert prog.eta_seconds == 12.4

    assert _parse_time_str("00:01:30.500000") == 90.5
    assert _parse_time_str("01:00:00.000000") == 3600.0
    assert _parse_time_str("invalid") is None
