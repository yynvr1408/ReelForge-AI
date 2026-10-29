# Implementation roadmap

Tracks the phases from the product spec (`ReelForge_AI_Claude_Code_Master_Prompt.md`, section 36) against actual build state. Status values: **Not started**, **In progress**, **Implemented**, **Tested**, **Blocked**.

| Phase | Status | Notes |
|---|---|---|
| 0 — Environment inspection and planning | Tested | Node/Python/FFmpeg/git inspected; this roadmap + architecture docs written |
| 1 — Electron foundation | Tested | Main process, preload bridge (contextIsolation/sandbox/nodeIntegration:false), Python service lifecycle (spawn, readiness handshake, graceful shutdown), SQLite init, structured JSON logging, CSP, navigation restrictions |
| 2 — Media library | In progress | Import, FFprobe validation, thumbnails, stable server-side 48-item pagination, page-level missing-file revalidation/relinking, and recursive folder/multi-file import with per-file results are implemented. Full end-to-end verification remains |
| 3 — Reference analysis | In progress | Scene boundaries, sampled sharpness/exposure/saturation/flow, coarse global-flow shake candidates, RMS/silence/transient analysis, bounded autocorrelation tempo hypotheses, spectral-flux rhythmic onset candidates, and coarse speech-like activity ranges are implemented. Audio signals remain review-only heuristics, not beat tracking, VAD, transcription, or automatic sync; OCR, framing, and transition classification remain |
| 4 — Reference library and style profiles | In progress | Import, missing-file detection/relinking with re-analysis invalidation, analysis, pacing/visual/audio aggregation, collections, tags, filters, exclusion controls, stable 50-item server-side pagination, two-reference comparison, measured-signal similarity ranking, persisted cancellable analysis jobs with restart recovery, versioned JSON profile import/export, and editable pacing/manual color controls that feed generated timelines exist. Similarity is a bounded heuristic over overlapping measured signals, not semantic search. Measured visual/audio signals remain read-only; beat/speech editing controls remain unavailable. Analysis reports stages rather than percentage; cancellation is cooperative and scene-stage responsiveness depends on detector callbacks |
| 5 — Timeline and rendering | In progress | Typed timeline, validation, rendering, cancellation, path validation, trim/speed/reorder/remove controls, per-clip color controls, per-clip FFmpeg deshake with blank edges, source-pixel crop positioning, editable black fades and actual video/audio crossfades, timed text captions with a matching 10% safe-area preview, selectable 9:16/16:9/1:1 export presets, bounded output dimensions/frame rate, persistent save checkpoints with timeline restore, a 50-step in-session undo/redo history, and post-render black, sample-peak, integrated LUFS, and true-peak scans are implemented. Full workflow verification and clean install verification remain; granular undo steps are session-only |
| 6 — AI editing planner | Implemented | Rule-based ranked moments, bounded brief parser, modular LLM adapter architecture (RuleBased offline default, LocalOllama, CloudOpenAI), and alternative editorial proposal generation (dynamic/cinematic/balanced) are implemented and wired into EditorPage and IPC |
| 7 — Advanced video intelligence | Implemented | Technical visual/audio measurements, beat tracking & tempo quantization, cut-to-beat snapping, music sync scoring, embedded subtitle extraction (SRT/mov_text), speech-activity caption generation, sparse motion flow-reversal shake down-ranking, and post-render QA loudness/clipping analysis are implemented |
| 8 — Preference learning | Implemented | Explicit pacing, clip-source, and color-grade feedback affects future plans with smoothed bounded offsets; original colors remain default until user saves a grade |
| 9 — Training Studio | Implemented | Offline logistic preference model trained from explicit pacing ratings, deterministic stratified holdout evaluation against majority and chance baselines, background training runs with progress and cancellation, candidate promotion and rollback, and structured dataset manifest authoring with balance checks |
| 10 — Model manager | Implemented | Model Manager lists supported pacing model, activates evaluated candidates, rolls back, verifies SHA-256 integrity, reports MIT licensing, CPU/architecture compatibility, host RAM diagnostics, and low-memory policy |
| 11 — Generative AI | Deliberately excluded | Product requirement is original-pixel editing only: no face/body edits, generated people/frames, or scene replacement. AI assistance is limited to analysis and explainable edit proposals |
| 12 — Production hardening | Implemented | Renderer isolation, token-authenticated loopback service, render path traversal sanitization, render and analysis cancellation, pre-migration SQLite backup, and one-click cache purge |
| 13 — Release candidate | In progress, package works; installer blocked in sandbox | `npm run package` and the package stage of `npm run make` succeed, producing the Windows `.exe`, `resources/rf/reelforge-processing.exe`, bundled FFmpeg/FFprobe, and Squirrel `.nupkg`. Normal-environment Setup.exe generation, clean install, and auto-update verification remain outside sandbox restrictions. |

## What the current vertical slice actually demonstrates

The full backend acceptance workflow now passes in `services/processing/tests/test_vertical_slice.py`, which uses real FFmpeg/PySceneDetect, managed media copies, the actual route functions, the background render job, and a rendered output. It avoids HTTP transport and therefore does not cover HTTP serialization, token middleware, or Electron IPC. The HTTP workflow in `test_integration_workflow.py` is still unverified here: Starlette `TestClient` stalls while AnyIO constructs the Windows asyncio self-pipe, and direct HTTPX `ASGITransport` also stalls because `asyncio.run` constructs the same self-pipe. This restricted sandbox cannot provide that local socket pair:

1. Create a project
2. Import a reference video → FFprobe metadata extracted
3. Detect scene cuts (PySceneDetect) → shot durations, cut count, confidence
4. Build a style profile aggregating pacing statistics across reference(s)
5. Import source footage → FFprobe metadata extracted
6. Generate a validated timeline using the style profile's median shot duration and a target total duration
7. Render the timeline with FFmpeg (trim, scale/crop to export preset, color eq, concat)
8. Re-probe and validate the rendered output (duration/dimensions/audio-presence tolerance checks)
9. Scan the rendered output for sustained black intervals and near-clipping audio peaks, and show a review report
10. Save the timeline onto the project, reopen the project, confirm it round-trips

The workflow is wired through the Electron Editor page. Manual UI verification and transport/middleware-level integration in a normal Windows environment remain outstanding.

## Remaining work (in order)

1. Run the full HTTP TestClient workflow in a normal Windows environment (the backend route-level vertical slice now passes here; this sandbox stalls before the first HTTP request because its asyncio socketpair is unavailable); finish transport-level missing-media, reference, feedback, and project-version coverage
2. Add editable audio/visual style controls based on reliable measured signals (editable pacing/manual color, versioned JSON import/export, stable pagination, measured comparison, and persisted analysis jobs are now in place)
3. Improve audio analysis beyond review-only onset/speech-like heuristics to reliable beat/speech separation; add shake/redundancy/action signals and caption/OCR inspection with explicit confidence and user review
4. Add stabilization quality/reframing review and richer history comparison while preserving source pixels (per-clip conventional deshake, saved timeline checkpoints/restore, basic export presets, caption safe-area preview, and integrated loudness QA are in place)
5. Extend Training Studio with dataset authoring, additional task selection, and broader comparative evaluation (training-run cancellation/progress is now implemented)
6. Expand Model Manager only when additional model formats and offline lifecycles are selected and validated
7. Complete security/dependency review, resolve the stalled full TestClient workflow, and verify Squirrel install/update on a clean Windows VM with signing credentials

**AI editing constraint:** all proposed edits must use the user's original frames and audio. No face/body changes, face replacement, generated frames, or generative scene replacement. Reframing may crop source pixels or letterbox, never synthesize fill.
