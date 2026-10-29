# Offline-First Operation Guide

ReelForge AI is engineered from the ground up to operate completely without an internet connection.

## Offline Capabilities

All core editing functionality runs strictly locally:
- **Local SQLite Database**: All projects, metadata, versions, and feedback reside in `%APPDATA%\ReelForge AI\reelforge.db`.
- **Bundled Processing Binaries**:
  - The Python service runs via the local venv in development and a frozen self-contained executable in production (`resources/rf/reelforge-processing.exe`).
  - FFmpeg and FFprobe are bundled statically within `resources/ffmpeg-ffprobe-static/`.
- **Offline Natural-Language Brief Parsing**: The built-in rule-based parser handles aspect ratios, target durations, pacing, audio priority, color preservation, and shake avoidance without contacting external servers.
- **Offline Reference Analysis & Pacing**: PySceneDetect and local signal algorithms analyze cuts, motion, color, and audio energy completely on-device.
- **Offline Model Training**: The Training Studio trains the logistic preference classifier on your local CPU without sending telemetry or data outward.

## Optional Online Enhancements

When an internet connection is available and configured:
- **Cloud LLMs**: Optional OpenAI adapters can be configured in the Editor for more conversational brief parsing. If the network drops or API keys are omitted, the editor automatically falls back to the offline rule-based parser.
- **Application Updates**: Electron's Squirrel update mechanism checks for signed releases on GitHub when online.
