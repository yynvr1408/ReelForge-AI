import { useEffect, useState } from 'react';
import { FolderOpen, RefreshCw } from 'lucide-react';

import type { RenderJob } from '../../../shared/ipc-contract';
import { useServiceStatus } from '../../hooks/useServiceStatus';

const STATUS_COLOR: Record<string, string> = {
  queued: 'text-neutral-400',
  running: 'text-amber-400',
  complete: 'text-emerald-400',
  failed: 'text-red-400',
  cancelled: 'text-neutral-500',
};

export function RenderQueuePage() {
  const status = useServiceStatus();
  const [jobs, setJobs] = useState<RenderJob[]>([]);

  async function refresh() {
    setJobs(await window.reelforge.listRenderJobs());
  }

  useEffect(() => {
    if (status.state !== 'ready') return;
    void refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, [status.state]);

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
          All render jobs across projects.
        </p>
        <button
          type="button"
          onClick={refresh}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/5"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {jobs.length === 0 ? (
        <p className="text-sm text-neutral-500">No render jobs yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {jobs.map((job) => (
            <li
              key={job.id}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-neutral-950 px-4 py-3"
            >
              <div>
                <div
                  className={`text-sm font-medium ${STATUS_COLOR[job.status] ?? 'text-neutral-300'}`}
                >
                  {job.status}
                  {job.stage ? ` · ${job.stage}` : ''}
                </div>
                <div className="text-xs text-neutral-500">
                  {new Date(job.created_at).toLocaleString()}
                  {job.error_message ? ` · ${job.error_message}` : ''}
                </div>
              </div>
              {job.status === 'complete' && job.output_path && (
                <button
                  type="button"
                  onClick={() =>
                    window.reelforge.openPathInShell(job.output_path!)
                  }
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/5"
                >
                  <FolderOpen size={14} /> Show file
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
