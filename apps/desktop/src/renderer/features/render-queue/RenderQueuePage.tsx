import { useEffect, useState } from 'react';
import { FolderOpen, RefreshCw, XCircle } from 'lucide-react';

import type { RenderJob } from '../../../shared/ipc-contract';
import { useServiceStatus } from '../../hooks/useServiceStatus';

const STATUS_COLOR: Record<string, string> = {
  queued: 'text-neutral-400',
  running: 'text-amber-400',
  complete: 'text-emerald-400',
  failed: 'text-red-400',
  cancelled: 'text-neutral-500',
};

function formatEta(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

export function RenderQueuePage() {
  const status = useServiceStatus();
  const [jobs, setJobs] = useState<RenderJob[]>([]);

  async function refresh() {
    setJobs(await window.reelforge.listRenderJobs());
  }

  useEffect(() => {
    if (status.state !== 'ready') return;
    void refresh();
    const hasActive = jobs.some((j) =>
      ['queued', 'running'].includes(j.status),
    );
    const interval = setInterval(refresh, hasActive ? 1000 : 3000);
    return () => clearInterval(interval);
  }, [status.state, jobs]);

  async function handleCancel(jobId: string) {
    try {
      await window.reelforge.cancelRenderJob(jobId);
      await refresh();
    } catch {}
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
          {jobs.map((job) => {
            const details = (
              job.validation_json as {
                progress_details?: {
                  speed?: string;
                  fps?: number;
                  eta_seconds?: number;
                  frames?: number;
                };
              } | null
            )?.progress_details;
            const pct = Math.min(
              100,
              Math.max(0, Math.round((job.progress ?? 0) * 100)),
            );

            return (
              <li
                key={job.id}
                className="flex flex-col gap-2 rounded-lg border border-white/10 bg-neutral-950 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-medium ${STATUS_COLOR[job.status] ?? 'text-neutral-300'}`}
                    >
                      {job.status}
                    </span>
                    {job.stage && (
                      <span className="text-xs text-neutral-400">
                        · {job.stage}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {new Date(job.created_at).toLocaleString()}
                    {job.error_message ? ` · ${job.error_message}` : ''}
                  </div>

                  {job.status === 'running' && (
                    <div className="mt-2.5 flex max-w-md flex-col gap-1.5">
                      <div className="flex items-center justify-between text-[11px] text-neutral-400">
                        <span className="font-medium text-amber-300">
                          {pct}%
                        </span>
                        {details && (
                          <span className="text-neutral-400">
                            {[
                              details.speed,
                              details.fps ? `${details.fps} fps` : null,
                              details.eta_seconds !== undefined
                                ? `ETA: ${formatEta(details.eta_seconds)}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        )}
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-amber-400 transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {['queued', 'running'].includes(job.status) && (
                    <button
                      type="button"
                      onClick={() => void handleCancel(job.id)}
                      className="flex items-center gap-1 rounded border border-red-500/30 px-2.5 py-1 text-xs text-red-300 hover:bg-red-500/10"
                    >
                      <XCircle size={13} /> Cancel
                    </button>
                  )}
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
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
