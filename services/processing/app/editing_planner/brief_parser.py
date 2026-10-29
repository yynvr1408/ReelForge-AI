"""Small offline parser for explicit, auditable editing constraints.

This is intentionally not an open-ended AI model. It recognizes a bounded set
of duration, aspect-ratio, and pacing phrases and reports what it understood.
"""

from __future__ import annotations

import re


def parse_editing_brief(text: str | None) -> dict:
    brief = (text or "").strip().lower()
    parsed: dict = {"recognized": [], "not_yet_supported": []}
    duration = re.search(r"\b(\d+(?:\.\d+)?)\s*[- ]?\s*(seconds?|secs?|minutes?|mins?)\b", brief)
    if duration:
        value = float(duration.group(1))
        if duration.group(2).startswith(("minute", "min")):
            value *= 60
        if 1 <= value <= 900:
            parsed["target_duration_seconds"] = value
            parsed["recognized"].append(f"target duration: {value:g} seconds")

    if any(term in brief for term in ("vertical", "portrait", "9:16")):
        parsed["aspect_ratio"] = "vertical"
        parsed["recognized"].append("vertical 9:16 export")
    elif any(term in brief for term in ("horizontal", "landscape", "16:9")):
        parsed["aspect_ratio"] = "horizontal"
        parsed["recognized"].append("horizontal 16:9 export")
    elif any(term in brief for term in ("square", "1:1")):
        parsed["aspect_ratio"] = "square"
        parsed["recognized"].append("square 1:1 export")

    if any(term in brief for term in ("fast cuts", "quick cuts", "punchy", "rapid")):
        parsed["shot_duration_seconds"] = 1.5
        parsed["recognized"].append("faster 1.5-second shot pacing")
    elif any(term in brief for term in ("slow cuts", "slower", "cinematic", "longer shots")):
        parsed["shot_duration_seconds"] = 4.0
        parsed["recognized"].append("slower 4-second shot pacing")

    if "keep original colors" in brief or "preserve original colors" in brief:
        parsed["preserve_original_colors"] = True
        parsed["recognized"].append("preserve source colors")
    if any(term in brief for term in ("prioritize music", "prioritise music", "music priority", "music-first")):
        parsed["audio_priority"] = "rhythmic_activity"
        parsed["recognized"].append("prefer source moments with more rhythmic audio activity (heuristic; not beat sync)")
    if any(term in brief for term in ("prioritize speech", "prioritise speech", "speech priority", "prioritize dialogue", "prioritise dialogue", "dialogue-first")):
        parsed["audio_priority"] = "speech_like_activity"
        parsed["recognized"].append("prefer source moments with speech-like audio activity (heuristic; not speech recognition)")
    if any(term in brief for term in ("avoid shaky", "avoid camera shake", "prefer stable footage", "stabilized footage", "stabilised footage")):
        parsed["avoid_shake_candidates"] = True
        parsed["recognized"].append("down-rank coarse motion-instability candidates (heuristic; review clips)")
    if any(term in brief for term in ("beat", "music sync", "sync to music")):
        parsed["not_yet_supported"].append("exact music beat alignment")
    if any(term in brief for term in ("speech", "dialogue", "spoken words")) and parsed.get("audio_priority") != "speech_like_activity":
        parsed["not_yet_supported"].append("speech-aware pacing and reliable speech detection")
    if any(term in brief for term in ("shaky", "shake", "stabilize", "stabilise")) and not parsed.get("avoid_shake_candidates"):
        parsed["not_yet_supported"].append("reliable camera-shake detection and complete avoidance")
    return parsed
