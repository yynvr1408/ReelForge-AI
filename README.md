# ReelForge AI

AI-assisted desktop video editor with reference-video style learning. Electron + React + TypeScript frontend, local Python/FastAPI processing service, FFmpeg rendering, SQLite persistence.

Full product specification: [ReelForge_AI_Claude_Code_Master_Prompt.md](ReelForge_AI_Claude_Code_Master_Prompt.md).

## Current status

A working vertical slice is implemented and tested end-to-end: create a project, import a reference video, detect scene cuts, build a style profile, import source footage, generate a rule-based timeline, render it with FFmpeg, and validate the output — all offline, no cloud dependency. See [docs/development/implementation-roadmap.md](docs/development/implementation-roadmap.md) for what's built versus planned, and [docs/development/known-limitations.md](docs/development/known-limitations.md) for honest gaps.

## Repository layout

```text
apps/desktop/        Electron + React + TypeScript app (main, preload, renderer)
services/processing/ Python FastAPI processing service (media analysis, timeline, rendering)
packages/             Shared type/schema packages (see packages/shared-types/README.md)
docs/                 Architecture, development, testing, training, user-guide docs
scripts/              Dev/validation/packaging scripts
tests/                Cross-cutting fixtures and integration tests
```

## Prerequisites

- Node.js 20+ and npm
- Python 3.12 (3.13/3.14 are too new for some ML wheels used in later phases — stick to 3.12 for the processing service venv)
- Git

FFmpeg/FFprobe are **not** required system-wide — they're bundled via the `ffmpeg-ffprobe-static` npm package and resolved automatically.

## Setup

See [docs/development/setup.md](docs/development/setup.md) for full instructions. Quick version:

```bash
# Desktop app
cd apps/desktop
npm install

# Processing service
cd ../../services/processing
py -3.12 -m venv .venv
./.venv/Scripts/pip install -e ".[dev]"
```

## Running in development

```bash
cd apps/desktop
npm run start
```

This launches Electron, which spawns the Python processing service as a child process automatically (binding to loopback only, with a per-launch random auth token). No separate terminal is needed for the backend.

## Testing

```bash
# Backend (unit + integration, including a full render using synthetic FFmpeg test clips)
cd services/processing
./.venv/Scripts/python -m pytest

# Frontend typecheck + lint
cd apps/desktop
npm run typecheck
npm run lint
```

## Security

See [SECURITY.md](SECURITY.md). Electron is configured with `contextIsolation`, `sandbox`, and `nodeIntegration: false`; the renderer reaches the processing service only through a fixed, typed IPC allowlist — never direct HTTP, Node, or shell access.
