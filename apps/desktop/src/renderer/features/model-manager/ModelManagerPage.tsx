import { useEffect, useState } from 'react';
import { BadgeCheck, Cpu, HardDrive, RefreshCw, RotateCcw } from 'lucide-react';

import type { ModelManagerInfo } from '../../../shared/ipc-contract';
import { useServiceStatus } from '../../hooks/useServiceStatus';
import { useAppStore } from '../../stores/useAppStore';

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export function ModelManagerPage() {
  const service = useServiceStatus();
  const setActiveSection = useAppStore((state) => state.setActiveSection);
  const [info, setInfo] = useState<ModelManagerInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setInfo(await window.reelforge.getModelManagerInfo());
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not load model status',
      );
    }
  }

  useEffect(() => {
    if (service.state === 'ready') void refresh();
  }, [service.state]);

  async function changeModel(action: 'promote' | 'rollback') {
    setBusy(true);
    setError(null);
    try {
      if (action === 'promote')
        await window.reelforge.promotePacingPreferenceModel();
      else await window.reelforge.rollbackPacingPreferenceModel();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Model action failed');
    } finally {
      setBusy(false);
    }
  }

  if (service.state !== 'ready') {
    return (
      <p className="text-sm text-neutral-500">
        Waiting for the local processing service to start…
      </p>
    );
  }

  const model = info?.models[0];
  return (
    <div className="flex max-w-4xl flex-col gap-5">
      {error && (
        <p className="rounded-md border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-300">
          {error}
        </p>
      )}
      <section className="rounded-lg border border-white/10 bg-neutral-950 p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-neutral-100">
              Local models
            </h2>
            <p className="mt-1 text-xs text-neutral-500">
              Models stay on this computer. Promotion activates an evaluated
              checkpoint; rollback restores the prior version.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-2 text-xs text-neutral-300 hover:bg-white/5"
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        {model && (
          <article className="rounded-md border border-white/10 bg-neutral-900 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-medium text-neutral-100">
                  {model.name}
                </h3>
                <p className="mt-0.5 text-xs text-neutral-500">{model.id}</p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs ${model.status === 'active' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-neutral-800 text-neutral-400'}`}
              >
                {model.status === 'active' ? 'Active' : 'Not installed'}
              </span>
            </div>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <Detail label="Integrity" value={model.integrity} />
              <Detail label="File size" value={formatBytes(model.size_bytes)} />
              <Detail label="License" value={model.license} />
              <Detail label="Runtime" value={model.runtime} />
              <Detail
                label="Compatibility"
                value={`${model.compatibility.minimum_python}+ · CPU · ${model.compatibility.architectures.join(', ')}`}
              />
              <Detail
                label="Checkpoint SHA-256"
                value={model.sha256 ? `${model.sha256.slice(0, 20)}…` : '—'}
              />
            </dl>
            <p className="mt-3 text-xs text-neutral-500">
              {model.resource_policy}
            </p>
            {model.metrics && (
              <p className="mt-2 text-xs text-neutral-400">
                {model.metrics.sample_count} explicit ratings ·{' '}
                {model.metrics.evaluation_count ?? '—'} held-out ratings ·{' '}
                {(model.metrics.evaluation_accuracy * 100).toFixed(0)}% accuracy
                · {(model.metrics.majority_baseline_accuracy * 100).toFixed(0)}%
                majority baseline
                {model.metrics.evaluation_balanced_accuracy != null && (
                  <>
                    {' '}
                    ·{' '}
                    {(model.metrics.evaluation_balanced_accuracy * 100).toFixed(
                      0,
                    )}
                    % balanced accuracy
                  </>
                )}
              </p>
            )}
          </article>
        )}

        {info?.candidate && (
          <article className="mt-3 rounded-md border border-orange-500/20 bg-orange-500/5 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-orange-200">
              <BadgeCheck size={15} /> Evaluated candidate available
            </div>
            <p className="mt-1 text-xs text-neutral-400">
              {info.candidate.sample_count} ratings ·{' '}
              {info.candidate.evaluation_count ?? '—'} stratified holdout ·{' '}
              {(info.candidate.evaluation_accuracy * 100).toFixed(0)}% accuracy
              vs {(info.candidate.majority_baseline_accuracy * 100).toFixed(0)}%
              majority baseline
              {info.candidate.evaluation_balanced_accuracy != null && (
                <>
                  {' '}
                  ·{' '}
                  {(info.candidate.evaluation_balanced_accuracy * 100).toFixed(
                    0,
                  )}
                  % balanced accuracy
                </>
              )}
            </p>
            <button
              type="button"
              disabled={busy || !info.candidate.promotable}
              onClick={() => void changeModel('promote')}
              className="mt-3 rounded-md bg-orange-500 px-3 py-2 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-40"
            >
              Install and promote candidate
            </button>
            {!info.candidate.promotable && (
              <p className="mt-2 text-xs text-neutral-500">
                Candidate must meet the majority accuracy and exceed
                chance-level balanced accuracy before activation.
              </p>
            )}
          </article>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveSection('training-studio')}
            className="rounded-md border border-white/10 px-3 py-2 text-xs text-neutral-300 hover:bg-white/5"
          >
            Open Training Studio
          </button>
          <button
            type="button"
            disabled={busy || !info?.rollback_available}
            onClick={() => void changeModel('rollback')}
            className="flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-2 text-xs text-neutral-300 hover:bg-white/5 disabled:opacity-40"
          >
            <RotateCcw size={13} /> Roll back active model
          </button>
        </div>
      </section>

      {info?.hardware && (
        <section className="rounded-lg border border-white/10 bg-neutral-950 p-5">
          <h3 className="mb-3 text-sm font-medium text-neutral-200">
            This computer
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-2">
              <Cpu size={15} className="mt-0.5 text-neutral-500" />
              <Detail
                label="Processor"
                value={`${info.hardware.processor} · ${info.hardware.logical_cpu_count ?? 'unknown'} logical cores`}
              />
            </div>
            <div className="flex items-start gap-2">
              <HardDrive size={15} className="mt-0.5 text-neutral-500" />
              <Detail
                label="Memory"
                value={formatBytes(info.hardware.memory_bytes)}
              />
            </div>
          </div>
          <p className="mt-3 text-xs text-neutral-600">
            {info.hardware.accelerator}. The managed preference model has no GPU
            requirement.
          </p>
        </section>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-neutral-600">
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-xs text-neutral-300">{value}</dd>
    </div>
  );
}
