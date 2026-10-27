"""Typed, versioned timeline schema.

The timeline is the authoritative description of the intended edit.
The renderer only ever executes a validated `Timeline` instance — it
never interprets free-form instructions or model output directly.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

TIMELINE_SCHEMA_VERSION = 1


class ColorAdjustment(BaseModel):
    exposure: float = 0.0
    contrast: float = 0.0
    saturation: float = 0.0
    temperature: float = 0.0


class TextOverlay(BaseModel):
    text: str
    start_seconds: float
    end_seconds: float
    position: Literal["top", "center", "bottom"] = "bottom"

    @field_validator("end_seconds")
    @classmethod
    def end_after_start(cls, v: float, info):
        start = info.data.get("start_seconds")
        if start is not None and v <= start:
            raise ValueError("end_seconds must be greater than start_seconds")
        return v


class AudioAdjustment(BaseModel):
    gain_db: float = 0.0
    fade_in_seconds: float = 0.0
    fade_out_seconds: float = 0.0


class Clip(BaseModel):
    id: str
    source_media_id: str
    source_in_seconds: float = Field(ge=0)
    source_out_seconds: float = Field(gt=0)
    timeline_position_seconds: float = Field(ge=0)
    playback_speed: float = Field(default=1.0, gt=0)
    color: ColorAdjustment = Field(default_factory=ColorAdjustment)
    audio: AudioAdjustment = Field(default_factory=AudioAdjustment)
    transition_in: Literal["none", "cut", "fade", "crossfade"] = "cut"
    transition_duration_seconds: float = 0.0

    @field_validator("source_out_seconds")
    @classmethod
    def out_after_in(cls, v: float, info):
        in_point = info.data.get("source_in_seconds")
        if in_point is not None and v <= in_point:
            raise ValueError("source_out_seconds must be greater than source_in_seconds")
        return v

    @property
    def duration_seconds(self) -> float:
        return (self.source_out_seconds - self.source_in_seconds) / self.playback_speed


class Track(BaseModel):
    id: str
    kind: Literal["video", "audio", "text"]
    clips: list[Clip] = Field(default_factory=list)
    overlays: list[TextOverlay] = Field(default_factory=list)


class ExportSettings(BaseModel):
    width: int = Field(gt=0, default=1080)
    height: int = Field(gt=0, default=1920)
    frame_rate: float = Field(gt=0, default=30.0)
    video_codec: str = "libx264"
    audio_codec: str = "aac"
    container: Literal["mp4"] = "mp4"
    crf: int = Field(ge=0, le=51, default=20)


class Timeline(BaseModel):
    schema_version: int = TIMELINE_SCHEMA_VERSION
    tracks: list[Track] = Field(default_factory=list)
    export_settings: ExportSettings = Field(default_factory=ExportSettings)

    @property
    def total_duration_seconds(self) -> float:
        end_times = [
            clip.timeline_position_seconds + clip.duration_seconds
            for track in self.tracks
            for clip in track.clips
        ]
        return max(end_times, default=0.0)
