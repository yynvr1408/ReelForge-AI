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

- **Windows packaging**: `electron-forge package`/`make` config exists (Squirrel, ZIP, deb, rpm makers) but has not been run or validated on a clean machine. The processing service, Python runtime, and FFmpeg binaries are not yet bundled for a packaged build — `src/main/paths.ts` has the packaged-path resolution logic stubbed in but untested, since nothing has packaged it yet.
- **App icon**: a PNG (`apps/desktop/assets/icon.png`) is wired into the dev `BrowserWindow`, but Electron Forge's Windows maker (Squirrel) needs an `.ico` file for the installer/exe icon — that conversion hasn't been done, and `forge.config.mts` doesn't reference the icon yet.
- **Storage locations are not user-configurable**: the Settings page shows where things live and can open them in Explorer, but changing them (per spec section 30: configurable project/reference/media/model/dataset/checkpoint/export/cache/temp directories) isn't implemented — everything lives under Electron's fixed `userData` path.
- **Render progress**: the UI shows the current render *stage* (`encoding`, `complete`, etc.), not a numeric percentage — FFmpeg's own progress isn't parsed yet. This matches the spec's "show stage, not an invented percentage" rule, but a real percentage would be better UX.
- **Job cancellation**: `JobManager.cancel()` sets a cancellation flag, but `render_timeline()` doesn't check it mid-encode — an in-flight FFmpeg render can't actually be interrupted yet, only jobs that haven't started their subprocess.

## Deliberate scope decisions

- **Python 3.12 pinned** for the processing service venv, not whatever `python`/`py` defaults to. 3.14 was available on the dev machine but lacks prebuilt wheels for `opencv-python-headless` and other ML dependencies needed in later phases.
- **FFmpeg/FFprobe bundled via npm** (`ffmpeg-ffprobe-static`) rather than requiring a system install, so dev setup and eventual packaging share one source of truth for the binaries.
- **No ML training dependencies installed yet** (PyTorch, ONNX Runtime) — they're deferred until Phase 9 actually needs them, per the spec's "prefer a small, practical dependency set" guidance.
