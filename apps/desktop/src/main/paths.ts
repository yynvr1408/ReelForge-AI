import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Resolves the monorepo root. In dev, Electron Forge runs from
 * apps/desktop, so the repo root is two levels up. Packaged builds
 * never use this — they run entirely out of process.resourcesPath
 * (see forge.config.mts's packagerConfig.extraResource and
 * docs/releases/release-process.md).
 */
function resolveRepoRoot(): string {
  return path.resolve(app.getAppPath(), '..', '..');
}

export function isPackaged(): boolean {
  return app.isPackaged;
}

export function getFfmpegPaths(): { ffmpegPath: string; ffprobePath: string } {
  if (isPackaged()) {
    // Copied in whole by packagerConfig.extraResource, so it keeps its
    // node_modules folder name.
    const resourceDir = path.join(
      process.resourcesPath,
      'ffmpeg-ffprobe-static',
    );
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

/**
 * The command used to launch the processing service.
 *
 * Dev mode: the repo's own venv interpreter running app/main.py.
 * Packaged mode: the self-contained PyInstaller executable built from
 * services/processing/reelforge-processing.spec — no system Python or
 * venv required on the target machine. Built automatically by the
 * `prePackage` hook in forge.config.mts and copied in via
 * extraResource; see docs/releases/release-process.md.
 */
export function getProcessingServiceCommand(): {
  command: string;
  args: string[];
  cwd: string;
} {
  if (isPackaged()) {
    const serviceDir = path.join(process.resourcesPath, 'rf');
    const exePath = path.join(serviceDir, 'reelforge-processing.exe');
    if (!fs.existsSync(exePath)) {
      throw new Error(
        `Bundled processing service not found at ${exePath}. The release build is missing its PyInstaller output — see docs/releases/release-process.md.`,
      );
    }
    return { command: exePath, args: [], cwd: serviceDir };
  }

  const repoRoot = resolveRepoRoot();
  const processingDir = path.join(repoRoot, 'services', 'processing');
  const venvPython = path.join(processingDir, '.venv', 'Scripts', 'python.exe');
  if (!fs.existsSync(venvPython)) {
    throw new Error(
      `Python virtual environment not found at ${venvPython}. Run the setup steps in docs/development/setup.md.`,
    );
  }
  const entrypoint = path.join(processingDir, 'app', 'main.py');
  return { command: venvPython, args: [entrypoint], cwd: processingDir };
}

export function getDataDir(): string {
  return app.getPath('userData');
}
