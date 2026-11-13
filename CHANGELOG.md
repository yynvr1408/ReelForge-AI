# Changelog

All notable changes to the **ReelForge AI** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-11-13

### Initial Production Release Baseline

This release establishes the official `v1.0.0` production baseline of ReelForge AI — a fully integrated, offline-first desktop video editor with reference-video style learning, original-pixel non-generative editing, and self-contained local ML intelligence.

#### Improved & Enhanced
* **Simplified Folder Navigation**: Redesigned storage settings with an intuitive 4-card directory architecture (Media Storage, Exports, Reference Reels, Training Reels) equipped with capacity meters and 1-click **"Open in Explorer"** shortcuts.
* **Video Import & Native Drag-and-Drop**: Separated Windows file selection and folder picker dialogs to prevent directory collisions. Added native OS drag-and-drop support across all studio workspaces (Media Library, Reference Library, Training Studio, Editor).
* **Pacing Preference Training Engine**: Staged training reels are automatically analyzed for duration and shot cadence via `/training/dataset/from-reels`. Added 1-click dataset seed generation (`/training/dataset/seed`) and self-healing training execution (`preparing_dataset` → `training_model` → `evaluating_candidate` → `complete`).
* **Consumer-Focused Updates & Rollback**: Cleaned the Updates UI by eliminating technical repository architecture noise. Added 1-click online rollback to previous versions and local build discovery for offline re-installation and rollback.
* **Release Artifacts**: Built standalone Windows setup package (`ReelForge AI-1.0.0 Setup.exe`) preserved locally in `releases/`.

---

## [0.3.0] - 2026-11-13

### Training Studio Pipeline & Storage Navigation

#### Improved & Enhanced
* **Video Dialog Separation**: Split `dialog.showOpenDialog` into distinct `openFile` and `openDirectory` IPC handlers to resolve Windows Electron directory lockup.
* **Training Dataset Cadence Analysis**: Added `/training/dataset/from-reels` to extract tempo and shot pacing metrics from staged MP4 reels in `storage/training_reels`.
* **Dataset Bootstrapping**: Added `/training/dataset/seed` to seed balanced pacing samples so initial training runs complete without requiring manual feedback ratings.
* **Batch Reference Import**: Added recursive directory import for reference reels (`/reference/import-batch`).
* **Direct Explorer Navigation**: Added `revealInShell` (`shell.showItemInFolder`) to jump directly to assets in Windows Explorer.

---

## [0.2.2] - 2026-10-30

### Color Grading Presets, Audio Controls & Expanded Export Settings

#### Improved & Enhanced
* **Creative Color Grading Presets**: Added 6 creative color grading presets (Neutral, Golden Hour, Cinematic Teal, Vivid Pop, Vintage Film, Dramatic B&W) with 1-click "Grade to all" application across timeline clips.
* **Audio Gain, Mute & Fades**: Added per-clip audio volume sliders (-24 dB to +12 dB), instant mute toggle, and configurable audio fade-in/fade-out durations (0 to 2.0s) mapped directly to FFmpeg `volume` and `afade` filter graphs.
* **Expanded Export Presets**: Added five social-media ready aspect ratios: 9:16 Vertical HD (1080×1920), 9:16 Vertical Fast (720×1280), 4:5 Portrait Feed (1080×1350), 16:9 Landscape HD (1920×1080), and 1:1 Square Feed (1080×1080) with selectable framerates (24, 30, 60 fps) and CRF quality.
* **Release Management Architecture**: Configured standalone public release repository (`yynvr1408/reelforge-ai-releases`) with Squirrel installer publishing.

---

## [0.2.1] - 2026-10-29

### CI/CD Pipeline & Windows Packaging Hardening

#### Improved & Enhanced
* **Electron Forge Build Hardening**: Configured Node 22 CI runtime, disabled temp directory conflicts (`tmpdir: false`), and enabled local Electron runtime cache for offline packaging.
* **Post-Render Quality Verification**: Added FFmpeg post-render scan detecting sustained black intervals and audio clipping near 0 dBFS.
* **In-Session Timeline Undo/Redo**: Added up to 50-step undo/redo stack covering clip trims, speed, reordering, and color modifications.

---

## [0.2.0] - 2026-10-28

### Audio Intelligence, LLM Adapters & In-App Updates

#### Added
* **Musical Beat Snapping**: Bounded autocorrelation tempo hypothesis and cut alignment to musical beat markers.
* **Dialogue Auto-Captions**: Rule-based subtitle generation aligned to dialogue audio segments.
* **In-App Updates Tab**: Added dedicated Updates page checking GitHub releases.
* **LLM Adapters (Phase 6)**: Offline structured prompt adapters for local timeline planning.
* **Storage Cache Purge**: Direct cache cleanup action in Settings.
