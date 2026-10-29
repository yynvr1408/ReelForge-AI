import { useEffect, useState } from 'react';
import { Upload, AlertTriangle, Link2 } from 'lucide-react';

import type { MediaAsset } from '../../../shared/ipc-contract';
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

  async function refresh() {
    const page = await window.reelforge.listMediaPage(
      PAGE_SIZE,
      pageIndex * PAGE_SIZE,
    );
    setMedia(page.items);
    setTotal(page.total);
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

  async function handleImport() {
    setError(null);
    const paths = await window.reelforge.pickMediaFiles();
    if (paths.length === 0) return;
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

  if (status.state !== 'ready') {
    return (
      <p className="text-sm text-neutral-500">
        Waiting for the local processing service to start…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-400">
          Original footage, images, and audio imported into the library.
        </p>
        <button
          type="button"
          onClick={handleImport}
          disabled={importing}
          className="flex items-center gap-1.5 rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
        >
          <Upload size={16} /> {importing ? 'Importing…' : 'Import media'}
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {total === 0 ? (
        <p className="text-sm text-neutral-500">No media imported yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-3">
            {media.map((asset) => (
              <div
                key={asset.id}
                className="rounded-lg border border-white/10 bg-neutral-950 p-3"
              >
                <div className="mb-2 flex aspect-video items-center justify-center overflow-hidden rounded-md bg-neutral-900">
                  {asset.thumbnail_path ? (
                    <img
                      src={`file://${asset.thumbnail_path}`}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : asset.status !== 'imported' ? (
                    <AlertTriangle size={20} className="text-amber-500" />
                  ) : (
                    <span className="text-xs text-neutral-600">
                      {asset.kind}
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-neutral-300">
                  {asset.storage_path.split(/[\\/]/).pop()}
                </div>
                {asset.status === 'missing' && (
                  <div className="mt-2 flex items-center justify-between text-xs text-amber-300">
                    <span>Managed media file is missing</span>
                    <button
                      type="button"
                      onClick={() => void handleRelink(asset)}
                      className="flex items-center gap-1 rounded border border-amber-400/20 px-2 py-1 hover:bg-amber-400/10"
                    >
                      <Link2 size={12} /> Relink
                    </button>
                  </div>
                )}
                <div className="mt-1 flex items-center justify-between text-xs text-neutral-500">
                  <span>{asset.kind}</span>
                  <span>{formatDuration(asset.duration_seconds)}</span>
                </div>
                {asset.width && asset.height && (
                  <div className="mt-0.5 text-xs text-neutral-500">
                    {asset.width}×{asset.height}
                    {asset.frame_rate
                      ? ` · ${asset.frame_rate.toFixed(1)}fps`
                      : ''}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-sm text-neutral-400">
            <span>
              Showing {pageIndex * PAGE_SIZE + 1}–
              {Math.min((pageIndex + 1) * PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPageIndex((page) => Math.max(0, page - 1))}
                disabled={pageIndex === 0}
                className="rounded border border-white/10 px-3 py-1.5 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPageIndex((page) => page + 1)}
                disabled={(pageIndex + 1) * PAGE_SIZE >= total}
                className="rounded border border-white/10 px-3 py-1.5 disabled:opacity-40"
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
