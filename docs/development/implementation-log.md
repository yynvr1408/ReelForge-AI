# Implementation log

## 2026-10-29 continuation

- Added persisted reference-analysis jobs with `queued/running/complete/failed/cancelled` states, stage reporting, cancel IPC/UI, cooperative checks during visual sampling and audio decoding, scene-detector callback checks, and recovery of interrupted jobs after service restart. Schema v3 creates the job table with a pre-migration database backup. Tests cover successful analysis, cancellation, restart recovery, v2 backup, and cancellation checks within the analyzers.

- Added bounded autocorrelation tempo hypotheses to the local audio reference analysis. Low-structure and short samples return no estimate; candidates are explicitly described as ambiguous review hints and are never applied automatically to the edit planner.
- Style profiles now aggregate only tempo candidates above a confidence floor, and the Style Library labels them for review before syncing. Added synthetic periodic/flat/short-envelope tests and aggregation coverage.
- Updated the implementation roadmap and known-limitations document so their Phase 3, training/model status, and remaining-work descriptions match the current code.
- Verification: 28 focused processing tests pass; desktop TypeScript typecheck and lint pass; a fresh `npm run package` build succeeds. The app was left closed. Installer and full workflow limitations remain in the roadmap.
- Added a post-render FFmpeg quality scan that reports sustained black intervals and audio sample peaks near clipping. Reports are warnings for human review and never modify or reject the source edit. The editor displays the findings and possible intentional fades are called out.
- Added synthetic coverage for black-segment and near-clipping detection and asserted quality-report presence in the acceptance workflow. The expanded focused processing suite now passes 32 tests. A fresh trace confirmed the full workflow stalls before its first request when AnyIO tries to create a Windows asyncio socketpair; this sandbox's socket restriction prevents the TestClient request from starting.
- Added up to 50 in-session timeline undo/redo steps covering clip trims, speed, reorder/removal, color, crop, and captions; generating a replacement timeline or switching projects resets this temporary history. Desktop typecheck and lint pass.
- Rebuilt `build/ReelForge AI-win32-x64` with the export scan and undo/redo UI; the packaged Electron app, `resources/rf/reelforge-processing.exe`, and bundled FFmpeg/FFprobe are present. The app remains closed.
- Added explicit clip thumbs-up/down controls and an opt-in “Save grade” action. Subsequent plans in the same project/style scope apply smoothed source preference ranking and neutral-prior color adjustments; technical clip analysis remains in the ranking and source color stays unchanged without user feedback. Added planner coverage for bounded selection offsets and opt-in color grading.
- Rebuilt the package again after preference-learning changes. `app.asar` is 365,366 bytes and the frozen processing executable is 11,400,685 bytes under `resources/rf`; `git diff --check` passes. No ReelForge/Electron process is running.
- Added stable server-side reference pagination (50 per page), including SQL-side case-insensitive JSON tag filtering and a deterministic ID tie-breaker; the reference library now exposes previous/next controls. Route tests cover tag filtering across pages. This lowers list payloads without changing the stored library.
- Verification: 33 focused processing tests pass. `npm run typecheck` and `npm run lint` pass. The latest `npm run package` succeeds with `app.asar` at 366,326 bytes and the bundled service at 11,400,962 bytes. The app remains closed. `npm audit` could not resolve `registry.npmjs.org`; `pip-audit` is not installed in the offline venv, while both audit gates remain configured in CI.
- Added a side-by-side reference comparison panel for two selected references, showing duration, cut count, mean shot length, analysis confidence, brightness, saturation, motion estimate, and tempo hypotheses. It is descriptive only and explicitly calls tempo values hypotheses. The UI typecheck and lint pass.
- Final checks for this continuation: all 33 focused processing tests pass; desktop typecheck and lint pass; fresh `npm run package` succeeds with the comparison view included (`app.asar` 369,445 bytes). `git diff --check` passes. The app remains closed.
- Added a deliberately coarse motion-instability hint from sparse dominant optical-flow reversals. It appears in visual reference summaries and two-reference comparison as “possible shake samples”; documentation warns that pans, cuts, and subject motion can trigger it, and it is never an automatic exclusion signal. Six focused visual/audio tests pass, including steady-translation and oscillating-flow cases; desktop typecheck and lint pass.
- Full focused processing subset now passes 34 tests. Fresh package includes the motion hint (`app.asar` 369,675 bytes; bundled processing executable 11,402,143 bytes). The desktop app remains closed.

## 2026-10-29 — Windows Squirrel packaging limit and sandbox boundary

- Rebuilt the updated desktop package and frozen processing service. `npm run package` succeeds; `npm run make` also creates the app package and Squirrel `.nupkg`.
- Squirrel initially failed on the long NumPy OpenBLAS DLL path. Renaming the packaged service resource folder to `rf` reduced the archive path below legacy `MAX_PATH`; the app's packaged service resolver and release/setup docs now use that folder.
- The remaining Squirrel step starts its bundled `7z.exe` to extract the package, but this sandbox blocks that executable with Windows `{Illegal System DLL Relocation}`. Running its harmless `7z.exe -h` directly fails with the same error, confirming an execution-environment restriction. Final `Setup.exe` generation must be retried on a normal Windows host/CI runner.
- A direct packaged-service HTTP check cannot complete here because loopback sockets are blocked by the command sandbox. The desktop app was left closed. Existing earlier evidence of a packaged backend launch is preserved, but the refreshed package needs the same check outside this sandbox.
- `npm run typecheck`, `npm run lint`, and the focused processing suite (25 tests) pass. Code signing, installer installation/upgrade, and auto-update remain outstanding.

## 2026-10-28 — First real offline preference-training workflow

- Replaced the Training Studio's disabled training stub with a bounded, real CPU-only logistic pacing-preference task. It builds examples only from explicit `too_fast`/`too_slow` timeline feedback carrying valid duration and clip-count fields; staged videos are not treated as labels or training data.
- The task requires at least 8 valid examples and 3 of each rating direction, uses a deterministic held-out example from each class, reports accuracy against a majority baseline, persists candidate/active/previous JSON checkpoints, requires a candidate to meet baseline before promotion, and supports rollback.
- Promoted model predictions apply a bounded pacing factor in subsequent timeline plans. Invalid/tampered checkpoint values are rejected. The renderer exposes status, train, promote, and rollback through typed IPC; face/body/video generation is not part of this task.
- Added a Model Manager screen and local registry for this supported model, with promotion/rollback, SHA-256 sidecar integrity checks, MIT/license and runtime metadata, architecture and CPU/RAM reporting, and a CPU-only low-memory loading policy. The model fails closed if its recorded active-checkpoint checksum no longer matches.
- Added tests covering data sufficiency, training/evaluation, promotion, rollback, malformed checkpoints, integrity tampering, and model metadata. The focused processing suite passes (25 tests); desktop typecheck/lint pass. The refreshed `npm run package` succeeds and contains the bundled service. Direct loopback smoke verification from the restricted command sandbox is blocked by its socket permission policy; the full desktop was not opened and remains closed.
- Phase 9 now has one real supported task; richer dataset authoring, training progress/cancellation, and larger-scale evaluation remain. Phase 10 manages the one built-in preference model; third-party model acquisition and runtimes remain. Clean Squirrel install/upgrade verification and signing remain incomplete.

## 2026-10-28 — Project recovery, reference organization, and feedback loop

- Added reference collection CRUD, name/tag/status/duration filters, per-reference tags, collection assignment, and aggregation exclusion across API, IPC, and UI.
- Added media revalidation and a relink flow that replaces a missing asset's managed source while preserving its project identity.
- Added SQLite pre-migration backups, schema version tracking, project snapshots, and a project history/restore view.
- Added feedback collection, inspection/deletion in Settings, editor feedback controls, and a bounded pacing adjustment that affects later timeline plans.
- Added recursive folder and multi-file media import with a 1000-file request cap and per-file errors, all supported media extensions in the picker, and a separate file-only relink picker. Added bounded per-clip exposure, contrast, saturation, and warmth sliders rendered with FFmpeg filters.
- Added source-pixel crop positioning, timed caption entry/removal, timeline-bound checks, and FFmpeg text rendering through temporary UTF-8 files (so punctuation is preserved safely). The test renders a caption with punctuation and verifies visible pixels in the output frame.
- Extended the editor with source previews and clip trim/speed/reorder/remove controls. Brief parsing and ranking use local measurable signals; generative edits that alter identity or source scenes remain outside product scope.
- Desktop TypeScript and lint checks pass. Focused planner, analysis, route-logic, batch-import, scene-detection, timeline/color/caption rendering, and FFprobe tests pass (21 passed). The ASGI `TestClient` cannot start in this restricted Windows environment because AnyIO blocks while creating its local socket pair; the full HTTP render workflow therefore remains unverified.
- The latest `npm run package` succeeds after using the installed Electron archive and a workspace-local packager temp directory; it produces a refreshed Windows app with the frozen processing service and bundled FFmpeg/FFprobe. A packaged-service loopback smoke request could not be verified from this restricted command sandbox because socket access was denied; the app was left closed.
- The roadmap and known-limitations list now reflect verified work and remaining dependencies rather than marking unverified phases complete.

## 2026-10-28 — Safer rendering and non-generative editing direction

- Render cancellation now propagates from the editor through the job manager and terminates the FFmpeg process; cancelled/failed jobs persist terminal status, and partial output is removed on cancellation, timeout, or encode failure.
- Render output names are restricted to simple `.mp4` filenames under the project export directory.
- FFmpeg now synthesizes silent audio for video-only source clips and honors clip playback speed in video and audio filters.
- The editor offers a Cancel render action and only sends video assets to timeline generation.
- Added regression coverage for silent clips, playback speed, traversal output names, brief parsing, ranked moments, and audio/visual measurements. Targeted analysis/planner/timeline/scene tests pass (14 passed). Desktop typecheck and lint pass. The integration workflow did not complete in the sandbox during this session and remains to be rerun in a normal development environment.
- Documented the intended AI boundary: analyze and edit user footage; do not generate frames or alter faces, bodies, clothing, or scenes. Expanded the roadmap for audio-aware pacing, content-aware ranking, relinking, reversible edits, and release hardening.
- Extended reference analysis with sampled sharpness, exposure, saturation, optical-flow magnitude, audio RMS, silence ranges, and transient candidates. Style profiles aggregate these signals and expose a saved shot-length adjustment.
- Timeline suggestions now rank sampled source scenes by a visible sharpness/exposure heuristic, preserve selected source timecodes, and show the reason and score in the editor. A bounded offline brief parser recognizes explicit duration, aspect ratio, shot pacing, and original-color constraints.
- These are measurable local heuristics, not semantic action or identity recognition. Beat classification, shake classification, and unsupported free-form instructions remain out of scope and are listed in known limitations.
- Generated clips now report hard cuts accurately; crossfades are no longer claimed in timeline metadata until the renderer supports them.

Reverse-chronological. Each entry: what changed, key files, what was verified.

## 2026-10-27 (later) — CI/CD, GitHub release pipeline, and a packaged app that actually runs

**Requested**: public release management with a proper CI/CD pipeline. Built `.github/workflows/ci.yml` (test/typecheck/lint/package-smoke-test on every push/PR) and `.github/workflows/release.yml` (tag `vX.Y.Z` → `electron-forge release` → GitHub Release, via `@electron-forge/publisher-github`). Wired `update-electron-app` into the main process for Squirrel auto-update against the GitHub Releases feed. Generated `assets/icon.ico` (multi-resolution, via `sharp` + `png-to-ico`) from the user-provided PNG and wired it into the packager/installer/dev-window icon.

**Then closed the real gap**: a packaged build's processing service wasn't bundled at all. Froze the processing service with PyInstaller (`services/processing/reelforge-processing.spec`, `collect_all` needed for `scenedetect`/`cv2` since PyInstaller's static analysis misses their dynamic imports) into a self-contained `reelforge-processing.exe`. Added a `prePackage` hook in `forge.config.mts` that builds it automatically, plus `packagerConfig.extraResource` to copy it and `ffmpeg-ffprobe-static`'s binaries into the packaged `resources/`. Refactored `src/main/paths.ts`/`pythonService.ts` from separate python-exe+entrypoint resolution into a single `getProcessingServiceCommand()` that returns the right command for dev (venv python + script) vs. packaged (the frozen exe directly) mode.

**Two real bugs found only by actually launching the packaged `.exe`** (not assumed from `electron-forge package` succeeding, which it did even while both bugs were present):

1. `electron-squirrel-startup` was marked `external` in `vite.main.config.mts`, so it was left as a bare `require()` call in the bundled `main.cjs` — but the packaged app's asar ships only the Vite-bundled `main.cjs`/`preload.cjs`, not `node_modules`, so this failed instantly with "Cannot find module" before any app code ran (Electron's own crash dialog caught it; the user's screenshot of that exact dialog is what made the root cause obvious). Fixed by removing it from `external` so Vite bundles its small JS inline — only `ffmpeg-ffprobe-static` still needs to stay external (and only matters in dev mode; packaged mode never calls it).
2. Once the app could start, failures in `launchProcessingService()`'s catch block only reached the renderer via an IPC status broadcast — nothing was ever written to a log file, so a silent startup failure (like bug 1, before the fix) was invisible without a devtools console, which a packaged app doesn't have open by default. Added unconditional `[lifecycle]` logging at each startup phase and made `broadcastServiceStatus` itself log error/stopped states, plus guarded it against sending to an already-destroyed `webContents` (a separate, pre-existing "Object has been destroyed" crash on service exit during quit, caught in the same pass).

**Verified, not assumed**: launched the packaged `ReelForge AI.exe` directly (post-fix), confirmed via `processing-service.stdout.log` that the full lifecycle completes (`whenReady` → `createWindow` → IPC handlers → processing service reaches `REELFORGE_SERVICE_READY`) and that the bundled `reelforge-processing.exe` is listening on its assigned port (`netstat`). The exact frozen-exe content was also separately verified standalone before packaging: `/health`, project creation, and a real reference-video scene-detection analysis (OpenCV + PySceneDetect) all worked against synthetic FFmpeg test clips — confirming the PyInstaller freeze didn't silently break the native-dependency-heavy parts.

**Not verified yet**: the full Squirrel install path (`Setup.exe` → installed app → auto-update check) — only direct `.exe` launch of the `package` output. `update-electron-app` correctly logs `Error: Can not find Squirrel` in that context, which is expected (no Squirrel runtime wrapper present), not a bug.

## 2026-10-27 — Phase 0/1 + first vertical slice + training-folder staging

**Environment inspected**: Node v24.16.0, npm 11.13.0, Python 3.14.6 (default) + Python 3.12.10 (also installed), no system FFmpeg, git 2.54.0, Windows 11. Decided to pin the processing-service venv to Python 3.12 (ML wheel availability) and bundle FFmpeg/FFprobe via the `ffmpeg-ffprobe-static` npm package rather than requiring a system install.

**Scaffolded**:
- `apps/desktop/` via Electron Forge's official Vite+TypeScript template, restructured into `src/main/`, `src/preload/`, `src/renderer/{app,components,features,hooks,services,stores,types}` per the spec's project layout
- `services/processing/` as a FastAPI service with its own `pyproject.toml`, pinned direct dependencies (fastapi, uvicorn, pydantic, sqlalchemy, scenedetect, opencv-python-headless, numpy)

**Implemented and tested** (13 pytest tests passing, including a full end-to-end workflow against real FFmpeg/PySceneDetect with synthetic `lavfi`-generated fixtures — no mocks, no licensed media):
- FFprobe-based media probing with safe subprocess arg arrays (`app/media/ffprobe.py`)
- Thumbnail extraction (`app/media/thumbnails.py`)
- Scene-cut detection via PySceneDetect ContentDetector (`app/analysis/scene_detection.py`)
- Style profile aggregation across one or more analyzed references (`app/style_profiles/aggregator.py`)
- Typed, versioned Pydantic timeline schema + semantic cross-reference validation (`app/timeline/`)
- Rule-based editing planner (no LLM) — sequential clips at profile-derived shot duration, fitted to a target duration (`app/editing_planner/rule_based.py`)
- FFmpeg filter-graph renderer (trim/scale/crop/color-eq/concat) run as a background job, with FFprobe-based output re-validation (duration/dimensions/audio-presence tolerance checks) — a render is never marked successful without this (`app/rendering/`)
- SQLite persistence via SQLAlchemy (projects, media assets, reference videos, style profiles, render jobs, feedback entries) with a schema-migration-version table
- Bearer-token auth (random per-launch token) + loopback-only binding + restrictive CORS (`app/security/auth.py`, `app/api/app.py`)

**Electron main process**:
- Python service lifecycle: free-port allocation, random token generation, spawn with `REELFORGE_*` env vars, readiness handshake via a `REELFORGE_SERVICE_READY` stdout line, graceful SIGTERM→SIGKILL shutdown on app quit, structured log forwarding to `userData/logs/`
- Security: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, per-environment CSP (relaxed only for Vite's dev HMR, strict in prod), navigation/window-open restrictions routing external links to the OS browser
- Full typed IPC allowlist (`src/shared/ipc-contract.ts` + `src/main/ipcHandlers.ts` + `src/preload/index.ts`) — the renderer has no Node/network/filesystem access outside these channels; the processing service's auth token never leaves the main process

**Renderer (React + Tailwind v4)**: Dashboard, Projects, Media Library, Reference Library, Style Library, Editor (the full create-project → import → analyze → profile → generate → render → save workflow), Render Queue, Settings, Training Studio. Model Manager is an explicit "not implemented" placeholder.

**Bug found and fixed during manual verification**: moving the main/preload entry files to `src/main/index.ts` / `src/preload/index.ts` made Vite's default lib-build output naming collide — both built to `.vite/build/index.cjs`, clobbering one another, while `package.json`'s `main` field still pointed at the old `main.cjs`. Electron's own error dialog ("Cannot find module '...\\.vite\\build\\main.cjs'") caught this. Fixed by pinning `build.rollupOptions.output.entryFileNames` explicitly in `vite.main.config.mts` (`main.cjs`) and `vite.preload.config.mts` (`preload.cjs`). Documented in `docs/development/setup.md` troubleshooting.

**Training-folder staging** (requested mid-session): added a real, user-visible `training/input/` directory under the app's data dir. New backend endpoints (`/training/input-reels` list/import/delete, `/storage` for all configured locations) and renderer pages (Training Studio, Settings) let the user add/remove reels there and open the folder directly in Explorer. The "Train" action is present but disabled with an explanation — actual training is unbuilt (Phase 9 proper: dataset manifests, task/model selection, checkpoints, evaluation). Covered by 2 new pytest tests.

**Manually verified**: launched the packaged dev app (`npm run start`), confirmed the Python service starts and reaches ready state (checked via `userData/logs/processing-service.stdout.log` and process inspection), no entries in the crash log. Did not yet manually click through every screen of the UI in this session — automated coverage is the FastAPI integration test, not a browser/Electron UI test.

**Not done this session**: Playwright/Electron e2e tests, audio/color reference analysis, NL editing, preference learning, model manager, generative AI, security review pass, packaging validation, most of the docs/ tree (architecture decisions, test strategy, training guide, user guides, release process), CONTRIBUTING.md.

**Current milestone**: Phase 1 (Electron foundation) tested; Phase 5 (timeline + rendering) tested via the full workflow; Phase 9 (Training Studio) in progress with real folder staging only.

**Next recommended task**: audio analysis (beat/silence detection) to stop the editing planner being video-duration-only, or a security review pass before any further feature work — see `docs/development/implementation-roadmap.md`.

## 2026-10-29 — Cancellable reference analysis and packaging

- Added persisted reference-analysis jobs with stage reporting, cancellation, error state, and startup recovery for interrupted work. Existing synchronous analysis remains available for compatibility.
- Made audio extraction interruptible while FFmpeg runs, and added cooperative cancellation checks to visual sampling and scene-detection callbacks. Progress is stage-based; cancellation during a long scene without detector callbacks can take time to take effect.
- Added Electron IPC and Reference Library UI support for starting, polling, and cancelling analysis jobs.
- Added schema migration coverage and job/analyzer cancellation coverage. Focused processing suite: 42 passed. Desktop TypeScript typecheck and lint passed.
- `npm run package` completed successfully. The packaged executable is `build/ReelForge AI-win32-x64/ReelForge AI.exe` (250,130,944 bytes), with the processing service at `resources/rf/reelforge-processing.exe` (11,407,377 bytes). The application was left closed.
- `git diff --check` passed. Installer install/update flow and full UI walkthrough remain outstanding; see the roadmap and known limitations.

## 2026-10-29 — Style profile portability

- Added a versioned `reelforge-style-profile` JSON import/export workflow in the Style Library. Export includes profile provenance and measured settings; import creates a new local profile and does not overwrite an existing one.
- The import endpoint validates the format/schema version, name and collection bounds, confidence, supported profile sections, and the usable 0.3–30 second pacing range before persisting data.
- Added direct route tests for a successful import and invalid schema/pacing rejection. `test_project_libraries.py`: 9 passed. Desktop typecheck and lint passed.
- Visual/audio measurements imported as reference metadata remain read-only at this point; imported reference IDs are provenance and are not required to exist on the receiving machine.

## 2026-10-29 — Editable style pacing and manual grade

- Extended profile editing from pacing alone to pacing plus exposure, contrast, saturation, and temperature. Color sliders start neutral and are explicitly saved by the user; the planner applies the saved manual grade to generated clips while keeping source media unchanged. Per-media color feedback is combined with the profile grade and clamped to renderer-supported ranges.
- Added API/import validation for the supported grade fields and bounds. Added tests for profile import/update validation and planner propagation of global/per-media grades.
- Processing route/planner tests: 18 passed. Desktop typecheck and lint passed.
- Beat/speech-derived settings and measured-reference color matching remain incomplete; no automatic face or scene generation was added.
- Rebuilt the Windows package successfully with these changes. The non-TestClient processing suite completed with 45 passed. `test_integration_workflow.py` and `test_training_and_storage.py` use the local TestClient fixture and stall at the sandbox's asyncio socketpair/accept setup; those API integration checks still need a normal Windows environment.

## 2026-10-29 — Review-only rhythm and speech-like audio cues

- Added 20 ms spectral-flux rhythmic onset candidates and coarse spectral/zero-crossing speech-like activity ranges to reference audio analysis. Reference comparison and aggregated style profiles show onset counts and estimated speech-like duration.
- These are explicitly review-only heuristics; they are not beat tracking, VAD, transcription, or auto-sync. The audio processing path checks cooperative cancellation before and after the bounded feature calculation.
- Added synthetic pulse and harmonic-voice-like signal tests plus aggregation coverage. Audio/profile tests: 20 passed; desktop typecheck and lint passed. Broader install/runtime verification remains tracked in the roadmap.
- Rebuilt the Windows package successfully. The current processing suite, excluding the two TestClient files blocked by local socket setup, passes 46 tests. `git diff --check` passes; the app remains closed.

## 2026-10-29 — Explicit export presets

- Added selectable vertical (1080×1920), horizontal (1920×1080), and square (1080×1080) presets to the Editor and wired the selection through IPC into generated timelines. The explicit preset wins when it conflicts with aspect wording in the editing brief.
- Bounded export dimensions to 7680 pixels and frame rate to 120 FPS; kept codec fields backward-compatible. Direct route and schema tests pass; desktop typecheck and lint pass.
- Arbitrary custom presets, safe-area caption preview, and integrated loudness QA remain outstanding.
- Windows package rebuilt successfully with the preset UI and processing validation. Processing tests excluding the two sandbox-blocked TestClient files: 48 passed; desktop typecheck/lint and `git diff --check` passed. App remains closed.

## 2026-10-29 — Caption safe-area preview

- Added an export-frame caption preview that uses the selected output aspect ratio, current crop position, draft caption (or first saved caption), and selected placement. It marks a 10% safe inset and states that the view is a static layout preview.
- Moved top and bottom FFmpeg caption placement to that same 10% inset so preview and render agree; center captions remain centered. Updated renderer assertions and the roadmap/limitations.
- Windows package rebuilt successfully. Processing suite excluding the two sandbox-blocked TestClient files: 48 passed; desktop typecheck/lint and `git diff --check` passed. App remains closed.

## 2026-10-29 — Persistent project history and loudness report

- Added a project History panel to the Editor. It lists saved checkpoints, restores a selected project/timeline snapshot, and refreshes history after a restore creates its own checkpoint. Individual undo/redo steps remain session-only.
- Extended post-render analysis with EBU R128 integrated LUFS and true-peak values alongside black-interval and sample-peak checks. The report flags possible clipping for review and does not normalize or modify rendered media.
- Expanded the existing project-version route test to verify timeline snapshot restore. Render-quality and project-history tests: 11 passed; desktop typecheck/lint passed.
- Packaged both changes together. Full available processing suite excluding the two local-socket TestClient files: 48 passed; `git diff --check` passed. The application was left closed.

## 2026-10-29 — Per-clip conventional stabilization

- Added a per-clip stabilization toggle using FFmpeg's bundled `deshake` filter with `edge=blank`; the default remains off. This performs conventional motion correction, with no generated fill; blank borders may appear and are reviewable in the existing black-frame quality scan.
- Confirmed the bundled FFmpeg exposes `deshake`, and rendered a stabilization-enabled synthetic clip in the existing renderer test. Timeline/render tests: 11 passed; desktop typecheck and lint passed.
- Windows package rebuilt successfully. Processing suite excluding the two local-socket TestClient files: 49 passed; `git diff --check` passed. The app remains closed.

## 2026-10-29 — Training run progress and cancellation

- Added persisted training-run records and moved the Training Studio's pacing-model training action to a background job. The UI polls real stage/progress values, can request cancellation, resumes polling active jobs after page reload, and refreshes model status when training completes.
- Training checks cancellation during fitting and does not write a new candidate when cancelled. Service startup marks interrupted training runs failed. Schema version 4 adds the training-runs table with pre-migration backup.
- Added route tests for successful completion, cancellation, restart recovery, and schema creation, plus direct cancellation coverage in the model trainer. Desktop typecheck/lint passed; full package and suite verification pending for this batch.
- Full processing suite excluding the two socket-blocked TestClient files: 51 passed. Windows package rebuilt successfully; `git diff --check` passed. App remains closed.

## 2026-10-29 — Paginated media library

- Added a stable, newest-first server-side media page endpoint and wired the desktop library to load 48 assets at a time. The editor's existing project media query remains unchanged.
- Page requests check only the returned files for missing status, avoiding a full-library filesystem sweep on every library refresh.
- Added direct route coverage for page boundaries, stable non-overlapping results, totals, and missing-file status. Processing suite (excluding the two sandbox-blocked TestClient files): 52 passed; desktop typecheck/lint and `git diff --check` passed.
- Windows app package rebuilt successfully. The app remains closed.

## 2026-10-29 — Explicit source-color preservation instruction

- Made “keep/preserve original colors” an effective planner constraint: it now overrides profile and learned color grades on the proposed timeline and reports that override in planner metadata. This does not alter source files or saved profile data.
- Added route coverage proving the generated clip retains neutral color settings when the selected profile contains a grade.
- Processing suite (excluding the two sandbox-blocked TestClient files): 53 passed; desktop typecheck/lint and `git diff --check` passed. Windows package rebuilt successfully; app remains closed.

## 2026-10-29 — Non-repeating source-range planning

- Changed target-duration planning to split long scenes into distinct, non-overlapping source ranges instead of cycling through and repeating ranked moments. Timeline generation now reports the requested versus available duration, and the Editor explains any shortfall and suggests adding footage or shortening the target.
- Added planner tests for exact range partitioning and underfilled targets. Full available processing suite (excluding the two socket-blocked TestClient files): 55 passed; desktop typecheck/lint and `git diff --check` passed.
- Windows app package rebuilt successfully. The app remains closed. TestClient and in-process ASGI transport both encounter the sandbox's blocked Windows asyncio self-pipe; normal-environment integration remains outstanding.

## 2026-10-29 — Measured-signal reference similarity

- Added a local reference similarity endpoint and Reference Library action that rank up to 1,000 analyzed references by the overlap of measured pacing, visual, and coarse audio features. Results show their score and shared signals; at least three shared signals are required.
- This is descriptive signal matching, not semantic scene search or an embedding index. No face/person recognition or generative processing is involved.
- Added route coverage for ranked similar/dissimilar references. Available processing suite (excluding the two socket-blocked TestClient files): 56 passed; desktop typecheck/lint and `git diff --check` passed.
- Windows app package rebuilt successfully. The app remains closed.

## 2026-10-29 — Reference missing-file recovery

- Reference items now report when their managed video is missing. Added a video-only relink flow that copies/probes the replacement, refreshes stored metadata, clears stale analysis, and returns the reference to pending analysis. The UI prevents relinking while analysis is active and offers re-analysis after relink.
- Added direct route coverage for missing status and relinked metadata/analysis invalidation. Available processing suite (excluding the two socket-blocked TestClient files): 57 passed; desktop typecheck/lint and `git diff --check` passed.
- Windows app package rebuilt successfully. The app remains closed.

## 2026-10-29 — Socket-free full backend acceptance workflow

- Added an end-to-end acceptance test through the real project, reference import/analysis, style profile, source import, timeline generation, render job, output validation/quality analysis, and project reopen route functions. It uses generated video fixtures and FFmpeg, including an unsafe output-path rejection check.
- The full workflow passes without HTTP transport. It does not replace the separate TestClient checks for middleware, response serialization, or IPC; both HTTP transports still hit the sandbox's blocked asyncio self-pipe.
- Full available processing suite (excluding the two socket-blocked TestClient files): 58 passed, including this vertical slice. `git diff --check` passed.

## 2026-10-29 — Training evaluation and promotion gate

- Replaced the two-example holdout with deterministic stratified 25% holdout selection, retaining at least two fit examples per class. Candidate evaluation now records holdout count, majority accuracy, balanced accuracy, and balanced chance baseline.
- Candidates must meet majority accuracy and exceed chance-level balanced accuracy. After evaluation, the saved model is refit on all accepted ratings. Updated Training Studio and Model Manager metrics to show sample counts and balanced accuracy.
- Added learnable and uninformative dataset cases, including a promotion rejection check and rejection of legacy candidate files without the new metrics. Available processing suite (excluding the two socket-blocked TestClient files): 60 passed; desktop typecheck/lint and `git diff --check` passed.
- Windows app package rebuilt successfully. The app remains closed.

## 2026-10-29 — Rendered fades and crossfades

- Connected the existing transition schema to the Editor with cut, fade-from-black, crossfade, and editable transition duration controls. FFmpeg now renders matching video fades/crossfades and audio fades/acrossfades; timeline positions and total duration account for crossfade overlap.
- Added validation for transition duration, first-clip crossfades, and prior-clip length, plus an actual two-source FFmpeg crossfade test that verifies output duration and streams.
- Verification: available processing suite excluding the two Windows socket-blocked TestClient files passed (63 tests); desktop typecheck/lint passed; Windows `npm run package` succeeded; `git diff --check` passed. The app remains closed.

## 2026-10-29 — Explicit audio-priority planning

- Source moment ranking now attaches normalized rhythmic-onset and speech-like activity scores from the existing local audio analysis. The bounded editing brief can explicitly prioritize either signal; the chosen moment's reason calls out the heuristic. Missing/unreadable audio falls back to visual ranking.
- Exact beat alignment and reliable speech detection remain explicitly unsupported; no face, identity, or scene generation is involved.
- Verification: available processing suite excluding the two Windows socket-blocked TestClient files passed (67 tests); focused editor tests passed (25); desktop typecheck/lint passed; Windows `npm run package` succeeded; `git diff --check` passed. The app remains closed.

## 2026-10-29 — Optional shake-candidate ranking

- Added sparse within-shot global-flow analysis when a brief asks to avoid shaky footage. Candidate moments with reversals are down-ranked with an explanation; clean sparse samples are not described as a stability guarantee. The added flow analysis is skipped for ordinary timeline requests.
- Verification: available processing suite excluding the two Windows socket-blocked TestClient files passed (68 tests); desktop typecheck/lint passed; Windows `npm run package` succeeded; `git diff --check` passed. The app remains closed.
