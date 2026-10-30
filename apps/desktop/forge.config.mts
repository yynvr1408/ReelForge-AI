import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { PublisherGitHub } from '@electron-forge/publisher-github';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const processingDir = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  'services',
  'processing',
);
const processingDistDir = path.join(processingDir, 'dist', 'rf');
const electronZipDir = path.join(
  import.meta.dirname,
  '.cache',
  'electron-zips',
);
const shortBuildTempDir =
  process.env.REELFORGE_BUILD_TEMP_DIR ||
  path.resolve(import.meta.dirname, '..', '..', '.tmp');

/**
 * Builds the processing service into a self-contained executable
 * (no system Python needed on the target machine) before packaging,
 * so `extraResource` below always has something fresh to copy in.
 * See services/processing/reelforge-processing.spec and
 * docs/releases/release-process.md.
 */
function buildProcessingServiceExecutable(): void {
  const pyinstaller = path.join(
    processingDir,
    '.venv',
    'Scripts',
    'pyinstaller.exe',
  );
  if (!existsSync(pyinstaller)) {
    throw new Error(
      `PyInstaller not found at ${pyinstaller}. Run: cd services/processing && ./.venv/Scripts/pip install -e ".[build]"`,
    );
  }
  console.log(
    '[forge] Building processing service executable with PyInstaller...',
  );
  execFileSync(
    pyinstaller,
    ['reelforge-processing.spec', '--noconfirm', '--clean'],
    {
      cwd: processingDir,
      stdio: 'inherit',
    },
  );
  const exePath = path.join(processingDistDir, 'reelforge-processing.exe');
  if (!existsSync(exePath)) {
    throw new Error(`PyInstaller reported success but ${exePath} is missing`);
  }
}

function cacheLocalWindowsElectron(platform: string, arch: string): void {
  if (
    process.platform !== 'win32' ||
    platform !== 'win32' ||
    arch !== process.arch
  ) {
    return;
  }
  const electronDir = path.join(
    import.meta.dirname,
    'node_modules',
    'electron',
  );
  const electronVersion = JSON.parse(
    readFileSync(path.join(electronDir, 'package.json'), 'utf8'),
  ).version as string;
  const zipPath = path.join(
    electronZipDir,
    `electron-v${electronVersion}-${platform}-${arch}.zip`,
  );
  if (existsSync(zipPath)) return;

  const script = path.join(
    import.meta.dirname,
    'scripts',
    'zip-electron-runtime.ps1',
  );
  const runtimeDir = path.join(electronDir, 'dist');
  if (!existsSync(path.join(runtimeDir, 'electron.exe'))) {
    throw new Error(
      `The installed Electron runtime is missing from ${runtimeDir}`,
    );
  }
  mkdirSync(electronZipDir, { recursive: true });
  console.log(
    '[forge] Caching the installed Electron runtime for offline packaging...',
  );
  execFileSync(
    'powershell.exe',
    [
      '-NoLogo',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      script,
      runtimeDir,
      zipPath,
    ],
    { stdio: 'inherit' },
  );
  if (!existsSync(zipPath)) {
    throw new Error(
      `Could not create the local Electron archive at ${zipPath}`,
    );
  }
}

const config: ForgeConfig = {
  // Keep the release root short: Squirrel.Windows extracts packages using
  // legacy MAX_PATH APIs, and this app bundles a deep PyInstaller runtime.
  outDir:
    process.env.REELFORGE_BUILD_OUT_DIR ||
    path.resolve(import.meta.dirname, '..', '..', 'build'),
  packagerConfig: {
    asar: true,
    overwrite: true,
    tmpdir: false,
    ...(process.platform === 'win32' && process.arch === 'x64'
      ? {
          electronZipDir,
        }
      : {}),
    // electron-packager picks the right extension per platform from
    // this base name (icon.ico on win32, icon.icns on darwin, ignored
    // on linux). Generated from assets/icon.png via
    // `node scripts/generate-icon.mjs` — re-run that if the source
    // icon changes.
    icon: 'assets/icon',
    // Copied as-is into resources/<basename>; src/main/paths.ts reads
    // them back out by those same folder names at runtime.
    extraResource: [processingDistDir, 'node_modules/ffmpeg-ffprobe-static'],
  },
  rebuildConfig: {},
  hooks: {
    preMake: async () => {
      if (process.platform === 'win32') {
        mkdirSync(shortBuildTempDir, { recursive: true });
        // Squirrel.Windows still uses MAX_PATH during package extraction.
        // The sandbox's default temp path plus the frozen Python runtime
        // exceeds that legacy limit, so keep Forge maker temp paths short.
        process.env.TEMP = shortBuildTempDir;
        process.env.TMP = shortBuildTempDir;
      }
    },
    prePackage: async (_forgeConfig, platform, arch) => {
      buildProcessingServiceExecutable();
      cacheLocalWindowsElectron(platform, arch);
    },
  },
  makers: [
    // Windows is the primary target platform (see the product spec).
    // MakerZIP/MakerRpm/MakerDeb are left in for other platforms but
    // only run when `make`/`publish` executes on a matching OS —
    // electron-forge skips makers whose default platform doesn't
    // match the current one.
    new MakerSquirrel({ setupIcon: 'assets/icon.ico' }),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  publishers: [
    new PublisherGitHub({
      repository: { owner: 'yynvr1408', name: 'reelforge-ai-releases' },
      authToken:
        process.env.RELEASES_TOKEN ||
        process.env.GH_TOKEN ||
        process.env.GITHUB_TOKEN,
      prerelease: false,
      generateReleaseNotes: true,
    }),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main/index.ts',
          config: 'vite.main.config.mts',
          target: 'main',
        },
        {
          entry: 'src/preload/index.ts',
          config: 'vite.preload.config.mts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
