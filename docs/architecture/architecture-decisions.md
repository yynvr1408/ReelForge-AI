# Architecture Decision Records (ADR)

## ADR 01: Electron over Tauri
- **Context**: The product requires rich desktop integration, bundled Python runtimes, embedded FFmpeg binaries, and standard Windows 11 packaging.
- **Decision**: Electron was chosen as mandated by the master specification. It provides battle-tested process isolation, reliable preload sandboxing, and consistent Chromium rendering across Windows installations.

## ADR 02: Python 3.12 Virtual Environment & PyInstaller Freeze
- **Context**: Video analysis and machine learning dependencies (OpenCV, PyTorch, PySceneDetect) have prebuilt binary wheels on Python 3.12, whereas 3.13 and 3.14 frequently lack precompiled Windows wheels.
- **Decision**: Pin the processing service to Python 3.12. In development, the Electron main process invokes the `.venv` interpreter. In packaged builds, PyInstaller bundles the frozen executable into `resources/rf/reelforge-processing.exe`.

## ADR 03: Original-Pixel Editing Principle (Non-Generative)
- **Context**: Many AI video tools produce generative hallucinations, synthetic faces, or unnatural artifacts.
- **Decision**: ReelForge AI strictly enforces original-pixel editing. AI is used solely for scene detection, metric extraction, moment scoring, natural language brief translation, and timeline proposals. All final video frames are rendered directly from user-provided source media.

## ADR 04: Three Separate Learning Paradigms
- **Decision**: Separate Reference Learning, Preference Learning, and Model Training into distinct decoupled subsystems:
  1. *Reference Learning*: Statistical profile aggregation from reference video cuts and color without neural training.
  2. *Preference Learning*: Heuristic Bayesian/bounded offsets derived from thumbs-up/down clip votes and pacing ratings.
  3. *Model Training*: Offline logistic preference regression evaluated against stratified holdout sets before candidate promotion.

## ADR 05: Offline-First Operation with Pluggable Cloud Fallbacks
- **Decision**: The editor must remain 100% operational offline without internet access. Local rule-based parsing and local analysis serve as the default. Local Ollama or cloud LLM adapters (OpenAI) are optional enhancements that degrade gracefully to rule-based execution when offline.
