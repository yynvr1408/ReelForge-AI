# shared-types

Planned home for cross-process/cross-service type definitions once the
processing service grows a second consumer (e.g. a CLI or a second
frontend). For now, the IPC contract between Electron's main process,
preload bridge, and renderer lives directly in
`apps/desktop/src/shared/ipc-contract.ts` to avoid a workspace-tooling
dependency the project doesn't need yet. Promote it here if/when that
changes.
