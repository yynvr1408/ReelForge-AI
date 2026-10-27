import { useEffect, useState } from 'react';
import { Upload, AlertTriangle } from 'lucide-react';

import type { MediaAsset } from '../../../shared/ipc-contract';
import { useServiceStatus } from '../../hooks/useServiceStatus';

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function MediaLibraryPage() {
  const status = useServiceStatus();
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setMedia(await window.reelforge.listMedia());
  }

  useEffect(() => {
    if (status.state === 'ready') void refresh();
  }, [status.state]);

  async function handleImport() {
    setError(null);
    const paths = await window.reelforge.pickMediaFiles();
    if (paths.length === 0) return;
    setImporting(true);
    try {
      for (const sourcePath of paths) {
        await window.reelforge.importMedia(null, sourcePath);
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

      {media.length === 0 ? (
        <p className="text-sm text-neutral-500">No media imported yet.</p>
      ) : (
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
                  <span className="text-xs text-neutral-600">{asset.kind}</span>
                )}
              </div>
              <div className="truncate text-xs text-neutral-300">
                {asset.storage_path.split(/[\\/]/).pop()}
              </div>
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
      )}
    </div>
  );
}
