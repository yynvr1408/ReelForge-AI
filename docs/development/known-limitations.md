# Known limitations

Honest list of what's missing or incomplete, so nothing here is mistaken for "done." Update this as gaps close.

## Not implemented

- **Natural-language editing instructions**: the editing planner is rule-based only (style profile → sequential clips at profile-derived shot duration). There is no LLM adapter (local or cloud) yet.
- **Color/audio/OCR/transcription reference analysis**: only scene-cut/shot-duration analysis is implemented. Color distribution, contrast/saturation stats, camera-motion detection, text-overlay OCR, speech transcription, and music beat detection are all unbuilt.
- **Reference similarity search**: no embeddings, no FAISS index.
- **Model training**: Training Studio currently only stages input reels in a real, visible folder (`%APPDATA%\ReelForge AI\training\input\`) and lists them — genuinely working, not mocked. Actually training a model (dataset manifests, task/model selection, hardware checks, training execution, checkpoints, evaluation, promotion/rollback) is not implemented. The UI says so explicitly rather than pretending a "Train" button does something.
- **Model Manager**: nav placeholder only.
- **Preference learning**: the `FeedbackEntry` database model exists; nothing collects, stores, or acts on feedback yet.
- **Generative AI features** (background replacement, video extension, etc.): not started.
- **Cloud AI providers**: no provider adapters exist; everything today is local/offline by construction (there's nothing to fail over from).
- **Collections/tags for reference videos**: the DB model has the columns; there's no API or UI to manage them yet.
- **Missing-file detection**: imported/reference media isn't re-validated against disk after import; a moved or deleted source file won't be flagged until something tries to use it and fails.

## Implemented but not fully hardened

- **Windows packaging**: `electron-forge package`/`make` produce a real `ReelForge AI.exe` and Squirrel installer, and the packaged app's processing service now actually starts and serves requests — verified by launching the packaged `.exe` directly (not just dev mode) and confirming the bundled `reelforge-processing.exe` (a PyInstaller-frozen build of the processing service, built automatically by a `prePackage` hook) reaches its ready state with a listening port. Two real bugs were caught and fixed getting here, both now covered by the lifecycle logging added along the way (`[lifecycle]`/`[updater]` lines in `processing-service.stdout.log`): see the 2026-10-27 entry in `docs/development/implementation-log.md`.
- **Auto-update outside a real Squirrel install**: `update-electron-app` correctly reports `Error: Can not find Squirrel` when the app is run from a plain `electron-packager` output folder instead of an actual Squirrel-installed location — this is expected and logged, not a crash. It hasn't been verified against a real Squirrel install (`Setup.exe` → installed app → update check) end-to-end yet.
- **Code signing**: not configured. Unsigned installers trigger Windows SmartScreen warnings.
- **Storage locations are not user-configurable**: the Settings page shows where things live and can open them in Explorer, but changing them (per spec section 30: configurable project/reference/media/model/dataset/checkpoint/export/cache/temp directories) isn't implemented — everything lives under Electron's fixed `userData` path.
- **Render progress**: the UI shows the current render *stage* (`encoding`, `complete`, etc.), not a numeric percentage — FFmpeg's own progress isn't parsed yet. This matches the spec's "show stage, not an invented percentage" rule, but a real percentage would be better UX.
- **Job cancellation**: `JobManager.cancel()` sets a cancellation flag, but `render_timeline()` doesn't check it mid-encode — an in-flight FFmpeg render can't actually be interrupted yet, only jobs that haven't started their subprocess.

## Deliberate scope decisions

- **Python 3.12 pinned** for the processing service venv, not whatever `python`/`py` defaults to. 3.14 was available on the dev machine but lacks prebuilt wheels for `opencv-python-headless` and other ML dependencies needed in later phases.
- **FFmpeg/FFprobe bundled via npm** (`ffmpeg-ffprobe-static`) rather than requiring a system install, so dev setup and eventual packaging share one source of truth for the binaries.
- **No ML training dependencies installed yet** (PyTorch, ONNX Runtime) — they're deferred until Phase 9 actually needs them, per the spec's "prefer a small, practical dependency set" guidance.
