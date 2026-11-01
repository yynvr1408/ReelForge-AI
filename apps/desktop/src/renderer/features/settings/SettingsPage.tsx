import { useEffect, useState } from 'react';
import {
  Check,
  FolderOpen,
  HardDrive,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react';

import type {
  ClearCacheResult,
  EditingFeedback,
  StorageInfo,
} from '../../../shared/ipc-contract';
import { useServiceStatus } from '../../hooks/useServiceStatus';

function formatBytes(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 ** 2;
  return `${mb.toFixed(0)} MB`;
}

export function SettingsPage() {
  const status = useServiceStatus();
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [feedback, setFeedback] = useState<EditingFeedback[]>([]);
  const [cacheResult, setCacheResult] = useState<ClearCacheResult | null>(null);
  const [clearingCache, setClearingCache] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);

  useEffect(() => {
    if (status.state === 'ready') {
      void Promise.all([
        window.reelforge.getStorageInfo().then(setInfo),
        window.reelforge.listEditingFeedback().then(setFeedback),
      ]);
    }
  }, [status.state]);

  async function handleSelectLocation(key: string) {
    try {
      const updated = await window.reelforge.selectStorageLocation(key);
      setInfo(updated);
      setLocationMessage(`Updated storage directory for ${key}`);
      setTimeout(() => setLocationMessage(null), 4000);
    } catch (err) {
      setLocationMessage(
        err instanceof Error ? err.message : 'Failed to change directory',
      );
    }
  }

  async function handleResetLocation(key: string) {
    try {
      const updated = await window.reelforge.resetStorageLocation(key);
      setInfo(updated);
      setLocationMessage(`Reset ${key} to default location`);
      setTimeout(() => setLocationMessage(null), 4000);
    } catch (err) {
      setLocationMessage(
        err instanceof Error ? err.message : 'Failed to reset directory',
      );
    }
  }

  async function handleClearCache() {
    setClearingCache(true);
    try {
      const res = await window.reelforge.clearCache();
      setCacheResult(res);
      const updatedInfo = await window.reelforge.getStorageInfo();
      setInfo(updatedInfo);
    } finally {
      setClearingCache(false);
    }
  }

  if (status.state !== 'ready') {
    return (
      <p className="text-sm text-neutral-500">
        Waiting for the local processing service to start…
      </p>
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <section className="rounded-lg border border-white/10 bg-neutral-950 p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-neutral-200">
            <HardDrive size={16} /> Storage locations
          </div>
          {info && (
            <span className="text-xs text-neutral-500">
              {formatBytes(info.free_bytes)} free of{' '}
              {formatBytes(info.total_bytes)}
            </span>
          )}
        </div>
        {locationMessage && (
          <p className="mb-3 text-xs text-sky-400 bg-sky-950/50 border border-sky-800/50 rounded px-2.5 py-1.5">
            {locationMessage}
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {info?.locations.map((loc) => (
            <li
              key={loc.key}
              className="flex flex-col gap-1.5 rounded-md border border-white/5 bg-white/[0.02] p-2.5 text-sm hover:bg-white/[0.04]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium text-neutral-200">
                    {loc.label}
                  </span>
                  {loc.is_custom && (
                    <span className="rounded bg-sky-950 px-1.5 py-0.5 text-[10px] font-medium text-sky-400 border border-sky-800/60">
                      Custom location
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleSelectLocation(loc.key)}
                    className="flex items-center gap-1 rounded bg-white/5 px-2.5 py-1 text-xs text-neutral-200 hover:bg-white/10"
                    title="Choose a different folder for this location"
                  >
                    Change
                  </button>
                  {loc.is_custom && (
                    <button
                      type="button"
                      onClick={() => void handleResetLocation(loc.key)}
                      className="flex items-center gap-1 rounded bg-white/5 px-2 py-1 text-xs text-amber-300 hover:bg-white/10"
                      title="Reset to default application data folder"
                    >
                      <RotateCcw size={12} /> Reset
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => window.reelforge.openFolderInShell(loc.path)}
                    className="flex items-center gap-1 rounded bg-white/5 px-2.5 py-1 text-xs text-neutral-300 hover:bg-white/10"
                    title="Open in File Explorer"
                  >
                    <FolderOpen size={13} /> Open
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-neutral-500">
                <span className="truncate" title={loc.path}>
                  {loc.path}
                </span>
                {loc.free_bytes !== undefined && loc.free_bytes !== null && (
                  <span className="shrink-0 text-neutral-400">
                    {formatBytes(loc.free_bytes)} free
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
          <div>
            <div className="text-xs font-medium text-neutral-300">
              Clear temporary cache
            </div>
            <div className="text-xs text-neutral-500">
              Removes cached thumbnails and intermediate render files.
            </div>
          </div>
          <button
            type="button"
            disabled={clearingCache}
            onClick={() => void handleClearCache()}
            className="flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-amber-300 hover:bg-white/5 disabled:opacity-50"
          >
            {clearingCache ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : (
              <Trash2 size={13} />
            )}
            Clear cache
          </button>
        </div>
        {cacheResult && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400">
            <Check size={13} /> {cacheResult.message}
          </p>
        )}
      </section>
      <section className="rounded-lg border border-white/10 bg-neutral-950 p-5">
        <h2 className="mb-2 text-sm font-medium text-neutral-200">
          Editing feedback
        </h2>
        <p className="mb-3 text-xs text-neutral-500">
          Stored locally. Pacing feedback makes a small, bounded adjustment to
          later suggestions. Delete entries at any time.
        </p>
        {feedback.length === 0 ? (
          <p className="text-xs text-neutral-500">No feedback stored.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {feedback.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between rounded px-2 py-2 text-xs hover:bg-white/5"
              >
                <span className="text-neutral-400">
                  {entry.subject} · {entry.action} ·{' '}
                  {new Date(entry.created_at).toLocaleString()}
                </span>
                <button
                  type="button"
                  title="Delete feedback entry"
                  onClick={async () => {
                    await window.reelforge.deleteEditingFeedback(entry.id);
                    setFeedback(await window.reelforge.listEditingFeedback());
                  }}
                  className="rounded p-1 text-neutral-500 hover:text-red-300"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-xs text-neutral-500">
        Rendered output, projects, media, and cache directories are fully
        configurable. Changing a location takes effect immediately for all new
        operations without altering your original files.
      </p>
    </div>
  );
}
