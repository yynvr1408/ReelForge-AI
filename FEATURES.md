# ReelForge AI — Features Specification & Version Matrix

ReelForge AI is an offline-first desktop video editor that analyzes reference video styles, applies learned editing cadence to raw user footage, and outputs professional, ready-to-publish short-form reels.

---

## Feature Matrix by Version

| Feature Area | Capability | Introduced | Enhanced | Status |
| :--- | :--- | :---: | :---: | :---: |
| **Core Architecture** | Non-generative original-pixel editing | v0.1.0 | v1.0.0 | Production |
| **Core Architecture** | 100% offline-first local execution | v0.1.0 | v1.0.0 | Production |
| **Media Management** | Multi-file video picker (`.mp4`, `.mov`, `.mkv`, `.webm`) | v0.1.0 | v0.3.0 | Production |
| **Media Management** | Batch folder import & recursive scanning | v0.1.0 | v0.3.0 | Production |
| **Media Management** | Native OS drag-and-drop into all workspaces | v0.3.0 | v1.0.0 | Production |
| **Media Management** | 1-click Windows File Explorer reveal (`revealInShell`) | v0.3.0 | v1.0.0 | Production |
| **Storage Settings** | 4-card primary storage with capacity gauges | v0.3.0 | v1.0.0 | Production |
| **Reference Intelligence** | Shot cut detection & transition extraction | v0.1.0 | v0.2.0 | Production |
| **Reference Intelligence** | Style profile creation & aggregation | v0.1.0 | v0.2.0 | Production |
| **Audio Intelligence** | Musical tempo hypothesis & beat snapping | v0.2.0 | v0.2.2 | Production |
| **Audio Intelligence** | Dialogue auto-captions aligned to speech | v0.2.0 | v0.2.2 | Production |
| **Timeline Studio** | Vertical 9:16 multi-track timeline editor | v0.1.0 | v0.2.2 | Production |
| **Timeline Studio** | 50-step in-session undo/redo history | v0.2.1 | v1.0.0 | Production |
| **Timeline Studio** | Creative color grading presets (6 presets + Grade to all) | v0.2.2 | v1.0.0 | Production |
| **Timeline Studio** | Custom 3D LUT import (`.cube`) & 4 built-in cinematic LUTs | v1.1.0 | v1.1.0 | Production |
| **Timeline Studio** | Per-clip audio volume (-24 dB to +12 dB) & audio fades | v0.2.2 | v1.0.0 | Production |
| **Audio Intelligence** | Multi-track audio mixing (BGM + VO) with sidechain ducking | v1.1.0 | v1.1.0 | Production |
| **Audio Intelligence** | Animated caption presets & styles (TikTok, Minimal, Cine) | v1.1.0 | v1.1.0 | Production |
| **Rendering Engine** | Expanded transitions (Wipe, Slide, Dissolve, Crossfade) | v1.1.0 | v1.1.0 | Production |
| **Pacing Model Training** | Offline CPU logistic regression preference model | v0.1.0 | v0.3.0 | Production |
| **Pacing Model Training** | Cadence & duration extraction from staged reels | v0.3.0 | v1.0.0 | Production |
| **Pacing Model Training** | 1-click dataset seeding & self-healing runs | v0.3.0 | v1.0.0 | Production |
| **Rendering Engine** | Multi-preset aspect ratio export (9:16, 4:5, 16:9, 1:1) | v0.2.2 | v1.0.0 | Production |
| **Rendering Engine** | Post-render quality scan (black frames & audio clipping) | v0.2.1 | v1.0.0 | Production |
| **Release & Updates** | GitHub Releases integration & update check | v0.2.0 | v1.0.0 | Production |
| **Release & Updates** | 1-click version rollback (online & offline) | v0.2.2 | v1.0.0 | Production |
| **Release & Updates** | Local `.exe` package discovery & offline rollback | v1.0.0 | v1.0.0 | Production |

---

## Detailed Feature Modules

### 1. Media Management & Import
* **Universal File Import**: Dedicated multi-file selector supporting MP4, MOV, MKV, and WebM containers without Windows folder picker collisions.
* **Batch Directory Ingest**: Recursive folder import scanning entire directory trees for video assets.
* **Native OS Drag-and-Drop**: Drag clips directly from Windows File Explorer into any studio workspace (Media Library, Editor, Reference Library, Training Studio).
* **Instant Shell Reveal**: 1-click "Show in Folder" button to locate any staged or rendered asset in Windows Explorer.
* **Simplified Storage Settings**: Primary storage organized into 4 intuitive cards (Media, Exports, References, Training Reels) with live disk meters and 1-click path opening.

### 2. Style & Reference Learning
* **Reference Video Analysis**: Scene cut detection, shot transition speed, visual movement, and tempo extraction.
* **Style Profiles**: Aggregates shot pacing, rhythm, and transition patterns into reusable style profiles.
* **Collection Management**: Organize reference reels by theme, genre, or editing aesthetic.
* **Pacing Preference ML Model**: Local CPU logistic regression model trained on editing feedback and staged reference reels to personalize cut timing.

### 3. Multi-Track Timeline & Editing Studio
* **Interactive Timeline**: Visual multi-track timeline displaying clips, duration boundaries, and playhead scrubbing.
* **Beat Snapping**: Automatic snapping of cut points to musical beats and tempo markers.
* **Dialogue Auto-Captions & Typography Presets**:
  - Subtitle generation aligned to dialogue segments.
  - 5 visual style presets: *Reel / TikTok Bold (Yellow)*, *Minimalist Modern (White)*, *Cinematic Film (Box)*, *Neon Glow (Cyan)*, and *Classic Default*.
  - 4 kinetic animation presets: *Pop-in / Zoom*, *Slide Up*, *Smooth Fade*, and *None (Static)* with custom font sizing.
* **Creative Color Grading & Custom 3D LUTs**:
  - 6 built-in presets (Neutral, Golden Hour, Cinematic Teal, Vivid Pop, Vintage Film, Dramatic B&W).
  - Custom 3D LUT import supporting `.cube` files (with title, domain bounds, and LUT size validation).
  - 4 bundled cinematic 3D LUTs: *Teal and Orange*, *Warm Golden*, *Moody Film Noir*, and *Clean Vivid*.
  - 1-click "Apply LUT to all" across all timeline clips.
* **Multi-Track Audio Mixing & Auto-Ducking**:
  - Dedicated Background Music (BGM) track with audio file picker, volume gain slider (-30 dB to +6 dB), and loop toggle.
  - Sidechain compression auto-ducking: automatically ducks BGM volume during speech and voiceover with configurable attenuation (-24 dB to -3 dB).
  - Dedicated Voiceover track with volume control (-20 dB to +12 dB) and customizable start delay offset.
* **Expanded Transitions**: Selectable transition types (Cut, Fade, Crossfade, Wipe Left, Wipe Right, Slide Up, Slide Down, Dissolve) with configurable duration (0.1s to 2.0s).
* **Per-Clip Audio Control**: Volume gain slider (-24 dB to +12 dB), mute toggle, and smooth audio fade in/out durations.
* **50-Step Undo / Redo**: Instant in-session history recovery for trims, reordering, speed, and color changes.

### 4. Render & Export Engine
* **Multi-Format Export Presets**:
  - **9:16 Vertical HD** (1080×1920) — Instagram Reels, TikTok, YouTube Shorts
  - **9:16 Vertical Fast** (720×1280) — Rapid draft sharing
  - **4:5 Portrait Feed** (1080×1350) — Instagram Feed
  - **16:9 Landscape HD** (1920×1080) — Standard widescreen
  - **1:1 Square Feed** (1080×1080) — Carousel and square social posts
* **Adjustable Output Quality**: Selectable framerates (24 fps cinematic, 30 fps standard, 60 fps smooth) and CRF quality profiles.
* **Hardware-Accelerated Color & Transition Processing**: FFmpeg `lut3d`, `xfade`, and `sidechaincompress` native pipeline.
* **Post-Render Quality Verification**: Automated scan identifying sustained black frames or audio clipping prior to export delivery.

### 5. Updates & Rollback System
* **Streamlined Consumer Interface**: Completely removed technical repository URLs, commit hashes, and CI/CD text.
* **In-App Update Checker**: Checks official releases repository on GitHub for published releases.
* **1-Click Rollback**: One-click downgrade to previous versions with automated installer download and launch.
* **Local Offline Builds**: Automatically detects standalone `.exe` installers in the repository's `releases/` directory for instant offline re-installation and rollback.
