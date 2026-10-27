# Implementation log

Reverse-chronological. Each entry: what changed, key files, what was verified.

## 2026-10-27 — Phase 0/1 + first vertical slice + training-folder staging

**Environment inspected**: Node v24.16.0, npm 11.13.0, Python 3.14.6 (default) + Python 3.12.10 (also installed), no system FFmpeg, git 2.54.0, Windows 11. Decided to pin the processing-service venv to Python 3.12 (ML wheel availability) and bundle FFmpeg/FFprobe via the `ffmpeg-ffprobe-static` npm package rather than requiring a system install.

**Scaffolded**:
- `apps/desktop/` via Electron Forge's official Vite+TypeScript template, restructured into `src/main/`, `src/preload/`, `src/renderer/{app,components,features,hooks,services,stores,types}` per the spec's project layout
- `services/processing/` as a FastAPI service with its own `pyproject.toml`, pinned direct dependencies (fastapi, uvicorn, pydantic, sqlalchemy, scenedetect, opencv-python-headless, numpy)

**Implemented and tested** (13 pytest tests passing, including a full end-to-end workflow against real FFmpeg/PySceneDetect with synthetic `lavfi`-generated fixtures — no mocks, no licensed media):
- FFprobe-based media probing with safe subprocess arg arrays (`app/media/ffprobe.py`)
- Thumbnail extraction (`app/media/thumbnails.py`)
- Scene-cut detection via PySceneDetect ContentDetector (`app/analysis/scene_detection.py`)
- Style profile aggregation across one or more analyzed references (`app/style_profiles/aggregator.py`)
- Typed, versioned Pydantic timeline schema + semantic cross-reference validation (`app/timeline/`)
- Rule-based editing planner (no LLM) — sequential clips at profile-derived shot duration, fitted to a target duration (`app/editing_planner/rule_based.py`)
- FFmpeg filter-graph renderer (trim/scale/crop/color-eq/concat) run as a background job, with FFprobe-based output re-validation (duration/dimensions/audio-presence tolerance checks) — a render is never marked successful without this (`app/rendering/`)
- SQLite persistence via SQLAlchemy (projects, media assets, reference videos, style profiles, render jobs, feedback entries) with a schema-migration-version table
- Bearer-token auth (random per-launch token) + loopback-only binding + restrictive CORS (`app/security/auth.py`, `app/api/app.py`)

**Electron main process**:
- Python service lifecycle: free-port allocation, random token generation, spawn with `REELFORGE_*` env vars, readiness handshake via a `REELFORGE_SERVICE_READY` stdout line, graceful SIGTERM→SIGKILL shutdown on app quit, structured log forwarding to `userData/logs/`
- Security: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, per-environment CSP (relaxed only for Vite's dev HMR, strict in prod), navigation/window-open restrictions routing external links to the OS browser
- Full typed IPC allowlist (`src/shared/ipc-contract.ts` + `src/main/ipcHandlers.ts` + `src/preload/index.ts`) — the renderer has no Node/network/filesystem access outside these channels; the processing service's auth token never leaves the main process

**Renderer (React + Tailwind v4)**: Dashboard, Projects, Media Library, Reference Library, Style Library, Editor (the full create-project → import → analyze → profile → generate → render → save workflow), Render Queue, Settings, Training Studio. Model Manager is an explicit "not implemented" placeholder.

**Bug found and fixed during manual verification**: moving the main/preload entry files to `src/main/index.ts` / `src/preload/index.ts` made Vite's default lib-build output naming collide — both built to `.vite/build/index.cjs`, clobbering one another, while `package.json`'s `main` field still pointed at the old `main.cjs`. Electron's own error dialog ("Cannot find module '...\\.vite\\build\\main.cjs'") caught this. Fixed by pinning `build.rollupOptions.output.entryFileNames` explicitly in `vite.main.config.mts` (`main.cjs`) and `vite.preload.config.mts` (`preload.cjs`). Documented in `docs/development/setup.md` troubleshooting.

**Training-folder staging** (requested mid-session): added a real, user-visible `training/input/` directory under the app's data dir. New backend endpoints (`/training/input-reels` list/import/delete, `/storage` for all configured locations) and renderer pages (Training Studio, Settings) let the user add/remove reels there and open the folder directly in Explorer. The "Train" action is present but disabled with an explanation — actual training is unbuilt (Phase 9 proper: dataset manifests, task/model selection, checkpoints, evaluation). Covered by 2 new pytest tests.

**Manually verified**: launched the packaged dev app (`npm run start`), confirmed the Python service starts and reaches ready state (checked via `userData/logs/processing-service.stdout.log` and process inspection), no entries in the crash log. Did not yet manually click through every screen of the UI in this session — automated coverage is the FastAPI integration test, not a browser/Electron UI test.

**Not done this session**: Playwright/Electron e2e tests, audio/color reference analysis, NL editing, preference learning, model manager, generative AI, security review pass, packaging validation, most of the docs/ tree (architecture decisions, test strategy, training guide, user guides, release process), CONTRIBUTING.md.

**Current milestone**: Phase 1 (Electron foundation) tested; Phase 5 (timeline + rendering) tested via the full workflow; Phase 9 (Training Studio) in progress with real folder staging only.

**Next recommended task**: audio analysis (beat/silence detection) to stop the editing planner being video-duration-only, or a security review pass before any further feature work — see `docs/development/implementation-roadmap.md`.
