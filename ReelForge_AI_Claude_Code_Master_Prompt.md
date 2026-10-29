# REELFORGE AI
## Complete Master Prompt for Claude Code

**Product:** ReelForge AI  
**Application type:** Electron desktop application  
**Primary platform:** Windows 11 x64  
**Architecture:** Electron + React + TypeScript + Python processing service  
**Operating model:** Offline-first, online-enhanced  
**Learning approach:** Reference learning + preference learning + actual model training  
**Rendering engine:** FFmpeg  
**Local database:** SQLite  

---

# MASTER INSTRUCTION

You are the principal software architect, Electron engineer, frontend engineer, Python engineer, AI/ML engineer, computer vision engineer, video-processing engineer, security engineer, UI/UX designer, DevOps engineer, and QA engineer responsible for building ReelForge AI.

Build a complete, functional, maintainable desktop application. Work directly in the available workspace, inspect the existing environment, implement real functionality, run tests, fix errors, maintain documentation, and prepare the application for Windows distribution.

This is not a request for a static interface, a proof of concept, a collection of disconnected scripts, or a basic FFmpeg wrapper.

The final product must be a working Electron desktop application with local video analysis, reference-style learning, AI-assisted editing, actual video rendering, optional online AI providers, local model management, and supported machine-learning training capabilities.

Implement the application incrementally while treating this entire specification as the target product.

Do not stop after creating the UI or project structure. Do not replace required functionality with hardcoded sample data or mock implementations. Mocks may be used only for automated tests or clearly identified development scaffolding. Do not claim a feature works unless the underlying implementation has been verified.

When an advanced capability cannot yet be implemented, document the blocker, build the supported foundation, and continue with other available work.

The user has explicitly selected **Electron**. Do not replace it with Tauri.

# 1. PRODUCT VISION

ReelForge AI is an AI-assisted desktop video editor with reference-video learning and optional model training.

The application must allow a user to:

1. Import downloaded reference videos.
2. Analyze their editing characteristics.
3. Create reusable style profiles.
4. Import original footage, images, and audio.
5. Describe the desired result in natural language.
6. Generate an editable timeline.
7. Preview and modify the proposed edit.
8. Render a new video.
9. Save the project and its metadata.
10. Provide feedback that can improve future editing decisions.
11. Train or fine-tune compatible models for supported tasks.

The application must support three separate learning mechanisms:

- **Reference learning:** Analyze videos and extract reusable editing characteristics. This does not inherently require neural-network training.
- **Preference learning:** Use explicit user feedback to improve supported editing decisions.
- **Model training:** Train or fine-tune compatible models for supported tasks using prepared datasets.

Do not confuse these mechanisms. The application must not require model training merely to create a style profile.

Core editing must work offline after required software and models have been installed. Cloud AI and online resources must be optional enhancements.

# 2. REQUIRED USER WORKFLOW

Implement this complete workflow:

1. Launch ReelForge AI.
2. Create a project.
3. Import downloaded reference videos.
4. Analyze scenes, timing, color, audio, text, and motion characteristics where supported.
5. Save one or more reference profiles.
6. Organize reference videos into collections.
7. Import original footage, images, and audio.
8. Select a reference profile.
9. Enter natural-language editing instructions.
10. Generate a structured editing plan.
11. Inspect and modify the timeline.
12. Preview the result.
13. Render the final reel.
14. Validate the rendered file.
15. Save the project.
16. Provide optional feedback.
17. Reuse or refine the learned profile in subsequent projects.

The user should not have to configure every cut, transition, effect, and color parameter manually. The user must retain control over the timeline and final export.

# 3. TECHNOLOGY STACK

Use a modular architecture based on:

## Desktop and frontend
- Electron.
- Electron Forge or another maintained, compatible Electron packaging solution.
- Electron main process and preload scripts.
- React and TypeScript.
- Vite or an equivalent compatible build system.
- Tailwind CSS.
- A maintained accessible component library where useful.
- A maintained icon library.
- A suitable timeline interaction library or custom timeline implementation.

## Local processing
- Python.
- FastAPI or an equivalent local service interface.
- Pydantic for request and response validation.
- SQLite.
- SQLAlchemy or another suitable persistence abstraction where justified.

## Media processing
- FFmpeg and FFprobe.
- OpenCV.
- PySceneDetect or an equivalent scene-detection library.
- Librosa or another suitable audio-analysis library.
- OCR and speech-recognition tools when appropriate.

## AI and machine learning
- PyTorch where required.
- ONNX Runtime where appropriate.
- Interchangeable local-model adapters.
- Interchangeable cloud-model adapters.
- FAISS or another suitable local vector-search implementation when justified.

## Testing
- Vitest or an equivalent frontend test framework.
- React Testing Library.
- Playwright or suitable Electron end-to-end tooling.
- pytest.
- Python integration tests.
- Media-processing validation tests.

Do not blindly install every library listed above. Check current package compatibility, maintenance, licensing, operating-system support, and resource requirements before selecting dependencies. Prefer a small, practical dependency set. Pin compatible dependency versions and document installation procedures.

# 4. ELECTRON SECURITY ARCHITECTURE

Follow Electron security best practices.

Configure:
- `contextIsolation: true`.
- `nodeIntegration: false` in renderer processes.
- Sandboxing wherever compatible with the chosen architecture.
- A minimal preload bridge.
- Explicit IPC channel allowlists.
- Validation of IPC payloads.
- Navigation restrictions.
- Restrictive Content Security Policy.
- Safe external-link handling.
- Controlled file-access mechanisms.
- Secure secret management.

Do not expose Node.js, unrestricted filesystem APIs, child-process APIs, or arbitrary shell execution to the renderer.

The React renderer must not directly execute Python, FFmpeg, or arbitrary system commands. Use a controlled preload API exposing only required application operations. Define typed request and response contracts for IPC.

Prevent untrusted content from accessing privileged Electron APIs. Do not load arbitrary remote web pages into a privileged renderer.

Keep cloud API credentials out of frontend bundles and version-controlled files.

# 5. LOCAL PYTHON PROCESSING SERVICE

Implement a reliable local processing service managed by the Electron main process.

The service must support:
- Startup and readiness checks.
- Graceful shutdown.
- Failure detection.
- Port-conflict handling.
- Request validation.
- Structured logging.
- Background jobs.
- Error reporting.
- Recovery from recoverable failures.

Prefer secure local IPC where practical. If localhost HTTP is used, bind to loopback interfaces by default and implement appropriate authentication or an equivalent local capability mechanism, restrictive CORS, request validation, and protection against unauthorized local access.

Do not expose the processing service publicly. Do not leave orphaned child processes when the application closes.

Package the Python service and required runtime dependencies so the application does not depend on an arbitrary Python environment being installed on the target computer. Optional training dependencies may be distributed separately where appropriate.

Provide a first-run dependency and capability check. Do not assume that a development-only Python environment exists on the target computer.

# 6. PROJECT STRUCTURE

Use this structure as a starting point, adapting it when technically justified:

```text
reelforge-ai/
  apps/
    desktop/
      src/
        main/
        preload/
        renderer/
          app/
          components/
          features/
            dashboard/
            projects/
            media-library/
            reference-library/
            reference-analysis/
            style-library/
            editor/
            timeline/
            rendering/
            training-studio/
            model-manager/
            render-queue/
            settings/
          hooks/
          services/
          stores/
          types/
      tests/
      forge.config.ts
      package.json

  services/
    processing/
      app/
        api/
        core/
        database/
        jobs/
        media/
        analysis/
        reference_learning/
        style_profiles/
        editing_planner/
        timeline/
        rendering/
        audio/
        vision/
        inference/
        training/
        model_manager/
        providers/
        security/
      tests/
      pyproject.toml

  packages/
    shared-types/
    timeline-schema/
    effect-registry/

  models/
    manifests/

  scripts/
    development/
    validation/
    packaging/

  docs/
    architecture/
    development/
    testing/
    security/
    training/
    user-guide/
    releases/

  tests/
    fixtures/
    integration/

  .github/
    workflows/

  README.md
  CONTRIBUTING.md
  SECURITY.md
  .gitignore
```

Do not create empty directories for every planned feature and claim that the architecture is complete. Create modules when their functionality is implemented. Keep dependency direction explicit and avoid circular dependencies.

# 7. APPLICATION DESIGN

Build a professional desktop editing interface rather than a generic administrative dashboard.

Design requirements:
- Professional light and dark themes.
- Neutral surfaces with a restrained orange accent.
- Consistent spacing and readable typography.
- Accessible contrast and visible focus states.
- Real icons from a maintained icon library.
- Resizable panels where appropriate.
- Clear loading, empty, success, and error states.
- Keyboard shortcuts where appropriate.
- Useful responsive layouts.

Orange should indicate primary actions and meaningful highlights, not dominate every component. Do not use emoji as interface icons. Avoid decorative cards that do not contribute to the workflow.

Every visible control must have real functionality or be explicitly marked as unavailable.

# 8. MAIN NAVIGATION AND DASHBOARD

Implement navigation for:
1. Dashboard.
2. Projects.
3. Media Library.
4. Reference Library.
5. Style Library.
6. Editor.
7. Training Studio.
8. Model Manager.
9. Render Queue.
10. Settings.

Preserve project state when navigating between screens.

The dashboard must display actual application state:
- Recent projects.
- Create-project action.
- Recent reference videos.
- Active render jobs.
- Active training jobs.
- Available models.
- Online/offline status.
- Available storage.
- Recent activity.
- Processing failures requiring attention.

Do not fabricate statistics, job progress, or model readiness. Provide useful empty states for new installations.

# 9. PROJECT MANAGEMENT

Implement:
- Create, rename, open, and save project.
- Save project versions.
- Duplicate and archive project.
- Delete with confirmation.
- Restore from backup.
- Manage project assets.
- View project history.
- Detect missing media.

Persist project settings and stable identifiers. Record project name, creation and modification times, schema version, output settings, asset references, selected style profiles, timeline, rendering history, and relevant model versions.

Do not store video files or model weights directly in SQLite. Store metadata and managed-file references. Implement safe migrations and backup/restore.

# 10. MEDIA LIBRARY

Allow users to import MP4, MOV, MKV, WebM, other formats supported by the installed processing stack, images, audio, and subtitle files.

Implement:
- File and directory import.
- Media probing.
- Duration, resolution, frame-rate, and audio-stream detection.
- Thumbnail extraction.
- Preview playback.
- File validation.
- Missing-file detection.
- Search, sorting, and filtering.
- Configurable storage locations.

Do not trust a file extension as proof that media is valid. Use FFprobe and controlled processing operations. Handle corrupted files gracefully. Avoid copying large files unnecessarily. Preserve originals unless the user explicitly authorizes deletion.

# 11. REFERENCE VIDEO ANALYSIS

The user must be able to import downloaded reference reels individually or in batches.

Analyze, where supported:
- Scene boundaries.
- Shot durations.
- Cut frequency.
- Aspect ratio, resolution, and frame rate.
- Color distribution.
- Contrast and saturation.
- Highlight and shadow characteristics.
- Estimated color-grading tendencies.
- Motion characteristics.
- Camera movement.
- Text overlays and subtitles.
- Audio characteristics.
- Speech and transcription.
- Music timing and beat positions.
- Transition estimates.
- Repeated editing patterns.

Use appropriate combinations of FFmpeg, FFprobe, OpenCV, scene-detection tools, OCR, speech recognition, audio analysis, and compatible computer-vision models.

Do not run expensive models when simpler algorithms are sufficient. Use configurable frame sampling. Support cancellation, progress reporting, persistence, and re-analysis.

Represent uncertain predictions with confidence values. Distinguish measured properties from inferred editing decisions. A finished video does not normally contain the original editor timeline, so do not claim that exact original editing operations have been recovered.

# 12. REFERENCE LIBRARY

Implement a searchable local reference library.

Users must be able to:
- Search by name.
- Filter by duration, aspect ratio, tags, and analysis status.
- Create and rename collections.
- Add and remove tags.
- Compare references.
- Inspect extracted features.
- Re-run analysis.
- Exclude references from style aggregation.
- Delete records safely.

Store local file paths or managed-media references. Do not upload the reference library automatically. Provide storage and disk-usage information. Support large libraries without loading every video or feature into memory simultaneously.

# 13. STYLE LEARNING

Create reusable style profiles.

A profile may include:
- Pacing and shot-duration distributions.
- Transition preferences and frequency.
- Color tendencies, contrast, and saturation.
- Audio synchronization.
- Typography and text placement.
- Camera-motion preferences.
- Aspect-ratio preferences.
- Effect preferences.
- Confidence estimates.

Support profiles created from one reference, multiple references, user-edited settings, or combinations of references and instructions.

When combining references, aggregate appropriate statistics and preserve meaningful variation. Do not copy settings from one arbitrary video and label them a learned style.

Allow manual adjustments, profile versioning, reuse across projects, and export/import of profile metadata where appropriate. Do not include copyrighted source footage in profile exports unless explicitly requested and authorized.

# 14. NATURAL-LANGUAGE EDITING

Implement an editing assistant that accepts instructions such as:
- “Create a 30-second cinematic travel reel.”
- “Use the selected reference style.”
- “Make the colors darker.”
- “Preserve natural skin tones.”
- “Synchronize cuts with the music.”
- “Use slower transitions.”
- “Keep the original dialogue.”
- “Create three alternative edits.”
- “Make the opening more engaging.”
- “Use the most visually interesting moments.”

Convert instructions into a validated editing plan.

Do not let a language model generate unrestricted shell commands or arbitrary executable code. Use a typed editing schema. Validate source-media references, durations, effects, and parameters.

Implement a rule-based fallback for supported operations. Basic editing must work without a local LLM. Support optional cloud LLM providers through interchangeable adapters. Do not make the editor dependent on a specific cloud vendor.

# 15. EDITING TIMELINE

Implement a structured timeline containing:
- Video and audio tracks.
- Clip source identifiers.
- Source in-points and out-points.
- Timeline positions.
- Playback speed.
- Crop, scale, position, and supported rotation.
- Color adjustments.
- Effects and transitions.
- Text overlays and subtitles.
- Audio gain and fades.
- Music synchronization markers.
- Export settings.

Implement validation, serialization, deserialization, schema versioning, and migrations.

The timeline is the authoritative description of the intended edit. The renderer must execute validated timeline operations.

Implement basic editing before complex drag-and-drop behavior. Support clip selection, trimming, reordering, removal, duration changes, supported transitions, color and audio adjustment, text overlays, and preview.

Do not store all project state only in frontend memory.

# 16. VIDEO RENDERING

Use FFmpeg as the primary rendering engine.

Implement:
- Trimming and concatenation.
- Scaling and cropping.
- Aspect-ratio and frame-rate conversion.
- Color correction and grading.
- Fades, crossfades, and supported transitions.
- Audio mixing and fades.
- Speed adjustments and supported speed ramps.
- Text overlays and subtitles.
- Export presets.

Generate filter graphs through validated code. Use safe subprocess argument arrays. Never concatenate untrusted model output directly into shell commands.

Run rendering as background jobs. Support progress reporting, cancellation where practical, retry of recoverable failures, temporary-file management, output validation, error logs, and job history.

Do not block the Electron renderer during rendering. Do not mark a render successful until the output has been validated. If progress cannot be measured reliably, show the current stage rather than inventing a percentage.

# 17. OUTPUT PRESETS

Provide presets for:
- Vertical 1080 × 1920.
- Vertical 720 × 1280.
- Landscape 1920 × 1080.
- Square 1080 × 1080.

Support configurable frame rates and quality settings. Use H.264/AAC MP4 as a broadly compatible default where appropriate.

Validate output dimensions, duration, readability, audio presence, synchronization, file size, and expected frame rate within applicable tolerances.

# 18. OFFLINE-FIRST OPERATION

Offline support is mandatory.

After installation and required model setup, support:
- Project management.
- Local media ingestion.
- Reference analysis.
- Style-profile generation.
- Local search.
- Timeline editing.
- Basic editing-plan generation.
- Video rendering.
- Local preference storage.
- Dataset preparation.
- Supported local model training.
- Exporting completed videos.

Online capabilities may include cloud LLMs, cloud generative video, additional model downloads, authorized online assets, cloud backups, optional synchronization, and application updates.

Implement capability and provider-health detection for online, offline, unavailable provider, authentication failure, rate limiting, and degraded service. Use bounded retries. Preserve project state when cloud operations fail. Provide a local fallback where one exists.

Do not silently substitute a materially different operation without informing the user. Never upload source media without explicit consent.

# 19. LOCAL MODEL MANAGER

Implement:
- Model registry and manifests.
- Model discovery, installation, and removal.
- Version and license information.
- Hardware and storage requirements.
- Integrity checks.
- Download and installation progress.
- Readiness and compatibility checks.
- Configurable model directories.
- Model loading and unloading.

Do not download large models automatically at startup. Require explicit user action for substantial downloads. Allow models to be stored outside the system drive. Do not load every model into memory simultaneously. Separate core dependencies from optional model packages. Verify licenses and redistribution rights.

# 20. REFERENCE SIMILARITY SEARCH

Where appropriate models are available, extract visual or semantic embeddings for frames and clips. Use them to retrieve source footage relevant to scene content, composition, actions, camera movement, color, or semantic descriptions.

Use FAISS or an appropriate alternative when justified. Implement index persistence and rebuilding. Track the model version used to create embeddings. Rebuild incompatible indexes when the underlying model changes. Provide metadata-based search as a fallback.

# 21. ACTION-AWARE EDITING

Add action recognition and temporal analysis where supported.

Identify useful moments, such as a person entering a scene, a vehicle passing the camera, a subject turning toward the camera, or a camera panning across a landscape.

Use action information to select footage that fits a reference sequence. Do not claim exact motion replication from action labels alone. Treat pose transfer, advanced motion transfer, and generative reenactment as optional capabilities. Measure whether a model improves the workflow before making it a required dependency.

# 22. COLOR GRADING

Create a modular color subsystem separating:
- Basic correction.
- Creative grading.
- Reference matching.
- Adaptive scene adjustments.

Support exposure, contrast, saturation, temperature, tint, highlights, shadows, gamma, and supported curves or LUT operations.

Use adaptive adjustments when necessary. Do not blindly apply the same color transform to every scene. Preserve detail and avoid excessive clipping where possible. Allow inspection and modification, reusable profiles, and preview rendering.

# 23. AUDIO ANALYSIS AND SYNCHRONIZATION

Implement supported audio features:
- Audio-stream extraction.
- Beat detection and tempo estimation.
- Silence detection.
- Speech transcription.
- Audio normalization.
- Volume adjustment.
- Fades.
- Music synchronization markers.
- Audio-video synchronization checks.

Do not assume every track has a clear beat. Support user-selected markers. Preserve original dialogue when requested. Avoid mixing music so loudly that dialogue becomes unintelligible. Respect licensing and usage rights for imported music.

# 24. USER PREFERENCE LEARNING

Collect explicit feedback, including accepting or rejecting edits, choosing variations, adjusting color intensity or shot duration, retaining or removing transitions, and preferring one style profile.

Store structured feedback and associate it with project/model versions where appropriate.

Implement an initial preference-ranking or rule-adjustment mechanism. Allow users to inspect and delete feedback. Do not silently treat rejected examples as positive training data. Do not infer sensitive personal attributes from media. Do not implement reinforcement learning without a concrete, validated use case.

# 25. TRAINING STUDIO

Create a dedicated Training Studio that clearly distinguishes reference analysis from actual model training.

Support selected tasks such as:
- Editing-style classification.
- Transition classification.
- Clip-ranking models.
- Preference-ranking models.
- Other compatible lightweight models.

Do not promise universal fine-tuning support. Check model architecture, training method, license, memory requirements, and hardware compatibility.

The interface must include:
- Dataset selection and inspection.
- Dataset manifests and validation.
- Training-task and model selection.
- Hardware detection and resource estimates.
- Training configuration and validation split.
- Progress and metrics.
- Checkpoints.
- Cancellation and failure recovery.
- Model comparison.
- Model promotion and rollback.
- Training history.

Run training in background processes. Do not freeze the UI. Do not automatically replace the active model when training finishes. Require evaluation and explicit approval before promotion.

Record the base model, model version, dataset manifest and version, training configuration, software versions, evaluation results, output checkpoint, timestamp, and job status.

# 26. TRAINING RESOURCE MANAGEMENT

Before training, validate:
- Available disk space.
- Available system memory.
- GPU availability and GPU memory where measurable.
- Dataset and model compatibility.
- Output destination.
- Required dependency availability.

Do not assume CUDA is available. Support CPU training for suitable small tasks and GPU acceleration where supported.

Provide resource warnings, cancellation, and checkpoints for supported tasks. Do not claim successful training merely because the dataset was analyzed.

  # 27. GENERATIVE AI

Generative features that alter a person's face or body, replace a face, synthesize people, change clothing, or replace/invent scene content are out of scope for this product. AI editing must analyze and arrange user-provided source footage. Reframing must use source pixels or letterboxing; it must not generate fill. Conventional, user-visible color, stabilization, crop, audio, and caption edits remain allowed. Any future generative operation outside these boundaries requires an explicit product decision and must never be part of the default editing workflow.

Evaluate each integration for licensing, commercial-use permissions, model size, hardware requirements, operating-system support, runtime compatibility, latency, cost, input/output formats, and quality limitations.

Do not hard-code one vendor. Require explicit consent before sending media to remote providers. Preserve provenance metadata where practical. Clearly identify generated content. Do not use mock responses to claim a generative capability works.

# 28. BACKGROUND JOB SYSTEM

Implement a unified background-job system for:
- Media import.
- Metadata extraction.
- Thumbnail generation.
- Reference analysis.
- Embedding extraction.
- Timeline generation.
- Preview rendering.
- Final rendering.
- Dataset preparation.
- Model training.
- Model downloads.

Each job must have a unique ID, type, status, timestamps, progress when measurable, current stage, cancellation support where practical, error details, output references, and retry policy.

Persist useful job state. Handle interrupted jobs safely. Do not restart destructive jobs automatically without checking their state. Long-running tasks must not block the interface.

# 29. DATABASE

Use SQLite for local persistence with safe migrations and suitable indexes.

Include entities for:
- Projects and project versions.
- Media assets.
- Reference videos and collections.
- Extracted features and scene boundaries.
- Style profiles and versions.
- Timeline tracks, clips, effects, transitions, and audio tracks.
- Render jobs and outputs.
- Training datasets, samples, and jobs.
- Model manifests and versions.
- Preferences and editing feedback.
- Provider configurations.
- Application settings.
- Migration history.

Use stable IDs and foreign keys where appropriate. Do not store large video files or model weights as ordinary database blobs. Implement backup and restore. Protect user data during migrations.

# 30. STORAGE MANAGEMENT

Allow configuration of:
- Project directory.
- Reference-video directory.
- Imported-media directory.
- Model directory.
- Training-dataset directory.
- Checkpoint directory.
- Export directory.
- Cache directory.
- Temporary-processing directory.

Display storage usage. Avoid unnecessary duplicates. Clean temporary files safely. Never delete original source media without explicit authorization. Support suitable secondary drives, missing-drive handling, and configurable cache limits.

# 31. SECURITY AND PRIVACY

Treat imported files and model outputs as untrusted.

Implement input validation, path normalization, path-traversal protection, safe archive extraction, controlled temporary directories, safe subprocess execution, local-service access controls, restrictive network exposure, secret management, secure logging, resource limits, file-integrity checks, dependency auditing, and explicit cloud-upload consent.

Do not trust a file because of its extension. Do not execute commands derived from arbitrary model output. Do not expose secrets in logs or renderer code.

Do not build features intended to bypass DRM, access controls, or other technical restrictions. Analyze reference styles and use source media the user is authorized to use. Do not reproduce protected footage or music merely because a reference was supplied.

# 32. TESTING

Implement unit, integration, and end-to-end tests.

## Frontend tests
Test navigation, project creation, form validation, settings, job-state display, error states, timeline interactions, and accessibility fundamentals.

## Backend tests
Test media metadata, scene analysis, database operations, timeline validation, color parameter validation, rendering configuration, project serialization, model manifests, training configurations, provider errors, and job cancellation.

## Integration tests
Test the complete workflow:

Import reference → analyze reference → save style → import source footage → generate timeline → render output → validate output → reopen project.

Test offline behavior. Use small, licensed fixtures. Routine tests must not depend on large model downloads or cloud availability.

For each successful render, verify that the output can be read by FFprobe or equivalent tooling. Check duration, dimensions, and audio presence.

Measure performance on the actual environment. Do not invent benchmarks.

# 33. ERROR HANDLING

Distinguish user-input errors, invalid media, missing dependencies, missing files, storage exhaustion, rendering failures, model-loading failures, training failures, network failures, authentication failures, database errors, and internal errors.

Provide concise, actionable user messages. Store detailed diagnostics locally and redact secrets. Do not silently swallow exceptions. An individual failed job must not crash the entire application. Preserve project state after failures.

# 34. WINDOWS PACKAGING

Produce an installable Windows application using Electron Forge or another suitable maintained packaging solution.

Investigate packaging for Electron, React assets, Python processing service, required Python dependencies, FFmpeg, FFprobe, database migrations, and configuration.

Do not assume the target computer has Python or FFmpeg installed. Bundle required runtime components or provide a tested, explicit setup process. Optional large models may be installed separately.

Implement versioned builds, installation and uninstallation, user-data preservation, first-run checks, diagnostics, release notes, dependency licensing, online update checks, offline startup, and graceful shutdown.

Review licenses before distributing third-party binaries or models.

Test the packaged application on a clean environment rather than relying only on development mode.

# 35. DOCUMENTATION

Maintain these files:

- `README.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `docs/architecture/system-overview.md`
- `docs/architecture/architecture-decisions.md`
- `docs/development/setup.md`
- `docs/development/implementation-roadmap.md`
- `docs/development/implementation-log.md`
- `docs/development/known-limitations.md`
- `docs/testing/test-strategy.md`
- `docs/training/training-guide.md`
- `docs/user-guide/reference-library.md`
- `docs/user-guide/video-editing.md`
- `docs/user-guide/offline-operation.md`
- `docs/releases/release-process.md`

Document actual functionality. Do not describe future features as completed. Provide commands for development, testing, packaging, and troubleshooting.

# 36. IMPLEMENTATION PHASES

Implement these phases in dependency order. Adapt the sequence when technical dependencies or test results justify it.

## Phase 0 — Environment inspection and planning
Inspect the workspace, Git status, Node.js, package manager, Python, FFmpeg, operating system, and available hardware. Create architecture documents and the implementation roadmap.

## Phase 1 — Electron foundation
Build the Electron main process, preload bridge, React interface, Python service lifecycle, SQLite initialization, settings, logging, and error handling.

## Phase 2 — Media library
Implement video import, metadata extraction, thumbnails, preview playback, file validation, and storage management.

## Phase 3 — Reference analysis
Implement scene detection, shot-duration analysis, color statistics, audio analysis, and optional OCR/transcription.

## Phase 4 — Reference library and style profiles
Implement collections, tags, profile extraction, editing, persistence, and similarity search.

## Phase 5 — Timeline and rendering
Implement a validated timeline, basic editing interactions, FFmpeg rendering, export presets, background jobs, and output validation.

## Phase 6 — AI editing planner
Implement structured natural-language editing, rule-based fallback, local LLM adapters, optional cloud LLM adapters, and timeline generation.

## Phase 7 — Advanced video intelligence
Implement suitable visual embeddings, action-aware clip selection, motion analysis, transition classification, adaptive color matching, and audio-aware editing.

## Phase 8 — Preference learning
Implement explicit feedback collection and a baseline preference-ranking mechanism.

## Phase 9 — Training Studio
Implement dataset preparation, one real supported training task, checkpoints, evaluation, model versioning, promotion, and rollback.

## Phase 10 — Model manager
Implement model installation, integrity checks, license metadata, compatibility checks, hardware detection, and resource-aware loading.

## Phase 11 — Generative AI
Add optional, genuinely implemented generative capabilities after evaluating model and hardware requirements.

## Phase 12 — Production hardening
Complete integration tests, error recovery, offline tests, security review, storage handling, and performance measurements.

## Phase 13 — Release candidate
Package the Windows application and complete installation, upgrade, recovery, documentation, and clean-environment verification.

Do not implement all phases in one unverified code-generation pass.

# 37. EXECUTION RULES FOR CLAUDE CODE

1. Inspect existing files before editing them.
2. Preserve user modifications.
3. Do not delete files or data without authorization.
4. Prefer complete, testable vertical slices.
5. Do not create nonfunctional placeholder features.
6. Use typed interfaces.
7. Validate external inputs.
8. Keep frontend, desktop, backend, AI, and rendering responsibilities separate.
9. Avoid circular imports.
10. Pin dependencies.
11. Run relevant tests after changes.
12. Fix regressions introduced by changes.
13. Update documentation.
14. Maintain a persistent implementation roadmap.
15. Record blockers and limitations.
16. Avoid unnecessary confirmation requests for reversible engineering decisions.
17. Ask before actions involving irreversible data loss, significant unexpected costs, or major security exposure.
18. Do not push code or publish releases without authorization.
19. Verify dependency installation rather than assuming it succeeded.
20. Do not claim untested features work.
21. Do not claim a model was trained when only features were extracted.
22. Do not claim offline operation works without testing it.
23. Do not claim packaging works merely because development mode launches.
24. If context or execution limits interrupt work, save progress and update the implementation log.
25. Resume by inspecting the actual project state.

# 38. ACCEPTANCE CRITERIA

The initial functional release must demonstrate this workflow:

1. Launch the Electron application.
2. Create a project.
3. Import a downloaded reference video.
4. Extract metadata.
5. Detect scene boundaries.
6. Generate and save a basic style profile.
7. Import source footage.
8. Generate a validated editing timeline.
9. Render a new video.
10. Verify the resulting video.
11. Save the project.
12. Close the application.
13. Reopen the project.
14. Continue editing.
15. Repeat the supported workflow without internet access.

Advanced acceptance criteria include reusable style profiles, reference similarity search, natural-language editing, local inference, optional cloud AI, preference learning, a genuinely trainable supported model, training evaluation and model promotion, optional generative capabilities, and reliable Windows packaging.

Track each criterion as:
- Not started.
- In progress.
- Implemented.
- Tested.
- Blocked.

Never mark a criterion as tested without evidence.

# 39. INITIAL EXECUTION INSTRUCTIONS

Begin immediately.

First inspect the workspace and available development environment. Determine whether the repository is empty or already contains code. Check Node.js, the package manager, Python, FFmpeg, Git, and hardware capabilities relevant to local inference and training. Do not assume a compatible GPU is available.

Create or update architecture documentation and the implementation roadmap.

After planning, begin implementing the application rather than stopping after writing documentation.

Build the Electron foundation and the first working vertical slice.

The first vertical slice must support:

- Launching the desktop application.
- Creating a project.
- Importing a local reference video.
- Extracting metadata.
- Detecting scene boundaries.
- Saving a basic reference profile.
- Importing source footage.
- Creating a simple editing timeline.
- Rendering an MP4.
- Validating the output.
- Saving and reopening the project.

Run tests, correct failures, and verify the workflow.

After the first vertical slice is stable, continue through the remaining phases in dependency order.

At each milestone, update the roadmap and implementation log.

At the end of each execution session, report:
- Implemented features.
- Important files changed.
- Commands executed.
- Tests passed and failed.
- Manual verification completed.
- Known limitations.
- Remaining tasks.
- Current milestone.
- Next recommended task.

Do not stop after producing an implementation plan if development work can proceed. Do not force every advanced feature into the initial release.

Prioritize a reliable Electron desktop application with a functional offline editing pipeline, then progressively implement reference intelligence, personalized learning, model training, and advanced generative editing.

**Begin Phase 0 and proceed with implementation.**
