# Development setup

## Prerequisites

- **Node.js 20+** and npm (tested with Node v24.16.0 / npm 11.13.0)
- **Python 3.12** — use exactly 3.12. Python 3.13/3.14 are too new for prebuilt wheels of `opencv-python-headless` and (in later phases) PyTorch; don't let `py` default to a newer interpreter.
- **Git**

FFmpeg and FFprobe are bundled via the `ffmpeg-ffprobe-static` npm package (installed as part of the desktop app's dependencies) — no system install needed, and this is also how they'll ship in the packaged app.

## Desktop app (Electron + React + TypeScript)

```bash
cd apps/desktop
npm install
```

Key scripts:

| Command | Purpose |
|---|---|
| `npm run start` | Launch Electron in dev mode (Vite dev server + HMR for the renderer; main/preload rebuild on change but require a full relaunch to take effect) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `oxlint` + `oxfmt --check` |
| `npm run lint:fix` | Auto-fix lint + formatting |
| `npm run package` / `npm run make` | Electron Forge packaging (not yet validated on a clean machine — see known-limitations.md) |

## Processing service (Python + FastAPI)

```bash
cd services/processing
py -3.12 -m venv .venv
./.venv/Scripts/pip install -e ".[dev]"
```

`pyproject.toml` lists direct dependencies with version ranges; `requirements-lock.txt` has the exact resolved versions from the last successful install, for reference.

Run tests:

```bash
./.venv/Scripts/python -m pytest
```

The test suite synthesizes its own video fixtures with FFmpeg's `lavfi` test sources (`color=`, `sine=`) — it never depends on real/licensed footage or network access.

### Why a venv instead of a bundled interpreter in dev

The Electron main process (`src/main/paths.ts`) locates the processing service's Python interpreter at `services/processing/.venv/Scripts/python.exe` relative to the repo root in dev mode. If you recreate the venv elsewhere or under a different name, update that resolution or set `REELFORGE_PYTHON_PATH`-equivalent logic there. Packaged builds will bundle a self-contained Python instead (tracked in known-limitations.md — not implemented yet).

## Running the whole app

```bash
cd apps/desktop
npm run start
```

Electron's main process spawns the processing service as a child process on startup: it picks a free loopback port, generates a random per-launch bearer token, passes both via environment variables, and waits for a `REELFORGE_SERVICE_READY` line on stdout before considering it up. The service is torn down (SIGTERM, then SIGKILL after a grace period) when the app quits — no orphaned processes.

Runtime data (SQLite DB, imported/reference media, thumbnails, exports, training input, logs) lives under Electron's `userData` path, e.g. `%APPDATA%\ReelForge AI\` on Windows.

## Troubleshooting

- **"Unable to find Electron app... Cannot find module '...\\.vite\\build\\main.cjs'"**: the Vite build output filename didn't match `package.json`'s `main` field. This happened once during initial scaffolding because both the main and preload entry files were named `index.ts`, so Vite's default lib-build naming produced `index.cjs` for both and one clobbered the other. Fixed by pinning `build.rollupOptions.output.entryFileNames` explicitly in `vite.main.config.mts` / `vite.preload.config.mts`. If you see this again after restructuring entry files, check those configs first.
- **Electron window opens but the app never leaves "Starting processing service…"**: check `%APPDATA%\ReelForge AI\logs\processing-service.stdout.log` and `main-process-crash.log`. Common cause: venv not created at the expected path, or ffmpeg/ffprobe binaries missing from `apps/desktop/node_modules/ffmpeg-ffprobe-static/`.
- **`python` / `python3` resolves to a Microsoft Store stub on Windows**: use the `py` launcher or an absolute path to a real interpreter instead.
