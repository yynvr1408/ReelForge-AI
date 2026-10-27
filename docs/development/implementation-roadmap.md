# Implementation roadmap

Tracks the phases from the product spec (`ReelForge_AI_Claude_Code_Master_Prompt.md`, section 36) against actual build state. Status values: **Not started**, **In progress**, **Implemented**, **Tested**, **Blocked**.

| Phase | Status | Notes |
|---|---|---|
| 0 — Environment inspection and planning | Tested | Node/Python/FFmpeg/git inspected; this roadmap + architecture docs written |
| 1 — Electron foundation | Tested | Main process, preload bridge (contextIsolation/sandbox/nodeIntegration:false), Python service lifecycle (spawn, readiness handshake, graceful shutdown), SQLite init, structured JSON logging, CSP, navigation restrictions |
| 2 — Media library | Implemented | Import, FFprobe validation, thumbnail extraction, listing, UI. Not yet tested: missing-file detection, directory (batch folder) import, large-library performance |
| 3 — Reference analysis | Implemented, partially tested | Scene detection (PySceneDetect ContentDetector) implemented and tested. Color/audio/OCR/transcription analysis **not implemented** |
| 4 — Reference library and style profiles | Implemented, tested | Import, analyze, aggregate into style profiles (pacing statistics only). Collections/tags backend models exist but have no API/UI yet. Similarity search not implemented |
| 5 — Timeline and rendering | Tested | Typed/versioned Pydantic timeline schema, semantic validation, FFmpeg filter-graph renderer (trim/scale/crop/color/concat), background job system, FFprobe-based output validation. Covers the full acceptance workflow end-to-end (see `services/processing/tests/test_integration_workflow.py`) |
| 6 — AI editing planner | In progress | Rule-based planner implemented and tested (sequential clips at profile-derived shot duration, target-duration fitting). Natural-language instruction parsing and LLM adapters **not implemented** |
| 7 — Advanced video intelligence | Not started | |
| 8 — Preference learning | Not started | DB model (`FeedbackEntry`) exists; no collection UI or ranking logic |
| 9 — Training Studio | In progress | Folder-based training input staging implemented and tested (list/import/delete reels in a real, user-visible directory). Actual dataset preparation, task/model selection, training execution, checkpoints, and evaluation **not implemented** — UI explicitly marks this |
| 10 — Model manager | Not started | Nav placeholder only, explicitly marked unavailable |
| 11 — Generative AI | Not started | |
| 12 — Production hardening | Not started | No security review pass yet beyond the baseline Electron hardening in Phase 1 |
| 13 — Release candidate | In progress, core packaging works | CI (`.github/workflows/ci.yml`) and a tag-triggered release pipeline (`.github/workflows/release.yml`, `electron-forge release` → GitHub Releases) are built. `electron-forge package`/`make` verified locally — produces a working `.exe` and Squirrel installer with a generated `.ico`. The processing service is frozen with PyInstaller and bundled via a `prePackage` hook + `extraResource`; **the packaged app was launched directly and its bundled backend verified reaching ready state with a listening port** — no system Python/FFmpeg needed on the target machine. Auto-update wired via `update-electron-app`. Remaining gaps: code signing, user data migration/backup on upgrade, and end-to-end verification through an actual Squirrel install (only direct `.exe` launch has been tested, not the full Setup.exe → installed app → auto-update path). |

## What the current vertical slice actually demonstrates

Verified by `services/processing/tests/test_integration_workflow.py` (passing, real FFmpeg/PySceneDetect, no mocks):

1. Create a project
2. Import a reference video → FFprobe metadata extracted
3. Detect scene cuts (PySceneDetect) → shot durations, cut count, confidence
4. Build a style profile aggregating pacing statistics across reference(s)
5. Import source footage → FFprobe metadata extracted
6. Generate a validated timeline using the style profile's median shot duration and a target total duration
7. Render the timeline with FFmpeg (trim, scale/crop to export preset, color eq, concat)
8. Re-probe and validate the rendered output (duration/dimensions/audio-presence tolerance checks)
9. Save the timeline onto the project, reopen the project, confirm it round-trips

This is also wired into the Electron desktop app end-to-end (Editor page), not just the backend test — manually verified by launching the app in dev mode.

## Next recommended work (in order)

1. Audio analysis (beat/tempo, silence detection) to inform pacing/sync — currently the timeline planner is video-only
2. Missing-file detection + re-link flow for media/reference assets
3. Natural-language → rule-based-planner-parameters translation (keyword/intent parsing before reaching for an LLM)
4. Security review pass (Phase 12 scope) before any packaging work
5. Electron Forge packaging validated on a clean VM, including the Python service and FFmpeg binaries
