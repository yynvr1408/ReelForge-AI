import { useEffect, useState } from 'react';
import { FolderOpen, HardDrive } from 'lucide-react';

import type { StorageInfo } from '../../../shared/ipc-contract';
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

  useEffect(() => {
    if (status.state === 'ready')
      void window.reelforge.getStorageInfo().then(setInfo);
  }, [status.state]);

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
