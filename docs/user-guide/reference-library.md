# Reference Library User Guide

The Reference Library lets you import inspirational videos, analyze their editorial style, and extract reusable style profiles to guide your own edits.

## Features

- **Video Ingestion & Relinking**: Import reference MP4, MOV, or WebM videos. If a source file is moved on disk, the library detects the missing file and provides a one-click relinking dialog.
- **Editorial Scene Analysis**:
  - Cut detection using PySceneDetect.
  - Shot length distribution (median, mean, min, max).
  - Sampled visual metrics: brightness, saturation, sharpness, and motion magnitude.
  - Audio heuristics: estimated tempo (BPM) candidates and rhythmic onset density.
- **Style Profiles**:
  - Combine multiple analyzed references into a named Style Profile.
  - Edit pacing (median shot duration) and apply creative color grading presets.
  - Export and import version-1 JSON style profiles to share styles across projects without distributing source footage.
- **Measured Similarity Ranking**:
  - Select any analyzed reference to find similar references in your library.
  - Compares overlapping pacing, visual color, and audio characteristics.
- **Collections & Tagging**:
  - Organize references into folders/collections and tag them (e.g. `cinematic`, `vlog`, `high-energy`).
