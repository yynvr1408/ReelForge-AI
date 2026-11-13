# ReelForge AI — Features Specification

ReelForge AI is an offline-first desktop video editor that analyzes reference video styles, applies learned editing cadence to your raw footage, and outputs professional, ready-to-publish short-form reels.

---

## 1. Core Architecture & Philosophy

* **Strictly Non-Generative (Original-Pixel Editing)**: Preserves original camera footage without synthesizing deepfake faces, bodies, or AI-hallucinated scenes. Reframing uses original crop pixels or letterboxing.
* **100% Offline-First**: Runs entirely on local CPU and GPU. Media files, SQLite databases, and ML models never leave your computer.
* **Decoupled Architecture**: High-performance Electron + React + TypeScript frontend communicating over typed IPC with an embedded local Python FastAPI engine and bundled FFmpeg.

---

## 2. Media Management & Import

* **Versatile File Import**: Dedicated multi-file selector supporting MP4, MOV, MKV, and WebM containers.
* **Batch Directory Ingest**: Recursive folder import scanning entire directory trees for video assets.
* **Native OS Drag-and-Drop**: Drag clips directly from Windows File Explorer into any studio workspace (Media Library, Editor, Reference Library, Training Studio).
* **Instant Shell Reveal**: 1-click "Show in Folder" button to locate any staged or rendered asset in Windows Explorer.
* **Simplified Storage Settings**: Primary storage organized into 4 intuitive cards (Media, Exports, References, Training Reels) with live disk meters and 1-click path opening.

---

## 3. Style & Reference Learning

* **Reference Video Analysis**: Scene cut detection, shot transition speed, visual movement, and tempo extraction.
* **Style Profiles**: Aggregates shot pacing, pacing rhythm, and transition patterns into reusable style profiles.
* **Collection Management**: Organize reference reels by theme, genre, or editing aesthetic.
* **Pacing Preference ML Model**: Local CPU logistic regression model trained on your editing feedback and staged reference reels to personalize cut timing.

---

## 4. Multi-Track Timeline & Editing Studio

* **Interactive Timeline**: Visual multi-track timeline displaying clips, duration boundaries, and playhead scrubbing.
* **Beat Snapping**: Automatic snapping of cut points to musical beats and tempo markers.
* **Dialogue Auto-Captions**: Rule-based subtitle generation aligned to dialogue segments.
* **Creative Color Grading**: 1-click presets (Neutral, Golden Hour, Cinematic Teal, Vivid Pop, Vintage Film, Dramatic B&W) with global "Grade to all" consistency.
* **Per-Clip Audio Control**: Volume gain slider (-24 dB to +12 dB), mute toggle, and smooth audio fade in/out durations.
* **50-Step Undo / Redo**: Instant in-session history recovery for trims, reordering, speed, and color changes.

---

## 5. Render & Export Engine

* **Multi-Format Export Presets**:
  - **9:16 Vertical HD** (1080×1920) — Instagram Reels, TikTok, YouTube Shorts
  - **9:16 Vertical Fast** (720×1280) — Rapid draft sharing
  - **4:5 Portrait Feed** (1080×1350) — Instagram Feed
  - **16:9 Landscape HD** (1920×1080) — Standard widescreen
  - **1:1 Square Feed** (1080×1080) — Carousel and square social posts
* **Adjustable Output Quality**: Selectable framerates (24 fps cinematic, 30 fps standard, 60 fps smooth) and CRF quality profiles.
* **Post-Render Quality Verification**: Automated scan identifying sustained black frames or audio clipping prior to export delivery.

---

## 6. Updates & Rollback System

* **In-App Update Checker**: Checks official releases repository on GitHub for published releases.
* **1-Click Rollback**: One-click downgrade to previous versions with automated installer download and launch.
* **Local Offline Builds**: Automatically detects standalone `.exe` installers in the repository's `releases/` directory for instant offline re-installation and rollback.
