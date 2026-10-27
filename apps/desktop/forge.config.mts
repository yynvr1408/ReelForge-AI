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
import { existsSync } from 'node:fs';
import path from 'node:path';

const processingDir = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  'services',
  'processing',
);
const processingDistDir = path.join(
  processingDir,
  'dist',
  'reelforge-processing',
);

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

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
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
    prePackage: async () => {
      buildProcessingServiceExecutable();
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
      repository: { owner: 'yynvr1408', name: 'ReelForge-AI' },
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
