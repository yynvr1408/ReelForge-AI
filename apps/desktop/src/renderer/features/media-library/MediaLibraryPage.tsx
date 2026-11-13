import { useEffect, useState, type DragEvent } from 'react';
import {
  Upload,
  FolderPlus,
  FolderOpen,
  AlertTriangle,
  Link2,
  ExternalLink,
  Film,
} from 'lucide-react';

import type { MediaAsset, StorageInfo } from '../../../shared/ipc-contract';
import { useServiceStatus } from '../../hooks/useServiceStatus';

const PAGE_SIZE = 48;

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function MediaLibraryPage() {
  const status = useServiceStatus();
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  async function refresh() {
    const [page, storageInfo] = await Promise.all([
      window.reelforge.listMediaPage(PAGE_SIZE, pageIndex * PAGE_SIZE),
      window.reelforge.getStorageInfo().catch(() => null),
    ]);
    setMedia(page.items);
    setTotal(page.total);
    if (storageInfo) setStorage(storageInfo);
    if (
      page.items.length === 0 &&
      pageIndex > 0 &&
      pageIndex * PAGE_SIZE >= page.total
    ) {
      setPageIndex(Math.max(0, Math.ceil(page.total / PAGE_SIZE) - 1));
    }
  }

  async function handleRelink(asset: MediaAsset) {
    const sourcePath = await window.reelforge.pickMediaFile();
    if (!sourcePath) return;
    try {
      await window.reelforge.relinkMedia(asset.id, sourcePath);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not relink media');
    }
  }

  useEffect(() => {
    if (status.state === 'ready') void refresh();
  }, [status.state, pageIndex]);

  async function processImportPaths(paths: string[]) {
    if (paths.length === 0) return;
    setError(null);
    setImporting(true);
    try {
      const results = await window.reelforge.importMediaBatch(null, paths);
      const failures = results.filter((result) => result.error);
      if (failures.length > 0) {
        const examples = failures
          .slice(0, 3)
          .map((result) => `${result.source_path}: ${result.error}`)
          .join(' · ');
        setError(
          `Imported ${results.length - failures.length} of ${results.length} files. ${examples}`,
        );
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  async function handleImportFiles() {
    const paths = await window.reelforge.pickMediaFiles();
    await processImportPaths(paths);
  }

  async function handleImportFolder() {
    const paths = await window.reelforge.pickMediaFolder();
    await processImportPaths(paths);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  async function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const paths: string[] = [];
    for (const file of files) {
      try {
        const fullPath = window.reelforge.getPathForFile(file);
        if (fullPath) paths.push(fullPath);
      } catch {
        // Fallback if not available
      }
    }
    if (paths.length > 0) {
      await processImportPaths(paths);
    }
  }

  const mediaDir = storage?.locations.find((l) => l.key === 'media')?.path;

  if (status.state !== 'ready') {
    return (
      <p className="text-sm text-neutral-500">
        Waiting for the local processing service to start…
      </p>
    );
  }

  return (
    <div
      className="flex flex-col gap-4"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(e) => void handleDrop(e)}
    >
      {/* Header with Direct Navigation and Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-100">
            Media Library
          </h2>
          <p className="text-xs text-neutral-400">
            Original footage, video clips, images, and audio available for
            editing.
          </p>
          {mediaDir && (
            <p
              className="mt-0.5 truncate text-[11px] text-neutral-500 font-mono"
              title={mediaDir}
            >
              Storage: {mediaDir}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {mediaDir && (
            <button
              type="button"
              onClick={() => window.reelforge.openFolderInShell(mediaDir)}
              className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-white/10"
              title="Open the media folder in Windows File Explorer"
            >
              <FolderOpen size={14} /> Open folder
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleImportFolder()}
            disabled={importing}
            className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-white/10 disabled:opacity-50"
            title="Import an entire folder of video/audio files recursively"
          >
            <FolderPlus size={14} /> Add folder
          </button>
          <button
            type="button"
            onClick={() => void handleImportFiles()}
            disabled={importing}
            className="flex items-center gap-1.5 rounded-md bg-orange-500 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50"
            title="Choose video, audio, or image files to import"
          >
            <Upload size={14} /> {importing ? 'Importing…' : 'Add videos'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-950/40 p-2.5 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Drag & Drop Visual Indicator or Empty State */}
      {isDragging && (
        <div className="flex h-36 flex-col items-center justify-center rounded-xl border-2 border-dashed border-orange-500 bg-orange-500/10 text-orange-300">
          <Upload size={28} className="animate-bounce" />
          <p className="mt-2 text-sm font-medium">
            Drop media files or folders here to import
          </p>
        </div>
      )}

      {!isDragging && total === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-neutral-950/60 p-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-500/10 text-orange-400">
            <Film size={24} />
          </div>
          <h3 className="mt-3 text-sm font-semibold text-neutral-200">
            No media imported yet
          </h3>
          <p className="mt-1 max-w-sm text-xs text-neutral-400">
            Click <strong>Add videos</strong> or <strong>Add folder</strong>{' '}
            above, or drag and drop video files directly into this window.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => void handleImportFiles()}
              className="flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600"
            >
              <Upload size={14} /> Add videos
            </button>
            {mediaDir && (
              <button
                type="button"
                onClick={() => window.reelforge.openFolderInShell(mediaDir)}
                className="flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/5"
              >
                <FolderOpen size={14} /> Open storage folder
              </button>
            )}
          </div>
        </div>
      ) : null}

      {!isDragging && total > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {media.map((asset) => (
              <div
                key={asset.id}
                className="group relative flex flex-col justify-between rounded-lg border border-white/10 bg-neutral-950 p-2.5 transition hover:border-white/20"
              >
                <div>
                  <div className="relative mb-2 flex aspect-video items-center justify-center overflow-hidden rounded-md bg-neutral-900">
                    {asset.thumbnail_path ? (
                      <img
                        src={`file://${asset.thumbnail_path}`}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : asset.status !== 'imported' ? (
                      <AlertTriangle size={20} className="text-amber-500" />
                    ) : (
                      <span className="text-xs text-neutral-600 font-medium uppercase">
                        {asset.kind}
                      </span>
                    )}

                    {/* Quick Reveal button on thumbnail hover */}
                    <button
                      type="button"
                      onClick={() =>
                        window.reelforge.revealInShell(asset.storage_path)
                      }
                      className="absolute right-1 top-1 rounded bg-black/70 p-1 text-white/80 opacity-0 transition group-hover:opacity-100 hover:bg-black hover:text-white"
                      title="Reveal file in File Explorer"
                    >
                      <ExternalLink size={12} />
                    </button>
                  </div>

                  <div
                    className="truncate text-xs font-medium text-neutral-200"
                    title={asset.storage_path.split(/[\\/]/).pop()}
                  >
                    {asset.storage_path.split(/[\\/]/).pop()}
                  </div>
                </div>

                <div>
                  {asset.status === 'missing' && (
                    <div className="mt-2 flex items-center justify-between text-xs text-amber-300">
                      <span>Missing</span>
                      <button
                        type="button"
                        onClick={() => void handleRelink(asset)}
                        className="flex items-center gap-1 rounded border border-amber-400/20 px-2 py-0.5 hover:bg-amber-400/10"
                      >
                        <Link2 size={11} /> Relink
                      </button>
                    </div>
                  )}

                  <div className="mt-2 flex items-center justify-between border-t border-white/5 pt-1.5 text-[11px] text-neutral-500">
                    <span className="capitalize">{asset.kind}</span>
                    <span>{formatDuration(asset.duration_seconds)}</span>
                  </div>

                  {asset.width && asset.height && (
                    <div className="mt-0.5 flex items-center justify-between text-[10px] text-neutral-500">
                      <span>
                        {asset.width}×{asset.height}
                      </span>
                      {asset.frame_rate && (
                        <span>{asset.frame_rate.toFixed(0)} fps</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-white/10 pt-3 text-xs text-neutral-400">
            <span>
              Showing {pageIndex * PAGE_SIZE + 1}–
              {Math.min((pageIndex + 1) * PAGE_SIZE, total)} of {total} items
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPageIndex((page) => Math.max(0, page - 1))}
                disabled={pageIndex === 0}
                className="rounded border border-white/10 px-3 py-1 text-xs text-neutral-300 disabled:opacity-40 hover:bg-white/5"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPageIndex((page) => page + 1)}
                disabled={(pageIndex + 1) * PAGE_SIZE >= total}
                className="rounded border border-white/10 px-3 py-1 text-xs text-neutral-300 disabled:opacity-40 hover:bg-white/5"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
