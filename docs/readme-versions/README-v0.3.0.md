# ReelForge AI — Version 0.3.0

[![Release](https://img.shields.io/badge/release-v0.3.0-orange.svg)](../../CHANGELOG.md)
[![Platform](https://img.shields.io/badge/platform-Windows%20x64-blue.svg)](../../releases/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](../../LICENSE)

**ReelForge AI v0.3.0** introduced the automated preference training pipeline, Windows file/folder dialog separation, native OS drag-and-drop, and simplified 4-card storage navigation.

---

## v0.3.0 Release Highlights

* **Windows Dialog Collision Resolved**: Split `mediaImportDialog` and `mediaImportFolderDialog` so users can select individual `.mp4`/`.mov` files without Windows dialog folder lock.
* **Native OS Drag-and-Drop**: Enabled direct drag-and-drop ingestion from Windows File Explorer across Media Library, Reference Library, Training Studio, and Editor via `webUtils.getPathForFile`.
* **Simplified Storage Settings**: Redesigned Settings into a 4-card primary view with disk capacity meters and direct Explorer navigation shortcuts.
* **Automated Pacing Dataset Generation**: Added `/training/dataset/from-reels` to extract shot cadence and duration from staged reels in `storage/training_reels`, plus 1-click `/training/dataset/seed`.
* **Self-Healing Training**: Training automatically synthesizes necessary preference samples if started on an empty dataset, transitioning through all stages smoothly.

For full feature details, see [FEATURES.md](../../FEATURES.md).  
For the latest version history and release notes, see [CHANGELOG.md](../../CHANGELOG.md).
