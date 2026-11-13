# ReelForge AI Local Releases & Rollback Builds

This directory stores offline Windows installer executables (`.exe`) for fast deployment, testing, and instant version rollback without requiring internet downloads.

## Available Versions
The desktop application automatically scans this directory to display locally available builds for one-click installation and rollback:
- **v1.0.0**: `ReelForge AI-1.0.0 Setup.exe` (Initial Production Release)

Installer binaries (`*.exe`, `*.nupkg`) in this folder are preserved locally on disk and excluded from Git commits via `.gitignore` to maintain repository performance and GitHub release boundaries.
