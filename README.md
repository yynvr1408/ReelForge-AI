# ReelForge AI

[![Release](https://img.shields.io/badge/release-v1.0.0-orange.svg)](CHANGELOG.md)
[![Platform](https://img.shields.io/badge/platform-Windows%20x64-blue.svg)](releases/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Architecture](https://img.shields.io/badge/architecture-Offline--First%20%7C%20Non--Generative-brightgreen.svg)](FEATURES.md)

**ReelForge AI** is an offline-first desktop video editor with reference-video style learning. Built with Electron, React, TypeScript, a local Python processing engine, and bundled FFmpeg.

---

## Highlights

* **Original-Pixel Editing**: Strictly non-generative. Preserves authentic camera footage, colors, and textures without synthesizing deepfakes, AI faces, or artificial hallucinations.
* **Reference Style Learning**: Automatically extracts scene cuts, shot duration cadence, and rhythm from viral short-form reels to guide your timeline edits.
* **Local Pacing ML Intelligence**: Trains an offline CPU logistic regression model on your footage and editing feedback to personalize cut timing.
* **Multi-Track Timeline**: Features beat-snapping, dialogue auto-captions, creative color presets, per-clip audio control (-24 dB to +12 dB), and 50-step undo/redo.
* **Simplified Folder Navigation**: Direct Windows File Explorer shortcuts, disk capacity meters, and native OS drag-and-drop.
* **Updates & Rollback**: Clean in-app update checks, 1-click version rollback, and offline installer management.

For full feature details, see [FEATURES.md](FEATURES.md).  
For the latest version history and release notes, see [CHANGELOG.md](CHANGELOG.md).

---

## Version Snapshots

Every updated release maintains its full documentation snapshot in [`docs/readme-versions/`](docs/readme-versions/):

| Version | Release Date | Summary | Documentation |
| :---: | :---: | :--- | :---: |
| **v1.0.0** | 2026-11-13 | Production baseline: Clean updates UI, rollback engine, local builds | [README-v1.0.0.md](docs/readme-versions/README-v1.0.0.md) |
| **v0.3.0** | 2026-11-13 | Training dataset pipeline, folder navigation, native drag-and-drop | [README-v0.3.0.md](docs/readme-versions/README-v0.3.0.md) |
| **v0.2.2** | 2026-10-30 | Color grading presets, audio controls, social export aspect ratios | [README-v0.2.2.md](docs/readme-versions/README-v0.2.2.md) |
| **v0.2.1** | 2026-10-29 | Post-render quality scans, 50-step undo/redo, build hardening | [README-v0.2.1.md](docs/readme-versions/README-v0.2.1.md) |
| **v0.2.0** | 2026-10-28 | Beat snapping, dialogue auto-captions, in-app updates tab | [README-v0.2.0.md](docs/readme-versions/README-v0.2.0.md) |

---

## Installation & Releases

Pre-built Windows installers are available in the local [`releases/`](releases/) directory and on [GitHub Releases](https://github.com/yynvr1408/reelforge-ai-releases/releases):

- **v1.0.0 Installer**: `releases/ReelForge AI-1.0.0 Setup.exe`

---

## Repository Layout

```text
apps/desktop/        Electron + React + TypeScript app (main, preload, renderer)
services/processing/ Python FastAPI processing engine (media analysis, timeline, rendering)
releases/            Local offline Windows installer executables (*.exe)
docs/                Architecture, user guide, releases, and readme snapshots
CHANGELOG.md         Version history and release notes
FEATURES.md          Complete product features documentation
```

---

## Development Setup

### Prerequisites
- Node.js 20+ and npm
- Python 3.12 (in a virtual environment)
- Git

FFmpeg and FFprobe are bundled automatically via `ffmpeg-ffprobe-static`.

### Running in Development
```bash
# 1. Install desktop dependencies
cd apps/desktop
npm install

# 2. Setup processing service venv
cd ../../services/processing
python -m venv .venv
.\.venv\Scripts\pip install -e ".[dev,build]"

# 3. Launch application
cd ../../apps/desktop
npm run start
```

### Verification & Testing
```bash
# Backend test suite (93 unit & integration tests)
cd services/processing
.\.venv\Scripts\python -m pytest

# Frontend typechecking & linting
cd apps/desktop
npm run typecheck
npm run lint
```

### Building Releases
```bash
# Build standalone Windows installer package (.exe)
cd apps/desktop
npm run make
```

---

## Security

See [SECURITY.md](SECURITY.md). Electron is locked down with `contextIsolation: true`, `sandbox: true`, and `nodeIntegration: false`. The renderer communicates exclusively via a strict typed IPC allowlist.
