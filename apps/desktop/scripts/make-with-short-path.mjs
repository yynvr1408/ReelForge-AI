import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(scriptDir, '..');
const workspaceDir = path.resolve(desktopDir, '..', '..');
const forgeScript =
  process.argv[2] === 'release' ? 'forge:release' : 'forge:make';

if (process.platform !== 'win32') {
  const result = spawnSync('npm', ['run', forgeScript], {
    cwd: desktopDir,
    stdio: 'inherit',
  });
  process.exitCode = result.status ?? 1;
} else {
  const shortOutDir = path.join(workspaceDir, 'b');
  const shortTemp = path.join(workspaceDir, '.tmp');
  mkdirSync(shortTemp, { recursive: true });
  const result = spawnSync(
    process.env.ComSpec || 'cmd.exe',
    ['/d', '/s', '/c', `npm.cmd run ${forgeScript}`],
    {
      cwd: desktopDir,
      env: {
        ...process.env,
        REELFORGE_BUILD_OUT_DIR: shortOutDir,
        REELFORGE_BUILD_TEMP_DIR: shortTemp,
        TEMP: shortTemp,
        TMP: shortTemp,
      },
      stdio: 'inherit',
    },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
