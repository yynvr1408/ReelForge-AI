import { useEffect, useState } from 'react';
import {
  ArrowDownToLine,
  CheckCircle2,
  ExternalLink,
  GitBranch,
  Package,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

import type {
  AppUpdateCheckResult,
  AppVersionInfo,
} from '../../../shared/ipc-contract';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export function UpdatesPage() {
  const [appInfo, setAppInfo] = useState<AppVersionInfo | null>(null);
  const [updateResult, setUpdateResult] = useState<AppUpdateCheckResult | null>(
    null,
  );
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  useEffect(() => {
    void window.reelforge.getAppVersion().then(setAppInfo);
    void checkUpdates();
  }, []);

  async function checkUpdates() {
    setChecking(true);
    try {
      const result = await window.reelforge.checkForUpdates();
      setUpdateResult(result);
      setLastChecked(new Date());
    } finally {
      setChecking(false);
    }
  }

  const currentVersion = appInfo?.version || '0.2.0';

  return (
    <div className="flex max-w-3xl flex-col gap-6">
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
              <p className="mt-0.5 text-xs text-neutral-500">
                Official releases are published automatically via GitHub
                Actions.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={checking}
            onClick={() => void checkUpdates()}
            className="flex items-center gap-2 rounded-md bg-orange-500 px-4 py-2 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50"
          >
            <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
            {checking ? 'Checking GitHub…' : 'Check for updates'}
          </button>
        </div>

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
                      New Version Available: v{updateResult.latestVersion}
                    </h3>
                  </div>
                  {updateResult.releaseName && (
                    <p className="mt-1 text-sm font-medium text-neutral-200">
                      {updateResult.releaseName}
                    </p>
                  )}
                  {updateResult.publishedAt && (
                    <p className="mt-0.5 text-xs text-neutral-400">
                      Released on{' '}
                      {new Date(updateResult.publishedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {updateResult.installerUrl && (
                    <button
                      type="button"
                      onClick={() =>
                        window.reelforge.openPathInShell(
                          updateResult.installerUrl!,
                        )
                      }
                      className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-emerald-500"
                    >
                      <ArrowDownToLine size={14} /> Download Installer (.exe)
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
                      <GitBranch size={13} /> View on GitHub
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
                          Download <ExternalLink size={12} />
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
                <p className="mt-0.5 text-xs text-neutral-500">
                  You are running version v{currentVersion}. There are no newer
                  updates published.
                </p>
                {updateResult.error && (
                  <p className="mt-2 text-xs text-neutral-400">
                    {updateResult.error}
                  </p>
                )}
              </div>
            </section>
          )}
        </>
      )}

      {/* Release & CI/CD Pipeline Information */}
      <section className="rounded-lg border border-white/10 bg-neutral-950 p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Automated Release Management & CI/CD
        </h3>
        <p className="mt-2 text-xs text-neutral-400">
          ReelForge AI uses automated GitHub Actions for Continuous Integration
          and Delivery. When a release tag is pushed (or triggered via workflow
          dispatch), the build runner freezes the Python processing service with
          PyInstaller, bundles FFmpeg/FFprobe, packages the Electron app with
          Squirrel.Windows, and attaches the installable{' '}
          <code className="text-orange-300">ReelForge AI Setup.exe</code>{' '}
          directly to GitHub Releases.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() =>
              window.reelforge.openPathInShell(
                'https://github.com/yynvr1408/ReelForge-AI/releases',
              )
            }
            className="flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/5"
          >
            <GitBranch size={13} /> View Releases on GitHub
          </button>
          <button
            type="button"
            onClick={() =>
              window.reelforge.openPathInShell(
                'https://github.com/yynvr1408/ReelForge-AI/actions',
              )
            }
            className="flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/5"
          >
            <ExternalLink size={13} /> View CI/CD Actions
          </button>
        </div>
      </section>
    </div>
  );
}
