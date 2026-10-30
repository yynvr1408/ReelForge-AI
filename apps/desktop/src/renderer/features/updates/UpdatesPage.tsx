import { useEffect, useState } from 'react';
import {
  ArrowDownToLine,
  CheckCircle2,
  ExternalLink,
  GitBranch,
  History,
  Package,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

import type {
  AppUpdateCheckResult,
  AppVersionInfo,
  ReleaseInfo,
} from '../../../shared/ipc-contract';

const RELEASES_REPO_URL =
  'https://github.com/yynvr1408/reelforge-ai-releases/releases';
const ACTIONS_URL = 'https://github.com/yynvr1408/ReelForge-AI/actions';

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
      const [result, allReleases] = await Promise.all([
        window.reelforge.checkForUpdates(),
        window.reelforge.listReleases(),
      ]);
      setUpdateResult(result);
      setReleases(allReleases);
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
    setInstallMessage('Downloading installer file from releases repo…');
    setError(null);
    try {
      setInstallMessage(
        'Downloading and preparing Windows installer. ReelForge AI will launch the installer and exit…',
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

  const currentVersion = appInfo?.version || '0.2.2';

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      {/* Header card with current version & check button */}
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
                <span className="rounded-full bg-orange-500/15 px-2.5 py-0.5 text-xs font-medium text-orange-300">
                  v{currentVersion}
                </span>
                {appInfo && (
                  <span className="text-[11px] text-neutral-500">
                    (
                    {appInfo.isPackaged
                      ? 'Packaged Build'
                      : 'Development Build'}
                    )
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-neutral-400">
                Connected to public releases repository:{' '}
                <button
                  type="button"
                  onClick={() =>
                    window.reelforge.openPathInShell(RELEASES_REPO_URL)
                  }
                  className="font-mono text-orange-400 underline hover:text-orange-300"
                >
                  yynvr1408/reelforge-ai-releases
                </button>
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={checking || installingVersion !== null}
            onClick={() => void checkUpdates()}
            className="flex items-center gap-2 rounded-md bg-orange-500 px-4 py-2 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50"
          >
            <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
            {checking ? 'Checking Releases…' : 'Check for updates'}
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

      {/* Update Results Section */}
      {updateResult && (
        <>
          {updateResult.updateAvailable && updateResult.latestVersion ? (
            /* Update available banner & download card */
            <section className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-400" />
                    <h3 className="text-sm font-semibold text-emerald-300">
                      New Release Available: v{updateResult.latestVersion}
                    </h3>
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
                      className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
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
                      className="flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-2 text-xs text-neutral-300 hover:bg-white/5"
                    >
                      <GitBranch size={13} /> View Release on GitHub
                    </button>
                  )}
                </div>
              </div>

              {/* Release Notes */}
              {updateResult.releaseNotes && (
                <div className="mt-5 border-t border-emerald-500/20 pt-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                    Release Notes & Changelog
                  </h4>
                  <div className="mt-2 max-h-60 overflow-y-auto rounded-md bg-neutral-900/80 p-4 font-mono text-xs text-neutral-300 whitespace-pre-wrap">
                    {updateResult.releaseNotes}
                  </div>
                </div>
              )}

              {/* Release Assets List */}
              {updateResult.assets.length > 0 && (
                <div className="mt-5 border-t border-emerald-500/20 pt-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                    Release Assets
                  </h4>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {updateResult.assets.map((asset) => (
                      <li
                        key={asset.name}
                        className="flex items-center justify-between rounded bg-neutral-900/60 px-3 py-2 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <Package size={13} className="text-neutral-400" />
                          <span className="font-medium text-neutral-200">
                            {asset.name}
                          </span>
                          <span className="text-neutral-500">
                            ({formatBytes(asset.sizeBytes)})
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            window.reelforge.openPathInShell(
                              asset.browserDownloadUrl,
                            )
                          }
                          className="flex items-center gap-1 text-orange-400 hover:text-orange-300"
                        >
                          Direct Download <ExternalLink size={12} />
                        </button>
                      </li>
                    ))}
                  </ul>
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
                  You are running version v{currentVersion}. No newer version is
                  published on the releases repository.
                </p>
                {updateResult.error && (
                  <p className="mt-2 text-xs text-amber-300">
                    {updateResult.error}
                  </p>
                )}
              </div>
            </section>
          )}
        </>
      )}

      {/* Version History & Available Releases */}
      <section className="rounded-lg border border-white/10 bg-neutral-950 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History size={16} className="text-orange-400" />
            <h3 className="text-sm font-semibold text-neutral-200">
              Published Release History
            </h3>
          </div>
          <button
            type="button"
            onClick={() => window.reelforge.openPathInShell(RELEASES_REPO_URL)}
            className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-200"
          >
            <GitBranch size={13} /> Open Releases Repo
          </button>
        </div>

        {releases.length === 0 ? (
          <p className="text-xs text-neutral-500">
            No published releases found yet in{' '}
            <code className="text-orange-300">
              yynvr1408/reelforge-ai-releases
            </code>
            . Once the release pipeline publishes artifacts, they will appear
            here.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {releases.map((rel) => (
              <div
                key={rel.version}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-white/5 bg-neutral-900/60 p-3 text-xs"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded px-2 py-0.5 font-mono text-[11px] font-medium ${
                      rel.isCurrent
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        : rel.isNewer
                          ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
                          : 'bg-neutral-800 text-neutral-400'
                    }`}
                  >
                    v{rel.version}
                  </span>
                  <div>
                    <div className="font-medium text-neutral-200">
                      {rel.name}
                    </div>
                    {rel.publishedAt && (
                      <div className="text-[11px] text-neutral-500">
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
                      className="flex items-center gap-1 rounded border border-white/10 px-2.5 py-1 text-neutral-300 hover:bg-white/5 disabled:opacity-50"
                    >
                      {rel.isNewer ? (
                        <>
                          <ArrowDownToLine size={12} /> Install
                        </>
                      ) : (
                        <>
                          <RotateCcw size={12} /> Rollback
                        </>
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      window.reelforge.openPathInShell(rel.htmlUrl)
                    }
                    className="flex items-center gap-1 text-neutral-400 hover:text-neutral-200"
                  >
                    View <ExternalLink size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Architecture & CI/CD Pipeline Info Card */}
      <section className="rounded-lg border border-white/10 bg-neutral-950 p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Separate Release Management Architecture
        </h3>
        <p className="mt-2 text-xs text-neutral-400 leading-relaxed">
          ReelForge AI maintains a decoupled two-repository architecture
          matching the Vasavi Grand Hotel Management deployment model:
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 text-xs">
          <div className="rounded border border-white/5 bg-neutral-900/50 p-3">
            <div className="font-medium text-neutral-200">
              Source Repository
            </div>
            <div className="mt-1 font-mono text-neutral-400">
              yynvr1408/ReelForge-AI
            </div>
            <p className="mt-1 text-[11px] text-neutral-500">
              Contains active development, Electron frontend, Python processing
              engine, and GitHub Actions CI workflows.
            </p>
          </div>

          <div className="rounded border border-white/5 bg-neutral-900/50 p-3">
            <div className="font-medium text-orange-300">
              Public Releases Repository
            </div>
            <div className="mt-1 font-mono text-neutral-400">
              yynvr1408/reelforge-ai-releases
            </div>
            <p className="mt-1 text-[11px] text-neutral-500">
              Holds public installer packages (
              <code className="text-orange-300">.exe</code>), release notes, and
              Squirrel update manifests for end users.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => window.reelforge.openPathInShell(RELEASES_REPO_URL)}
            className="flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/5"
          >
            <GitBranch size={13} /> View Releases Repository
          </button>
          <button
            type="button"
            onClick={() => window.reelforge.openPathInShell(ACTIONS_URL)}
            className="flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/5"
          >
            <ExternalLink size={13} /> View Build CI/CD Actions
          </button>
        </div>
      </section>
    </div>
  );
}
