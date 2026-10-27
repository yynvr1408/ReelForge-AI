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

## ⚠️ Known gap: the published build isn't fully functional yet

`electron-forge make`/`release` **does** produce a working installer and the app **does** launch after installing it — that part is verified (packaging was run and tested locally, not just assumed from dev mode working). But the installed app's local processing service won't start, because the Python interpreter and FFmpeg/FFprobe binaries that `src/main/paths.ts` expects at `resourcesPath/processing/` and `resourcesPath/ffmpeg/` aren't bundled into the package yet — only the dev-mode paths (the repo's own `.venv` and `node_modules`) are wired up.

Closing this requires a packaging hook (an electron-forge `packageAfterCopy` hook, most likely) that:
- Copies `services/processing/app/` plus a self-contained Python runtime (e.g. the official Windows embeddable Python distribution, with the processing service's dependencies installed into it) into `resources/processing/`
- Copies `ffmpeg-ffprobe-static`'s binaries into `resources/ffmpeg/` (or confirms they're already reachable via `extraResource`)

Until that's done, treat tagged releases as installer/update-pipeline validation, not a usable build for end users. This is tracked in `docs/development/known-limitations.md` and should be the next packaging task before announcing this publicly.

## Code signing

Not set up. An unsigned Squirrel installer will trigger SmartScreen warnings on first run. Add a code-signing certificate and wire it into `MakerSquirrel`'s config (`certificateFile`/`certificatePassword`, or an Azure Trusted Signing / EV cert flow) before any public distribution.
