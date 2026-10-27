import { useEffect, useState } from 'react';
import { Upload, Trash2, FolderOpen, Info } from 'lucide-react';

import type { InputReel, StorageInfo } from '../../../shared/ipc-contract';
import { useServiceStatus } from '../../hooks/useServiceStatus';

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatSize(bytes: number): string {
  const mb = bytes / 1024 ** 2;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

export function TrainingStudioPage() {
  const status = useServiceStatus();
  const [reels, setReels] = useState<InputReel[]>([]);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [reelList, storageInfo] = await Promise.all([
      window.reelforge.listTrainingInputReels(),
      window.reelforge.getStorageInfo(),
    ]);
    setReels(reelList);
    setStorage(storageInfo);
  }

  useEffect(() => {
    if (status.state === 'ready') void refresh();
  }, [status.state]);

  const inputDir = storage?.locations.find(
    (l) => l.key === 'training_input',
  )?.path;

  async function handleAddReels() {
    setError(null);
    const paths = await window.reelforge.pickTrainingInputFiles();
    if (paths.length === 0) return;
    setImporting(true);
    try {
      for (const sourcePath of paths) {
        await window.reelforge.importTrainingInputReel(sourcePath);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add reel');
    } finally {
      setImporting(false);
    }
  }

  async function handleRemove(filename: string) {
    await window.reelforge.deleteTrainingInputReel(filename);
    await refresh();
  }

  if (status.state !== 'ready') {
    return (
      <p className="text-sm text-neutral-500">
        Waiting for the local processing service to start…
      </p>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <section className="rounded-lg border border-white/10 bg-neutral-950 p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-neutral-200">
              Training input reels ({reels.length})
            </h3>
            {inputDir && (
              <p className="mt-0.5 truncate text-xs text-neutral-500">
                {inputDir}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            {inputDir && (
              <button
                type="button"
                onClick={() => window.reelforge.openFolderInShell(inputDir)}
                className="flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/5"
              >
                <FolderOpen size={14} /> Open folder
              </button>
            )}
            <button
              type="button"
              onClick={handleAddReels}
              disabled={importing}
              className="flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50"
            >
              <Upload size={14} /> {importing ? 'Adding…' : 'Add reels'}
            </button>
          </div>
        </div>

        <p className="mb-3 text-xs text-neutral-500">
          Reels placed here (through this button, or dropped directly into the
          folder in Explorer) are what a training run will draw from. Training
          itself reads straight from this folder, so there's one place to manage
          what gets trained on.
        </p>

        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

        {reels.length === 0 ? (
          <p className="text-sm text-neutral-500">No reels staged yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {reels.map((reel) => (
              <li
                key={reel.filename}
                className="flex items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-white/5"
              >
                <div className="min-w-0">
                  <div className="truncate text-neutral-200">
                    {reel.filename}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {formatDuration(reel.duration_seconds)} ·{' '}
                    {formatSize(reel.size_bytes)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(reel.filename)}
                  className="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 size={14} /> Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex items-start gap-3 rounded-lg border border-white/10 bg-neutral-950 p-5">
        <Info size={16} className="mt-0.5 shrink-0 text-neutral-500" />
        <div>
          <p className="text-sm text-neutral-300">
            Training is not implemented yet.
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            Staging reels here is real and working — it's the first piece of
            Phase 9 (Training Studio). Actually training a model needs dataset
            manifests, task/model selection, hardware checks, checkpoints, and
            an evaluation-before-promotion step, none of which exist yet. See
            docs/development/implementation-roadmap.md for the planned build
            order.
          </p>
          <button
            type="button"
            disabled
            className="mt-3 cursor-not-allowed rounded-md bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-500"
          >
            Train (not available)
          </button>
        </div>
      </section>
    </div>
  );
}
