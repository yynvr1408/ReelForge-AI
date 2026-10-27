import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import net from 'node:net';
import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';

import {
  getDataDir,
  getFfmpegPaths,
  getProcessingServiceCommand,
} from './paths';

export class ProcessingServiceError extends Error {}

export interface ProcessingServiceHandle {
  baseUrl: string;
  token: string;
  stop: () => Promise<void>;
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const port = address.port;
        server.close(() => resolve(port));
      } else {
        server.close();
        reject(new ProcessingServiceError('Failed to allocate a free port'));
      }
    });
  });
}

const READY_LINE_PREFIX = 'REELFORGE_SERVICE_READY';
const STARTUP_TIMEOUT_MS = 20_000;

/**
 * Spawns the Python processing service as a child process, wires up
 * structured log forwarding, and waits for its readiness line before
 * resolving. The service is given a fresh random bearer token per
 * launch; it is never written to disk.
 */
export async function startProcessingService(options: {
  onLog: (line: string) => void;
  onExit: (code: number | null) => void;
}): Promise<ProcessingServiceHandle> {
  const dataDir = getDataDir();
  fs.mkdirSync(dataDir, { recursive: true });

  const { ffmpegPath, ffprobePath } = getFfmpegPaths();
  if (!fs.existsSync(ffmpegPath) || !fs.existsSync(ffprobePath)) {
    throw new ProcessingServiceError(
      `Bundled ffmpeg/ffprobe binaries not found (expected ${ffmpegPath} and ${ffprobePath})`,
    );
  }

  const { command, args, cwd } = getProcessingServiceCommand();

  const port = await findFreePort();
  const token = randomBytes(32).toString('hex');

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    REELFORGE_DATA_DIR: dataDir,
    REELFORGE_FFMPEG_PATH: ffmpegPath,
    REELFORGE_FFPROBE_PATH: ffprobePath,
    REELFORGE_SERVICE_TOKEN: token,
    REELFORGE_SERVICE_HOST: '127.0.0.1',
    REELFORGE_SERVICE_PORT: String(port),
    PYTHONUNBUFFERED: '1',
  };

  const child: ChildProcess = spawn(command, args, {
    cwd,
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let settled = false;
  let killed = false;

  const result = await new Promise<ProcessingServiceHandle>(
    (resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          child.kill();
          reject(
            new ProcessingServiceError(
              'Processing service did not become ready in time',
            ),
          );
        }
      }, STARTUP_TIMEOUT_MS);

      const stdoutReader = readline.createInterface({ input: child.stdout! });
      stdoutReader.on('line', (line) => {
        options.onLog(line);
        if (!settled && line.startsWith(READY_LINE_PREFIX)) {
          settled = true;
          clearTimeout(timeout);
          resolve({
            baseUrl: `http://127.0.0.1:${port}`,
            token,
            stop: () => stopProcess(child),
          });
        }
      });

      const stderrReader = readline.createInterface({ input: child.stderr! });
      stderrReader.on('line', (line) => options.onLog(line));

      child.on('exit', (code) => {
        options.onExit(code);
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(
            new ProcessingServiceError(
              `Processing service exited early with code ${code}`,
            ),
          );
        }
      });

      child.on('error', (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(err);
        }
      });
    },
  );

  return result;

  async function stopProcess(proc: ChildProcess): Promise<void> {
    if (killed) return;
    killed = true;
    await new Promise<void>((resolveStop) => {
      if (proc.exitCode !== null || proc.killed) {
        resolveStop();
        return;
      }
      proc.once('exit', () => resolveStop());
      proc.kill();
      // Force-kill if it refuses to exit gracefully (Windows has no SIGTERM
      // handling in the uvicorn default signal handlers reliably, so we
      // escalate after a short grace period).
      setTimeout(() => {
        if (proc.exitCode === null && !proc.killed) {
          try {
            process.kill(proc.pid!, 'SIGKILL');
          } catch {
            // process already gone
          }
        }
        resolveStop();
      }, 3000);
    });
  }
}

export function resolvePythonLogDir(): string {
  return path.join(getDataDir(), 'logs');
}
