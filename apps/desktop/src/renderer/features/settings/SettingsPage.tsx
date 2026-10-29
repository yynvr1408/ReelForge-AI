import { useEffect, useState } from 'react';
import { Check, FolderOpen, HardDrive, RefreshCw, Trash2 } from 'lucide-react';

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

  useEffect(() => {
    if (status.state === 'ready') {
      void Promise.all([
        window.reelforge.getStorageInfo().then(setInfo),
        window.reelforge.listEditingFeedback().then(setFeedback),
      ]);
    }
  }, [status.state]);

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
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-neutral-200">
          <HardDrive size={16} /> Storage locations
        </div>
        {info && (
          <p className="mb-3 text-xs text-neutral-500">
            {formatBytes(info.free_bytes)} free of{' '}
            {formatBytes(info.total_bytes)} on this drive.
          </p>
        )}
        <ul className="flex flex-col gap-1">
          {info?.locations.map((loc) => (
            <li
              key={loc.key}
              className="flex items-center justify-between gap-3 rounded-md px-2 py-2 text-sm hover:bg-white/5"
            >
              <div className="min-w-0">
                <div className="text-neutral-200">{loc.label}</div>
                <div className="truncate text-xs text-neutral-500">
                  {loc.path}
                </div>
              </div>
              <button
                type="button"
                onClick={() => window.reelforge.openFolderInShell(loc.path)}
                className="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/10"
              >
                <FolderOpen size={14} /> Open
              </button>
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
        Rendered output already lands in a real folder on disk (Rendered exports
        above) — open it from here or from a completed job in the Render Queue.
        These locations are not yet user-configurable; that's planned for a
        later hardening pass (see docs/development/known-limitations.md).
      </p>
    </div>
  );
}
