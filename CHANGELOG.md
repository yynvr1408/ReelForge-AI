# Changelog

All notable changes to the **ReelForge AI** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-11-13

### Initial Production Release

This marks the official `v1.0.0` production baseline of ReelForge AI — an offline-first desktop video editor with reference-video style learning, non-generative original-pixel editing, and integrated local machine-learning intelligence.

### Improved & Enhanced

* **Simplified Folder Navigation & Direct Access**:
  - Overhauled storage settings into an intuitive 4-card layout (Media Storage, Exports, Reference Reels, Training Reels).
  - Added capacity gauges with real-time disk space tracking.
  - Added 1-click **"Open in Explorer"** buttons to navigate straight to any folder in Windows File Explorer.
  - Collapsed internal database, cache, and ML checkpoints into an advanced settings accordion.

* **Video Import & Native Drag-and-Drop**:
  - Resolved Electron Windows dialog collision where combining `openFile` and `openDirectory` locked dialogs to folder-only mode.
  - Provided dedicated multi-file video selector (`.mp4`, `.mov`, `.mkv`, `.webm`) and batch folder import.
  - Enabled native OS drag-and-drop across Media Library, Reference Library, Training Studio, and Editor.
  - Added "Show in Folder" context triggers for all imported footage and exported renders.

* **Pacing Preference Training Engine**:
  - Automated cadence and shot duration extraction from staged training reels via `/training/dataset/from-reels`.
  - Added 1-click synthetic dataset seeding (`/training/dataset/seed`) to bootstrap training without manual ratings.
  - Implemented self-healing training trigger: seamlessly transitions through `preparing_dataset` → `training_model` → `evaluating_candidate` → `complete`.
  - Offline CPU logistic regression model learning user pacing style without cloud telemetry.

* **Clean Consumer Updates & Rollback System**:
  - Redesigned Updates page, removing internal repository architecture noise in favor of a clean consumer interface.
  - Built-in GitHub Releases integration querying official releases.
  - Added **1-Click Rollback**: easily downgrade or switch versions.
  - Added **Local Builds & Offline Rollback**: detects installer executables (`.exe`) in the local repository for instant offline re-installation and rollback.

* **Editing Studio Controls**:
  - Creative color grading presets (Neutral, Golden Hour, Cinematic Teal, Vivid Pop, Vintage Film, Dramatic B&W) with "Grade to all" application.
  - Per-clip audio volume control (-24 dB to +12 dB), mute toggle, and smooth audio fade in/out sliders.
  - Expanded export aspect ratios (9:16 Vertical HD/Fast, 4:5 Portrait Feed, 16:9 Landscape HD, 1:1 Square Feed).
  - 50-step in-session timeline undo/redo.
