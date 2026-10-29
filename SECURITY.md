# Security

ReelForge AI is a local-first desktop app. The processing service never listens outside loopback, and imported files/model outputs are treated as untrusted. See `ReelForge_AI_Claude_Code_Master_Prompt.md` section 31 for the full requirements this follows.

## What's implemented today

- **Electron renderer hardening**: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`. The renderer has zero direct access to Node.js, the filesystem, child processes, or the network — every operation goes through a fixed, typed IPC channel allowlist (`apps/desktop/src/shared/ipc-contract.ts`).
- **Content-Security-Policy**: strict in production builds (`default-src 'self'`, no `unsafe-eval`); relaxed only for Vite's dev-mode HMR websocket, never shipped.
- **Navigation restrictions**: `will-navigate` and `window.open` are intercepted; anything that isn't the app's own dev-server/bundle is routed to the OS browser via `shell.openExternal`, never loaded into a privileged renderer.
- **Local service auth**: the processing service binds to `127.0.0.1` only and requires a bearer token on every request except `/health`. The token is a random 32-byte value generated fresh per app launch, passed to the service via environment variable and held only in the Electron main process — it is never sent to the renderer, written to disk, or logged.
- **Restrictive CORS** on the processing service (`app/api/app.py`).
- **Path validation**: imported source files are resolved and checked to exist as regular files before any read (`app/security/paths.py`); nothing is trusted based on file extension — FFprobe validates actual content.
- **Safe subprocess execution**: FFmpeg/FFprobe/PySceneDetect are invoked with fixed argument arrays, never through a shell, and filter-graph expressions are built only from numeric/validated timeline fields — never from raw user or model text.
- **Secrets**: no cloud API credentials exist yet (no cloud provider integration is implemented). When one is added, it must follow the same pattern as the service token — main-process-only, never in the renderer bundle or version control.

## What's not implemented yet

- Dependency auditing / SCA scanning is manual (`npm audit`, periodically) — not yet wired into CI.
- No formal security review pass has been done (tracked as Phase 12 in the roadmap).
- Packaging (code signing, installer hardening) hasn't been attempted.

## AI editing boundary

AI editing features must analyze footage and propose edits to user-provided media. They must not synthesize or replace frames, alter a person's face or body, change clothing, or invent scene content. Reframing must use pixels from the source image (letterboxing is preferable to generated fill); color, stabilization, audio mixing, and captions are conventional, reviewable edits. Generated timelines remain structured, validated, and editable before rendering.

## Reporting

This is a personal/local project without a public release yet; file an issue in this repository if you find a problem.
