# Release process

## How it works

1. **CI** (`.github/workflows/ci.yml`) runs on every push/PR to `main`/`master`: processing-service pytest, desktop typecheck/lint, and a packaging smoke test (`electron-forge package`, not a full installer build).
2. **Release** (`.github/workflows/release.yml`) runs only when a tag matching `v*.*.*` is pushed. It builds the Windows Squirrel installer and publishes it as a GitHub Release via `electron-forge release` (which uses `@electron-forge/publisher-github`, configured in `apps/desktop/forge.config.mts`).
3. **Auto-update**: the packaged app calls `updateElectronApp()` (from the `update-electron-app` package, wired in `apps/desktop/src/main/index.ts`, dev-mode no-op) on startup and then every hour. It talks to Electron's public update service (`update.electronjs.org`), which reads your GitHub Releases' Squirrel artifacts (`RELEASES`, `*.nupkg`) directly — no separate update server to run.

## Cutting a release

1. Bump the version in `apps/desktop/package.json` (`"version"`) and commit it.
2. Tag and push:
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```
   The tag **must** match the `package.json` version exactly (the release workflow checks this and fails fast if it doesn't — Squirrel's update feed keys off the version number, so a mismatch would silently break updates for existing installs).
3. The `release` workflow builds and publishes automatically. No extra GitHub secret setup is needed — it uses the default `GITHUB_TOKEN` that Actions provides, scoped to `contents: write` for this repo only.
4. Once published, users on an earlier version will see an update prompt within an hour of their next launch (or immediately on next launch, since it also checks on startup).

## What you do NOT need to do

- No manual installer upload — the workflow does it.
- No separate update server — Electron's public service handles the Squirrel feed from your GitHub Releases directly.
- No code signing is configured yet (see below) — Windows SmartScreen will warn unsigned installers; that's expected until a certificate is added.

## How the packaged app bundles its own backend

The processing service (FastAPI + OpenCV + PySceneDetect, normally a Python venv) is frozen into a self-contained executable with PyInstaller (`services/processing/reelforge-processing.spec`), so installs don't need Python at all. This happens automatically:

1. `forge.config.mts`'s `prePackage` hook runs `pyinstaller reelforge-processing.spec` before every `package`/`make`/`release`, producing `services/processing/dist/reelforge-processing/`.
2. `packagerConfig.extraResource` copies that folder, plus `node_modules/ffmpeg-ffprobe-static` (FFmpeg/FFprobe binaries), into the packaged app's `resources/`.
3. `src/main/paths.ts` spawns `resources/reelforge-processing/reelforge-processing.exe` directly in packaged builds (vs. `python.exe app/main.py` in dev).

This is verified, not assumed: the packaged `.exe` was launched directly (not through dev mode) and the bundled service reached its ready state with a listening port, confirmed via `processing-service.stdout.log`'s `[lifecycle]` entries. If you add a new Python dependency that PyInstaller can't auto-detect (common for packages with dynamic imports or data files, like `scenedetect`/`cv2` already needed `collect_all` in the spec), the symptom is the frozen exe crashing on first *use* of that code path, not at startup — always test an actual reference-video import/analyze after rebuilding, not just that the exe launches.

## Code signing

Not set up. An unsigned Squirrel installer will trigger SmartScreen warnings on first run. Add a code-signing certificate and wire it into `MakerSquirrel`'s config (`certificateFile`/`certificatePassword`, or an Azure Trusted Signing / EV cert flow) before any public distribution.
