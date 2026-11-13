import { useEffect, useState } from 'react';
import {
  ArrowDownToLine,
  CheckCircle2,
  ExternalLink,
  FolderOpen,
  HardDrive,
  History,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

import type {
  AppUpdateCheckResult,
  AppVersionInfo,
  LocalReleaseBuild,
  ReleaseInfo,
} from '../../../shared/ipc-contract';

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export function UpdatesPage() {
  const [appInfo, setAppInfo] = useState<AppVersionInfo | null>(null);
  const [updateResult, setUpdateResult] = useState<AppUpdateCheckResult | null>(
    null,
  );
  const [releases, setReleases] = useState<ReleaseInfo[]>([]);
  const [localBuilds, setLocalBuilds] = useState<LocalReleaseBuild[]>([]);
  const [checking, setChecking] = useState(false);
  const [installingVersion, setInstallingVersion] = useState<string | null>(
    null,
  );
  const [installMessage, setInstallMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  useEffect(() => {
    void window.reelforge.getAppVersion().then(setAppInfo);
    void checkUpdates();
  }, []);

  async function checkUpdates() {
    setChecking(true);
    setError(null);
    try {
      const [result, allReleases, locals] = await Promise.all([
        window.reelforge.checkForUpdates(),
        window.reelforge.listReleases(),
        window.reelforge.listLocalReleases(),
      ]);
      setUpdateResult(result);
      setReleases(allReleases);
      setLocalBuilds(locals);
      setLastChecked(new Date());
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to check updates from releases repository',
      );
    } finally {
      setChecking(false);
    }
  }

  async function handleDownloadAndInstall(
    installerUrl: string,
    version: string,
  ) {
    setInstallingVersion(version);
    setInstallMessage(`Downloading installer for v${version}…`);
    setError(null);
    try {
      setInstallMessage(
        `Preparing installer for v${version}. ReelForge AI will launch the installer and exit…`,
      );
      const res = await window.reelforge.installRelease({
        installerUrl,
        version,
      });
      setInstallMessage(res.message);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to download or launch update installer',
      );
      setInstallingVersion(null);
      setInstallMessage(null);
    }
  }

  async function handleLaunchLocal(build: LocalReleaseBuild) {
    setInstallingVersion(build.version);
    setInstallMessage(`Launching local installer: ${build.filename}…`);
    setError(null);
    try {
      const res = await window.reelforge.installLocalRelease({
        filePath: build.filePath,
      });
      setInstallMessage(res.message);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to launch local release executable',
      );
      setInstallingVersion(null);
      setInstallMessage(null);
    }
  }

  const currentVersion = appInfo?.version || '1.0.0';

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      {/* Current Version & Check for Updates Card */}
      <section className="rounded-lg border border-white/10 bg-neutral-950 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-500/10 text-orange-400">
              <Sparkles size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-neutral-100">
                  ReelForge AI
                </h2>
                <span className="rounded-full bg-orange-500/15 px-2.5 py-0.5 text-xs font-semibold text-orange-300 border border-orange-500/30">
                  v{currentVersion}
                </span>
                <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[11px] font-medium text-neutral-400">
                  {appInfo?.isPackaged ? 'Packaged Build' : 'Development Build'}
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-400">
                AI-assisted desktop video editor with reference style learning
                and non-generative original-pixel editing.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={checking || installingVersion !== null}
            onClick={() => void checkUpdates()}
            className="flex items-center gap-2 rounded-md bg-orange-500 px-4 py-2 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50 transition-colors shadow-sm"
          >
            <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
            {checking ? 'Checking for updates…' : 'Check for updates'}
          </button>
        </div>

        {installMessage && (
          <div className="mt-4 rounded-md border border-orange-500/30 bg-orange-500/10 p-3 text-xs text-orange-200">
            <div className="flex items-center gap-2 font-medium">
              <RefreshCw size={14} className="animate-spin" />
              {installMessage}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
            {error}
          </div>
        )}

        {lastChecked && (
          <p className="mt-4 border-t border-white/5 pt-3 text-[11px] text-neutral-500">
            Last checked:{' '}
            {lastChecked.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </p>
        )}
      </section>

      {/* Update Results Banner */}
      {updateResult && (
        <>
          {updateResult.updateAvailable && updateResult.latestVersion ? (
            /* Update available banner */
            <section className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-400" />
                    <h3 className="text-sm font-semibold text-emerald-300">
                      New Release Available: v{updateResult.latestVersion}
                    </h3>
                    <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300 uppercase tracking-wider">
                      Latest
                    </span>
                  </div>
                  {updateResult.releaseName && (
                    <p className="mt-1 text-sm font-medium text-neutral-200">
                      {updateResult.releaseName}
                    </p>
                  )}
                  {updateResult.publishedAt && (
                    <p className="mt-0.5 text-xs text-neutral-400">
                      Published on{' '}
                      {new Date(updateResult.publishedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {updateResult.installerUrl && (
                    <button
                      type="button"
                      disabled={installingVersion !== null}
                      onClick={() =>
                        void handleDownloadAndInstall(
                          updateResult.installerUrl!,
                          updateResult.latestVersion!,
                        )
                      }
                      className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
                    >
                      <ArrowDownToLine size={14} /> Download & Install Now
                    </button>
                  )}
                  {updateResult.htmlUrl && (
                    <button
                      type="button"
                      onClick={() =>
                        window.reelforge.openPathInShell(updateResult.htmlUrl!)
                      }
                      className="flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-2 text-xs text-neutral-300 hover:bg-white/5 transition-colors"
                    >
                      <ExternalLink size={13} /> View on GitHub
                    </button>
                  )}
                </div>
              </div>

              {/* Release Notes */}
              {updateResult.releaseNotes && (
                <div className="mt-5 border-t border-emerald-500/20 pt-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                    What's New in v{updateResult.latestVersion}
                  </h4>
                  <div className="mt-2 max-h-60 overflow-y-auto rounded-md bg-neutral-900/80 p-4 font-mono text-xs text-neutral-300 whitespace-pre-wrap leading-relaxed">
                    {updateResult.releaseNotes}
                  </div>
                </div>
              )}
            </section>
          ) : (
            /* Up-to-date card */
            <section className="flex items-center gap-4 rounded-lg border border-white/10 bg-neutral-950 p-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <h3 className="text-sm font-medium text-neutral-200">
                  ReelForge AI is up to date
                </h3>
                <p className="mt-0.5 text-xs text-neutral-400">
                  You are currently running version v{currentVersion}. You have
                  the latest features, models, and performance optimizations.
                </p>
              </div>
            </section>
          )}
        </>
      )}

      {/* Local Builds & Offline Rollback Section */}
      <section className="rounded-lg border border-white/10 bg-neutral-950 p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <HardDrive size={16} className="text-orange-400" />
            <div>
              <h3 className="text-sm font-semibold text-neutral-200">
                Local Builds & Offline Rollback
              </h3>
              <p className="text-[11px] text-neutral-400">
                Installer executables (.exe) saved locally on this machine for
                instant re-install or rollback without downloading.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => window.reelforge.openFolderInShell('releases')}
            className="flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/5 transition-colors"
          >
            <FolderOpen size={13} /> Open Releases Folder
          </button>
        </div>

        {localBuilds.length === 0 ? (
          <p className="text-xs text-neutral-500">
            No local installer packages found in the repository releases
            directory. Built packages will appear here automatically.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {localBuilds.map((build) => (
              <div
                key={build.filePath}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-white/5 bg-neutral-900/60 p-3 text-xs"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded px-2.5 py-0.5 font-mono text-[11px] font-semibold ${
                      build.isCurrent
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        : 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
                    }`}
                  >
                    v{build.version}
                  </span>
                  <div>
                    <div className="font-medium text-neutral-200">
                      {build.filename}
                    </div>
                    <div className="text-[11px] text-neutral-500">
                      Size: {formatBytes(build.sizeBytes)} · Modified:{' '}
                      {new Date(build.modifiedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={installingVersion !== null}
                    onClick={() => void handleLaunchLocal(build)}
                    className="flex items-center gap-1.5 rounded border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-orange-300 hover:bg-orange-500/20 disabled:opacity-50 transition-colors"
                  >
                    {build.isCurrent ? (
                      <>
                        <Play size={12} /> Re-install Build
                      </>
                    ) : (
                      <>
                        <RotateCcw size={12} /> Rollback to v{build.version}
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      window.reelforge.revealInShell(build.filePath)
                    }
                    className="flex items-center gap-1 rounded border border-white/10 px-2.5 py-1.5 text-neutral-400 hover:bg-white/5 hover:text-neutral-200 transition-colors"
                  >
                    <FolderOpen size={12} /> Show File
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Published Releases & Online Rollback Section */}
      <section className="rounded-lg border border-white/10 bg-neutral-950 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History size={16} className="text-orange-400" />
            <div>
              <h3 className="text-sm font-semibold text-neutral-200">
                Release History & Changelog
              </h3>
              <p className="text-[11px] text-neutral-400">
                Official tagged releases with version notes and 1-click rollback
                installers.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              window.reelforge.openPathInShell(
                'https://github.com/yynvr1408/reelforge-ai-releases/releases',
              )
            }
            className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-200"
          >
            <ExternalLink size={13} /> View on GitHub
          </button>
        </div>

        {releases.length === 0 ? (
          <p className="text-xs text-neutral-500">
            No published releases found yet.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {releases.map((rel) => (
              <div
                key={rel.version}
                className="rounded-md border border-white/5 bg-neutral-900/60 p-4 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/5">
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded px-2.5 py-0.5 font-mono text-[11px] font-semibold ${
                        rel.isCurrent
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : rel.isNewer
                            ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
                            : 'bg-neutral-800 text-neutral-300 border border-white/10'
                      }`}
                    >
                      v{rel.version}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-neutral-100 text-sm">
                          {rel.name || `Version ${rel.version}`}
                        </span>
                        {rel.isCurrent && (
                          <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                            Current
                          </span>
                        )}
                      </div>
                      {rel.publishedAt && (
                        <div className="text-[11px] text-neutral-500 mt-0.5">
                          Released on{' '}
                          {new Date(rel.publishedAt).toLocaleDateString()}
                          {rel.installerSize
                            ? ` · ${formatBytes(rel.installerSize)}`
                            : ''}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {rel.installerUrl && !rel.isCurrent && (
                      <button
                        type="button"
                        disabled={installingVersion !== null}
                        onClick={() =>
                          void handleDownloadAndInstall(
                            rel.installerUrl!,
                            rel.version,
                          )
                        }
                        className={`flex items-center gap-1.5 rounded px-3 py-1.5 font-medium transition-colors disabled:opacity-50 ${
                          rel.isNewer
                            ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                            : 'border border-orange-500/30 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20'
                        }`}
                      >
                        {rel.isNewer ? (
                          <>
                            <ArrowDownToLine size={13} /> Update to v
                            {rel.version}
                          </>
                        ) : (
                          <>
                            <RotateCcw size={13} /> Rollback to v{rel.version}
                          </>
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        window.reelforge.openPathInShell(rel.htmlUrl)
                      }
                      className="flex items-center gap-1 rounded border border-white/10 px-2.5 py-1.5 text-neutral-400 hover:bg-white/5 hover:text-neutral-200 transition-colors"
                    >
                      Notes <ExternalLink size={12} />
                    </button>
                  </div>
                </div>

                {/* Formatted Release Highlights / Notes */}
                {rel.releaseNotes && (
                  <div className="mt-3 text-neutral-300 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap font-sans text-xs bg-black/20 p-3 rounded">
                    {rel.releaseNotes}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
