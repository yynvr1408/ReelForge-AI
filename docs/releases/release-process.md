# Release Process & Distribution

ReelForge AI uses a decoupled two-repository release pipeline mirroring the architecture used in `hotel-management`:

1. **Source Code Repository**: `yynvr1408/ReelForge-AI` (Private or public development, issue tracking, CI test pipeline, and packaging workflow).
2. **Dedicated Distribution Repository**: `yynvr1408/reelforge-ai-releases` (Public repository dedicated solely to hosting published GitHub Release artifacts, `.exe` installers, and Squirrel update manifests).

## How it works

1. **CI** (`.github/workflows/ci.yml`) runs on every push/PR to `main`/`master`: processing-service pytest, desktop typecheck/lint, and a packaging smoke test (`electron-forge package`).
2. **Release** (`.github/workflows/release.yml`) runs when a tag matching `v*.*.*` is pushed or when manually triggered via `workflow_dispatch`. It packages the self-contained app (freezing the Python service via PyInstaller) and publishes the Windows Squirrel installer and release assets directly to `yynvr1408/reelforge-ai-releases` using `@electron-forge/publisher-github`.
3. **In-App Updates Tab & Installer Download**:
   - The desktop app contains an **Updates** tab (`/updates`) querying the dedicated releases repository (`yynvr1408/reelforge-ai-releases`).
   - Users can see their current version, check for the latest release, view release notes, and click **Download & Install Now** (downloads the latest setup `.exe`, runs it, and restarts the app).
   - A complete **Published Release History** list allows one-click switching or rolling back to any previously published release version.
4. **Automatic Background Updates**:
   - `apps/desktop/src/main/index.ts` initializes `updateElectronApp({ repo: 'yynvr1408/reelforge-ai-releases' })` on startup and every hour.
   - Electron's update proxy reads from `yynvr1408/reelforge-ai-releases`'s Squirrel manifests (`RELEASES`, `*.nupkg`) to apply seamless delta updates.

## One-Time Setup: Dedicated Release Repo & Token

Because GitHub Actions runs in `ReelForge-AI` but pushes artifacts to `reelforge-ai-releases`, the default `GITHUB_TOKEN` does not have cross-repository permissions. A Personal Access Token (PAT) is required:

1. **Create the Release Repository**:
   - Go to GitHub and create a new repository: `https://github.com/new`
   - Repository name: `reelforge-ai-releases`
   - Visibility: **Public** (recommended so desktop users can download installers without credentials).
2. **Create a GitHub Personal Access Token (PAT)**:
   - Go to GitHub **Settings** -> **Developer Settings** -> **Personal Access Tokens** -> **Fine-grained tokens** (or Tokens Classic).
   - Name: `ReelForge AI Release Publisher`
   - Repository access: Select **Only select repositories** -> choose `reelforge-ai-releases`.
   - Permissions: **Contents: Read and write**.
   - Generate and copy the token.
3. **Add Secret to ReelForge-AI**:
   - Go to repository **Settings** -> **Secrets and variables** -> **Actions** in `yynvr1408/ReelForge-AI`.
   - Click **New repository secret**.
   - Name: `RELEASES_TOKEN`
   - Value: Paste the PAT copied above.

## Cutting a Release

1. Bump the version in `apps/desktop/package.json` (`"version"`) and commit it.
2. Tag and push:
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```
   The tag **must** match the `package.json` version exactly (the release workflow verifies this to prevent Squirrel version mismatch errors).
3. The `release` workflow builds the PyInstaller frozen backend and Electron installer, then pushes the release to `yynvr1408/reelforge-ai-releases/releases`.
4. Users can open the in-app **Updates** tab to download and install the new release immediately, or let the background updater handle it automatically.

## How the Packaged App Bundles Its Backend

The processing service (FastAPI + OpenCV + PySceneDetect) is frozen into a self-contained executable with PyInstaller (`services/processing/reelforge-processing.spec`), so end users do not need Python or CUDA toolkits installed:

1. `forge.config.mts`'s `prePackage` hook executes `pyinstaller reelforge-processing.spec`, writing to `services/processing/dist/rf/`.
2. `packagerConfig.extraResource` bundles `rf/` and `ffmpeg-ffprobe-static` into the packaged application's `resources/` folder.
3. `src/main/paths.ts` launches `resources/rf/reelforge-processing.exe` directly in packaged builds.

## Code Signing

An unsigned Squirrel installer will trigger SmartScreen warnings on first run in Windows. To eliminate warnings in public production distribution, configure a code signing certificate in `forge.config.mts` (`MakerSquirrel` `certificateFile` / `certificatePassword` or Azure Trusted Signing).
