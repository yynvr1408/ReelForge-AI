import { useEffect, useState } from 'react';
import {
  Check,
  FolderOpen,
  HardDrive,
  RefreshCw,
  RotateCcw,
  Trash2,
  Video,
  Film,
  Download,
  Brain,
  ChevronDown,
  ChevronUp,
  Layers,
  Upload,
} from 'lucide-react';

import type {
  ClearCacheResult,
  EditingFeedback,
  StorageInfo,
  StorageLocation,
} from '../../../shared/ipc-contract';
import { useServiceStatus } from '../../hooks/useServiceStatus';

function formatBytes(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 ** 2;
  return `${mb.toFixed(0)} MB`;
}

const PRIMARY_KEYS = ['media', 'exports', 'reference', 'training_input'];

const FOLDER_META: Record<
  string,
  { icon: typeof Video; description: string; canImport?: boolean }
> = {
  media: {
    icon: Video,
    description: 'Your imported original video footage, audio, and images',
    canImport: true,
  },
  exports: {
    icon: Download,
    description: 'Where finished, rendered videos are saved',
  },
  reference: {
    icon: Film,
    description: 'Downloaded reference reels used for style analysis',
    canImport: true,
  },
  training_input: {
    icon: Brain,
    description: 'Staged reels used for training local models',
    canImport: true,
  },
  projects: {
    icon: Layers,
    description: 'Project metadata, history, and SQLite database',
  },
  checkpoints: {
    icon: Brain,
    description: 'Trained model checkpoints and weights',
  },
  cache: {
    icon: RefreshCw,
    description: 'Temporary thumbnails and intermediate render files',
  },
};

export function SettingsPage() {
  const status = useServiceStatus();
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [feedback, setFeedback] = useState<EditingFeedback[]>([]);
  const [cacheResult, setCacheResult] = useState<ClearCacheResult | null>(null);
  const [clearingCache, setClearingCache] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [importingKey, setImportingKey] = useState<string | null>(null);

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
      setLocationMessage(`Updated directory for ${key}`);
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

  async function handleDirectImport(key: string) {
    setImportingKey(key);
    setLocationMessage(null);
    try {
      if (key === 'media') {
        const paths = await window.reelforge.pickMediaFiles();
        if (paths.length > 0) {
          const res = await window.reelforge.importMediaBatch(null, paths);
          setLocationMessage(
            `Successfully imported ${res.length} media file(s) into Media Library.`,
          );
        }
      } else if (key === 'reference') {
        const paths = await window.reelforge.pickReferenceFiles();
        if (paths.length > 0) {
          for (const p of paths) await window.reelforge.importReference(p);
          setLocationMessage(
            `Successfully imported ${paths.length} reference video(s).`,
          );
        }
      } else if (key === 'training_input') {
        const paths = await window.reelforge.pickTrainingInputFiles();
        if (paths.length > 0) {
          for (const p of paths)
            await window.reelforge.importTrainingInputReel(p);
          setLocationMessage(
            `Successfully staged ${paths.length} reel(s) in Training Studio.`,
          );
        }
      }
      setTimeout(() => setLocationMessage(null), 4000);
    } catch (err) {
      setLocationMessage(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImportingKey(null);
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

  const primaryLocations = (info?.locations ?? []).filter((l) =>
    PRIMARY_KEYS.includes(l.key),
  );
  const advancedLocations = (info?.locations ?? []).filter(
    (l) => !PRIMARY_KEYS.includes(l.key),
  );

  const usedPercent =
    info && info.total_bytes > 0
      ? Math.round(
          ((info.total_bytes - info.free_bytes) / info.total_bytes) * 100,
        )
      : 0;

  function renderFolderCard(loc: StorageLocation) {
    const meta = FOLDER_META[loc.key] ?? {
      icon: FolderOpen,
      description: loc.label,
    };
    const IconComponent = meta.icon;

    return (
      <div
        key={loc.key}
        className="rounded-lg border border-white/10 bg-neutral-900/60 p-4 transition hover:border-white/20 hover:bg-neutral-900"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-orange-500/10 text-orange-400">
              <IconComponent size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-neutral-100">
                  {loc.label}
                </span>
                {loc.is_custom && (
                  <span className="rounded bg-sky-950 px-1.5 py-0.5 text-[10px] font-medium text-sky-400 border border-sky-800/60">
                    Custom folder
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-400">{meta.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {meta.canImport && (
              <button
                type="button"
                onClick={() => void handleDirectImport(loc.key)}
                disabled={importingKey === loc.key}
                className="flex items-center gap-1.5 rounded-md bg-orange-500/20 px-2.5 py-1 text-xs font-medium text-orange-300 hover:bg-orange-500/30 disabled:opacity-50"
                title="Directly add videos to this folder"
              >
                <Upload size={13} />{' '}
                {importingKey === loc.key ? 'Adding…' : 'Add videos'}
              </button>
            )}
            <button
              type="button"
              onClick={() => window.reelforge.openFolderInShell(loc.path)}
              className="flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium text-neutral-200 hover:bg-white/20"
              title="Open this folder in Windows File Explorer"
            >
              <FolderOpen size={13} /> Open
            </button>
            <button
              type="button"
              onClick={() => void handleSelectLocation(loc.key)}
              className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-neutral-300 hover:bg-white/5"
              title="Choose a different folder on your computer or external drive"
            >
              Change
            </button>
            {loc.is_custom && (
              <button
                type="button"
                onClick={() => void handleResetLocation(loc.key)}
                className="flex items-center gap-1 rounded-md border border-amber-500/30 px-2 py-1 text-xs text-amber-300 hover:bg-amber-500/10"
                title="Reset to standard default location"
              >
                <RotateCcw size={12} /> Reset
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/5 pt-2.5 text-xs text-neutral-500">
          <span
            className="truncate font-mono text-[11px] text-neutral-400"
            title={loc.path}
          >
            {loc.path}
          </span>
          {loc.free_bytes !== undefined && loc.free_bytes !== null && (
            <span className="shrink-0 text-neutral-400">
              {formatBytes(loc.free_bytes)} free
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {/* Top Banner / Notification */}
      {locationMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-sky-800/60 bg-sky-950/70 p-3 text-xs text-sky-200">
          <Check size={14} className="text-sky-400" />
          <span>{locationMessage}</span>
        </div>
      )}

      {/* Main Storage & Quick Access Section */}
      <section className="rounded-xl border border-white/10 bg-neutral-950 p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-neutral-100">
              <HardDrive size={18} className="text-orange-400" />
              Application Folders & Storage
            </h2>
            <p className="mt-0.5 text-xs text-neutral-400">
              Easily navigate to your video libraries, exports, and staged
              media.
            </p>
          </div>
          {info && (
            <div className="text-right">
              <span className="text-xs font-medium text-neutral-300">
                {formatBytes(info.free_bytes)} free of{' '}
                {formatBytes(info.total_bytes)}
              </span>
              <div className="mt-1 h-1.5 w-32 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-orange-500"
                  style={{
                    width: `${Math.min(100, Math.max(0, usedPercent))}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Essential Primary Folders Grid */}
        <div className="flex flex-col gap-3">
          {primaryLocations.map(renderFolderCard)}
        </div>

        {/* Collapsible Advanced Technical Folders */}
        <div className="mt-4 border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-200"
          >
            {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {showAdvanced
              ? 'Hide advanced directories'
              : 'Show advanced directories (Projects, Checkpoints, Cache)'}
          </button>

          {showAdvanced && (
            <div className="mt-3 flex flex-col gap-3 pl-2 border-l border-white/10">
              {advancedLocations.map(renderFolderCard)}
            </div>
          )}
        </div>

        {/* Cache Purge */}
        <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
          <div>
            <div className="text-xs font-medium text-neutral-200">
              Clear temporary cache
            </div>
            <div className="text-xs text-neutral-500">
              Safely removes generated thumbnails and intermediate render files
              to free up disk space.
            </div>
          </div>
          <button
            type="button"
            disabled={clearingCache}
            onClick={() => void handleClearCache()}
            className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            {clearingCache ? (
              <RefreshCw size={13} className="animate-spin text-orange-400" />
            ) : (
              <Trash2 size={13} className="text-neutral-400" />
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

      {/* Editing Feedback Section */}
      <section className="rounded-xl border border-white/10 bg-neutral-950 p-5">
        <h2 className="mb-1 text-sm font-semibold text-neutral-200">
          Timeline Editing Feedback
        </h2>
        <p className="mb-4 text-xs text-neutral-400">
          Stored locally. Your pacing ratings guide the local preference
          learning model.
        </p>
        {feedback.length === 0 ? (
          <p className="text-xs text-neutral-500">
            No feedback entries stored yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
            {feedback.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between rounded-md border border-white/5 bg-neutral-900/50 px-3 py-2 text-xs hover:bg-neutral-900"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-orange-300">
                    {entry.action.replaceAll('_', ' ')}
                  </span>
                  <span className="text-neutral-500">·</span>
                  <span className="text-neutral-400">{entry.subject}</span>
                  <span className="text-neutral-500">·</span>
                  <span className="text-neutral-500">
                    {new Date(entry.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <button
                  type="button"
                  title="Delete feedback entry"
                  onClick={async () => {
                    await window.reelforge.deleteEditingFeedback(entry.id);
                    setFeedback(await window.reelforge.listEditingFeedback());
                  }}
                  className="rounded p-1 text-neutral-500 hover:text-red-400"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
