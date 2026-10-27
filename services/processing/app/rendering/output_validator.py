"""Post-render output validation.

A render job is never marked successful until its output file has
been independently re-probed and checked against the requested export
settings, within reasonable tolerances.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app.media.ffprobe import ProbeError, probe_media
from app.timeline.schema import ExportSettings

DURATION_TOLERANCE_SECONDS = 1.0
DIMENSION_TOLERANCE_PX = 2


@dataclass(frozen=True)
class OutputValidation:
    is_valid: bool
    issues: list[str]
    probe: dict


def validate_render_output(
    ffprobe_path: Path,
    output_path: Path,
    expected_duration_seconds: float,
    export_settings: ExportSettings,
) -> OutputValidation:
    issues: list[str] = []

    if not output_path.exists():
        return OutputValidation(is_valid=False, issues=["Output file does not exist"], probe={})

    try:
        probe = probe_media(ffprobe_path, output_path)
    except ProbeError as exc:
        return OutputValidation(is_valid=False, issues=[f"Output file failed re-probe: {exc}"], probe={})

    if not probe.has_video:
        issues.append("Output has no video stream")
    if not probe.has_audio:
        issues.append("Output has no audio stream")

    if probe.duration_seconds is None:
        issues.append("Output duration could not be determined")
    elif abs(probe.duration_seconds - expected_duration_seconds) > max(
        DURATION_TOLERANCE_SECONDS, expected_duration_seconds * 0.05
    ):
        issues.append(
            f"Output duration {probe.duration_seconds:.2f}s differs from expected "
            f"{expected_duration_seconds:.2f}s beyond tolerance"
        )

    if probe.width is not None and abs(probe.width - export_settings.width) > DIMENSION_TOLERANCE_PX:
        issues.append(f"Output width {probe.width} does not match requested {export_settings.width}")
    if probe.height is not None and abs(probe.height - export_settings.height) > DIMENSION_TOLERANCE_PX:
        issues.append(f"Output height {probe.height} does not match requested {export_settings.height}")

    return OutputValidation(is_valid=not issues, issues=issues, probe=probe.raw)
