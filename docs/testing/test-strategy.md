# Testing Strategy

ReelForge AI enforces a multi-tier testing strategy covering frontend type safety, backend logic, rendering validation, and end-to-end integration.

## 1. Backend Test Suite (Pytest)

The processing service test suite is located in `services/processing/tests/`. It synthesizes video fixtures dynamically using FFmpeg's `lavfi` source filters (`testsrc`, `color`, `sine`), requiring zero external media files or network access.

### Core Test Modules
- `test_ffprobe.py`: Probing duration, dimensions, stream types, and audio presence.
- `test_scene_detection.py`: PySceneDetect cut detection and shot boundary extraction.
- `test_editorial_analysis.py`: Sampled brightness, saturation, sharpness, and optical flow estimation.
- `test_audio_intelligence.py`: Beat grid generation, cut-to-beat snapping, sync scoring, and SRT parsing.
- `test_style_profile_audio.py`: Aggregating audio metrics across reference videos.
- `test_llm_adapters.py`: Brief parsing, alternative edit generation, and offline fallback resilience.
- `test_timeline_schema.py`: Timeline validation, track/clip constraints, transition offsets, and color limits.
- `test_project_libraries.py`: Project CRUD, version history restore, paginated media & reference libraries, missing file relinking.
- `test_dataset_manifest.py`: Feedback dataset authoring, sample balance checks, and manifest checksums.
- `test_training_workflow.py`: Stratified 25% holdout evaluation, balanced accuracy baseline, background job cancellation, and model rollback.
- `test_render_quality.py`: Post-render QA scans for black frame intervals, sample peak, and EBU R128 integrated LUFS.
- `test_vertical_slice.py`: Full socket-free acceptance workflow: Project -> Reference -> Style Profile -> Media -> Timeline -> Render -> Reopen.

### Running Backend Tests
```bash
cd services/processing
./.venv/Scripts/python -m pytest -v
```

## 2. Frontend Test & Verification Suite

- **TypeScript Static Verification**: `tsc --noEmit` verifies strict IPC contract alignment between preload and renderer components.
- **Linting & Formatting**: `oxlint` and `oxfmt` enforce clean syntax and consistent code formatting across all `.ts` and `.tsx` files.

### Running Frontend Verification
```bash
cd apps/desktop
npm run typecheck
npm run lint
```
