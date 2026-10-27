import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Resolves the monorepo root. In dev, Electron Forge runs from
 * apps/desktop, so the repo root is two levels up. In a packaged app,
 * the Python service and ffmpeg binaries are bundled as extraResources
 * under process.resourcesPath instead (see forge.config.mts packaging
 * step, tracked in docs/development/known-limitations.md until
 * Phase 13 packaging work lands).
 */
function resolveRepoRoot(): string {
  return path.resolve(app.getAppPath(), '..', '..');
}

export function isPackaged(): boolean {
  return app.isPackaged;
}

export function getFfmpegPaths(): { ffmpegPath: string; ffprobePath: string } {
  if (isPackaged()) {
    const resourceDir = path.join(process.resourcesPath, 'ffmpeg');
    return {
      ffmpegPath: path.join(resourceDir, 'ffmpeg.exe'),
      ffprobePath: path.join(resourceDir, 'ffprobe.exe'),
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const bin = require('ffmpeg-ffprobe-static') as {
    ffmpegPath: string;
    ffprobePath: string;
  };
  return { ffmpegPath: bin.ffmpegPath, ffprobePath: bin.ffprobePath };
}

export function getPythonExecutablePath(): string {
  if (isPackaged()) {
    return path.join(
      process.resourcesPath,
      'processing',
      'python',
      'python.exe',
    );
  }
  const repoRoot = resolveRepoRoot();
  const venvPython = path.join(
    repoRoot,
    'services',
    'processing',
    '.venv',
    'Scripts',
    'python.exe',
  );
  if (!fs.existsSync(venvPython)) {
    throw new Error(
      `Python virtual environment not found at ${venvPython}. Run the setup steps in docs/development/setup.md.`,
    );
  }
  return venvPython;
}

export function getProcessingServiceEntrypoint(): string {
  if (isPackaged()) {
    return path.join(process.resourcesPath, 'processing', 'app', 'main.py');
  }
  const repoRoot = resolveRepoRoot();
  return path.join(repoRoot, 'services', 'processing', 'app', 'main.py');
}

export function getProcessingServiceCwd(): string {
  if (isPackaged()) {
    return path.join(process.resourcesPath, 'processing');
  }
  const repoRoot = resolveRepoRoot();
  return path.join(repoRoot, 'services', 'processing');
}

export function getDataDir(): string {
  return app.getPath('userData');
}
