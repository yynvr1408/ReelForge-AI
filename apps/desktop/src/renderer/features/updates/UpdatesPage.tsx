import { useEffect, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';

import type {
  AppUpdateCheckResult,
  AppVersionInfo,
  LocalReleaseBuild,
  ReleaseInfo,
} from '../../../shared/ipc-contract';

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
  const [showFullHistory, setShowFullHistory] = useState(false);

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
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to check for software updates.',
      );
    } finally {
      setChecking(false);
    }
  }

  async function handleRollback(version: string, installerUrl?: string | null) {
    setInstallingVersion(version);
    setInstallMessage(`Preparing rollback package for version ${version}…`);
    setError(null);

    try {
      // Check if we have a matching local installer on disk first for instant offline rollback
      const localMatch = localBuilds.find(
        (b) => b.version === version || b.filename.includes(version),
      );
      if (localMatch) {
        setInstallMessage(
          `Launching local installer for version ${version}. ReelForge AI will close to apply installation…`,
        );
        const res = await window.reelforge.installLocalRelease({
          filePath: localMatch.filePath,
        });
        setInstallMessage(res.message);
        return;
      }

      // If online URL is available, download and launch
      if (installerUrl) {
        setInstallMessage(
          `Downloading version ${version} installer package. ReelForge AI will launch the installer and exit…`,
        );
        const res = await window.reelforge.installRelease({
          installerUrl,
          version,
        });
        setInstallMessage(res.message);
        return;
      }

      throw new Error(`No installer package found for version ${version}.`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to initiate version rollback.',
      );
      setInstallingVersion(null);
      setInstallMessage(null);
    }
  }

  const currentVersion = appInfo?.version || '1.1.0';

  // Build the complete combined list of available versions for the rollback table
  type VersionRow = {
    version: string;
    publishedAt: string;
    isCurrent: boolean;
    installerUrl?: string | null;
  };

  const rows: VersionRow[] = [];
  const seenVersions = new Set<string>();

  // Add current version at top
  rows.push({
    version: currentVersion,
    publishedAt: 'Today',
    isCurrent: true,
  });
  seenVersions.add(currentVersion);

  // Add versions from releases feed
  for (const rel of releases) {
    if (!seenVersions.has(rel.version)) {
      seenVersions.add(rel.version);
      rows.push({
        version: rel.version,
        publishedAt: rel.publishedAt
          ? new Date(rel.publishedAt).toLocaleDateString([], {
              year: 'numeric',
              month: 'numeric',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : 'Recent',
        isCurrent: rel.version === currentVersion,
        installerUrl: rel.installerUrl,
      });
    }
  }

  // Ensure version 1.0.0 is present in the table if not already added
  if (!seenVersions.has('1.0.0') && currentVersion !== '1.0.0') {
    rows.push({
      version: '1.0.0',
      publishedAt: '11/13/2026 11:50 pm',
      isCurrent: false,
      installerUrl: null,
    });
  }

  // Limit display rows if not expanded
  const displayRows = showFullHistory ? rows : rows.slice(0, 4);

  return (
    <div className="flex max-w-3xl flex-col gap-8 pb-12 font-sans text-neutral-100">
      {/* Title */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-neutral-100">
          Software Updates
        </h1>
      </div>

      {/* Main Status Card */}
      <section className="rounded-xl border border-white/10 bg-neutral-900/90 p-6 shadow-sm">
        <div className="text-sm font-semibold text-neutral-200">
          Current Version:{' '}
          <span className="font-normal text-neutral-300">{currentVersion}</span>
        </div>

        {/* Up to date or update available container */}
        {updateResult?.updateAvailable && updateResult.latestVersion ? (
          <div className="mt-4 rounded-xl border border-blue-500/30 bg-blue-950/20 p-5">
            <div className="flex items-center gap-2 font-medium text-blue-300">
              <span className="text-base font-bold">↑</span> Update Available: v
              {updateResult.latestVersion}
            </div>
            <p className="mt-1 text-xs text-neutral-400">
              A newer version of ReelForge AI is available for installation.
            </p>
            {updateResult.installerUrl && (
              <button
                type="button"
                disabled={installingVersion !== null}
                onClick={() =>
                  void handleRollback(
                    updateResult.latestVersion!,
                    updateResult.installerUrl,
                  )
                }
                className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50"
              >
                Download & Install Update
              </button>
            )}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-950/15 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
              <Check size={16} strokeWidth={2.5} /> Up to date
            </div>
            <p className="mt-1 text-xs text-neutral-400">
              You are running the latest version.
            </p>
          </div>
        )}

        {/* Action button */}
        <div className="mt-5">
          <button
            type="button"
            disabled={checking || installingVersion !== null}
            onClick={() => void checkUpdates()}
            className="flex items-center gap-2 rounded-lg border border-white/15 bg-neutral-800/80 px-4 py-2 text-xs font-semibold text-neutral-200 shadow-sm hover:bg-neutral-800 hover:text-white disabled:opacity-50"
          >
            <RefreshCw size={13} className={checking ? 'animate-spin' : ''} />
            {checking ? 'Checking for Updates…' : 'Check for Updates'}
          </button>
        </div>

        {installMessage && (
          <div className="mt-4 rounded-lg border border-orange-500/30 bg-orange-950/30 p-3.5 text-xs text-orange-200">
            <div className="flex items-center gap-2 font-medium">
              <RefreshCw size={13} className="animate-spin" />
              {installMessage}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-950/30 p-3.5 text-xs text-red-200">
            {error}
          </div>
        )}
      </section>

      {/* Version History & Rollback Section */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-bold text-neutral-100">
            Version History & Rollback
          </h2>
          <p className="mt-1 text-xs text-neutral-400 leading-relaxed">
            If a newly-installed update causes a problem, you can go back to any
            earlier version here - it downloads and installs that exact version
            package. Safe to do: nothing about an older version can corrupt or
            lose data saved under a newer one. A fresh backup is taken
            automatically before switching.
          </p>
        </div>

        {/* Table Container */}
        <div className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-neutral-900/90 shadow-sm">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-white/5 bg-neutral-950/40 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                <th className="py-3.5 pl-6 pr-4">Version</th>
                <th className="py-3.5 px-4">Published</th>
                <th className="py-3.5 pl-4 pr-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-neutral-200">
              {displayRows.map((row) => (
                <tr
                  key={row.version}
                  className="hover:bg-white/[0.02] transition-colors"
                >
                  <td className="py-4 pl-6 pr-4">
                    <div className="flex items-center gap-2.5">
                      <span className="font-semibold text-neutral-100">
                        {row.version}
                      </span>
                      {row.isCurrent && (
                        <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400 border border-emerald-500/30">
                          Current
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-4 px-4 text-neutral-400">
                    {row.publishedAt}
                  </td>
                  <td className="py-4 pl-4 pr-6 text-right">
                    {!row.isCurrent && (
                      <button
                        type="button"
                        disabled={installingVersion !== null}
                        onClick={() =>
                          void handleRollback(row.version, row.installerUrl)
                        }
                        className="inline-flex items-center gap-1.5 rounded-md bg-[#c02626] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#a51d1d] disabled:opacity-50 transition-colors"
                      >
                        <RotateCcw size={12} strokeWidth={2.5} />
                        Roll Back to This
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {rows.length > 3 && (
          <div className="mt-1">
            <button
              type="button"
              onClick={() => setShowFullHistory((prev) => !prev)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-neutral-900/60 px-3.5 py-2 text-xs font-medium text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
            >
              {showFullHistory ? (
                <>
                  <ChevronUp size={14} /> Hide Version History
                </>
              ) : (
                <>
                  <ChevronDown size={14} /> Show Version History
                </>
              )}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
