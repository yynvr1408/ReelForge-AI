import { useEffect, useState, type ReactElement } from 'react';
import { Upload, Scan, CheckCircle2, XCircle, Clock } from 'lucide-react';

import type { ReferenceVideo } from '../../../shared/ipc-contract';
import { useServiceStatus } from '../../hooks/useServiceStatus';

const STATUS_ICON: Record<string, ReactElement> = {
  pending: <Clock size={14} className="text-neutral-500" />,
  running: <Scan size={14} className="animate-pulse text-amber-400" />,
  complete: <CheckCircle2 size={14} className="text-emerald-400" />,
  failed: <XCircle size={14} className="text-red-400" />,
};

export function ReferenceLibraryPage() {
  const status = useServiceStatus();
  const [references, setReferences] = useState<ReferenceVideo[]>([]);
  const [importing, setImporting] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setReferences(await window.reelforge.listReferences());
  }

  useEffect(() => {
    if (status.state === 'ready') void refresh();
  }, [status.state]);

  async function handleImport() {
    setError(null);
    const paths = await window.reelforge.pickReferenceFiles();
    if (paths.length === 0) return;
    setImporting(true);
    try {
      for (const sourcePath of paths) {
        await window.reelforge.importReference(sourcePath);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  async function handleAnalyze(id: string) {
    setAnalyzingId(id);
    setError(null);
    try {
      await window.reelforge.analyzeReference(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setAnalyzingId(null);
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
          Downloaded reference reels used to learn an editing style.
        </p>
        <button
          type="button"
          onClick={handleImport}
          disabled={importing}
          className="flex items-center gap-1.5 rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
        >
          <Upload size={16} /> {importing ? 'Importing…' : 'Import reference'}
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {references.length === 0 ? (
        <p className="text-sm text-neutral-500">No reference videos yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {references.map((reference) => {
            const analysis = reference.analysis_json as Record<
              string,
              unknown
            > | null;
            return (
              <li
                key={reference.id}
                className="flex items-center justify-between rounded-lg border border-white/10 bg-neutral-950 px-4 py-3"
              >
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium text-neutral-100">
                    {reference.name}
                    {STATUS_ICON[reference.analysis_status]}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {reference.duration_seconds
                      ? `${reference.duration_seconds.toFixed(1)}s`
                      : '—'}
                    {reference.width && reference.height
                      ? ` · ${reference.width}×${reference.height}`
                      : ''}
                    {analysis?.cut_count !== undefined
                      ? ` · ${analysis.cut_count} cuts detected`
                      : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleAnalyze(reference.id)}
                  disabled={analyzingId === reference.id}
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/5 disabled:opacity-50"
                >
                  <Scan size={14} />
                  {reference.analysis_status === 'complete'
                    ? 'Re-analyze'
                    : 'Analyze'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
