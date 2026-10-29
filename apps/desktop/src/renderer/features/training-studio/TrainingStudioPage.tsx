import { useEffect, useState } from 'react';
import {
  Upload,
  Trash2,
  FolderOpen,
  Info,
  BrainCircuit,
  RotateCcw,
  CircleStop,
} from 'lucide-react';

import type {
  DatasetManifest,
  InputReel,
  StorageInfo,
  TrainingModelStatus,
  TrainingRun,
} from '../../../shared/ipc-contract';
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
  const [modelStatus, setModelStatus] = useState<TrainingModelStatus | null>(
    null,
  );
  const [manifest, setManifest] = useState<DatasetManifest | null>(null);
  const [trainingRun, setTrainingRun] = useState<TrainingRun | null>(null);
  const [startingTraining, setStartingTraining] = useState(false);
  const training =
    startingTraining ||
    Boolean(
      trainingRun &&
      ['queued', 'running', 'cancel_requested'].includes(trainingRun.status),
    );

  async function refresh() {
    const [reelList, storageInfo, models, activeRun, datasetManifest] =
      await Promise.all([
        window.reelforge.listTrainingInputReels(),
        window.reelforge.getStorageInfo(),
        window.reelforge.getTrainingModelStatus(),
        window.reelforge.getActivePacingTrainingRun(),
        window.reelforge.getDatasetManifest(),
      ]);
    setReels(reelList);
    setStorage(storageInfo);
    setModelStatus(models);
    setTrainingRun(activeRun);
    setManifest(datasetManifest);
  }

  useEffect(() => {
    if (status.state === 'ready') void refresh();
  }, [status.state]);

  useEffect(() => {
    if (
      !trainingRun ||
      !['queued', 'running', 'cancel_requested'].includes(trainingRun.status)
    )
      return;
    const timer = setInterval(() => {
      void window.reelforge
        .getPacingTrainingRun(trainingRun.id)
        .then(async (run) => {
          setTrainingRun(run);
          if (run.status === 'complete')
            setModelStatus(await window.reelforge.getTrainingModelStatus());
          if (run.status === 'failed')
            setError(run.error_message ?? 'Training failed');
        })
        .catch((err: unknown) => {
          setError(
            err instanceof Error
              ? err.message
              : 'Could not read training progress',
          );
        });
    }, 500);
    return () => clearInterval(timer);
  }, [trainingRun?.id, trainingRun?.status]);

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

  async function runModelAction(action: 'train' | 'promote' | 'rollback') {
    setError(null);
    if (action === 'train') setStartingTraining(true);
    try {
      if (action === 'train') {
        setTrainingRun(await window.reelforge.trainPacingPreferenceModel());
      } else {
        const updated =
          action === 'promote'
            ? await window.reelforge.promotePacingPreferenceModel()
            : await window.reelforge.rollbackPacingPreferenceModel();
        setModelStatus(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Training action failed');
    } finally {
      setStartingTraining(false);
    }
  }

  async function cancelTraining() {
    if (!trainingRun || !['queued', 'running'].includes(trainingRun.status))
      return;
    try {
      setTrainingRun(
        await window.reelforge.cancelPacingTrainingRun(trainingRun.id),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not cancel training',
      );
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
          folder in Explorer) are staged as source media. The supported pacing
          preference task below learns only from explicit feedback and does not
          consume video frames.
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

      <section className="rounded-lg border border-white/10 bg-neutral-950 p-5">
        <div className="mb-3 flex items-center gap-2">
          <BrainCircuit size={16} className="text-orange-400" />
          <h3 className="text-sm font-medium text-neutral-200">
            Pacing preference model
          </h3>
        </div>
        <p className="mb-4 text-xs text-neutral-500">
          Train a small local logistic model from your explicit “too fast” and
          “too slow” timeline ratings. It learns pacing preferences only; staged
          videos are not used as training examples and frames or identities are
          never modified.
        </p>
        {manifest && (
          <div className="mb-4 rounded-md border border-white/10 bg-neutral-900 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-neutral-300">
                Feedback Dataset Manifest
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-[11px] ${
                  manifest.meets_training_threshold
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-amber-500/10 text-amber-400'
                }`}
              >
                {manifest.validation_status}
              </span>
            </div>
            <div className="mt-1 text-xs text-neutral-400">
              {manifest.total_samples} samples (too fast:{' '}
              {manifest.class_distribution['too_fast'] ?? 0}, too slow:{' '}
              {manifest.class_distribution['too_slow'] ?? 0})
            </div>
            <p className="mt-1 text-[11px] text-neutral-500">
              {manifest.validation_message}
            </p>
          </div>
        )}
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <ModelCard label="Active model" model={modelStatus?.active ?? null} />
          <ModelCard
            label="Candidate checkpoint"
            model={modelStatus?.candidate ?? null}
          />
        </div>
        {trainingRun && (
          <div className="mb-4 rounded-md border border-white/10 bg-black/20 p-3">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-neutral-300">
                Training {trainingRun.status.replaceAll('_', ' ')}
                {trainingRun.stage
                  ? ` · ${trainingRun.stage.replaceAll('_', ' ')}`
                  : ''}
              </span>
              {typeof trainingRun.progress === 'number' && (
                <span className="text-neutral-500">
                  {(trainingRun.progress * 100).toFixed(0)}%
                </span>
              )}
            </div>
            <div
              role="progressbar"
              aria-label="Training progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(trainingRun.progress * 100)}
              className="mt-2 h-1.5 overflow-hidden rounded bg-white/10"
            >
              <div
                className="h-full bg-orange-500 transition-[width]"
                style={{
                  width: `${Math.max(0, Math.min(1, trainingRun.progress)) * 100}%`,
                }}
              />
            </div>
            {trainingRun.error_message && (
              <p className="mt-2 text-xs text-red-400">
                {trainingRun.error_message}
              </p>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={training}
            onClick={() => void runModelAction('train')}
            className="rounded-md bg-orange-500 px-3 py-2 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {training ? 'Working…' : 'Train from feedback'}
          </button>
          {training && trainingRun?.status !== 'cancel_requested' && (
            <button
              type="button"
              onClick={() => void cancelTraining()}
              className="flex items-center gap-1.5 rounded-md border border-red-400/30 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10"
            >
              <CircleStop size={13} /> Cancel training
            </button>
          )}
          <button
            type="button"
            disabled={training || !modelStatus?.candidate?.promotable}
            onClick={() => void runModelAction('promote')}
            className="rounded-md border border-white/10 px-3 py-2 text-xs text-neutral-300 hover:bg-white/5 disabled:opacity-40"
          >
            Promote evaluated candidate
          </button>
          <button
            type="button"
            disabled={training || !modelStatus?.rollback_available}
            onClick={() => void runModelAction('rollback')}
            className="flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-2 text-xs text-neutral-300 hover:bg-white/5 disabled:opacity-40"
          >
            <RotateCcw size={13} /> Roll back
          </button>
        </div>
        <p className="mt-3 text-xs text-neutral-600">
          Training needs at least 8 valid pacing ratings, including at least 3
          in each direction. Candidates are evaluated on held-out examples
          before promotion.
        </p>
      </section>

      <section className="flex items-start gap-3 rounded-lg border border-white/10 bg-neutral-950 p-5">
        <Info size={16} className="mt-0.5 shrink-0 text-neutral-500" />
        <div>
          <p className="text-sm text-neutral-300">
            Video dataset training is not supported.
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            The folder above remains available for organizing source reels. This
            supported training task uses only explicit rating data; there is no
            video, face, body, or scene generation.
          </p>
        </div>
      </section>
    </div>
  );
}

function ModelCard({
  label,
  model,
}: {
  label: string;
  model: TrainingModelStatus['active'];
}) {
  return (
    <div className="rounded-md border border-white/10 bg-neutral-900 p-3">
      <p className="text-xs font-medium text-neutral-400">{label}</p>
      {model ? (
        <div className="mt-1 text-xs text-neutral-300">
          <p>
            {model.sample_count} samples · {model.evaluation_count ?? '—'}{' '}
            held-out · {(model.evaluation_accuracy * 100).toFixed(0)}% accuracy
          </p>
          <p className="mt-0.5 text-neutral-500">
            Baseline {(model.majority_baseline_accuracy * 100).toFixed(0)}% ·{' '}
            {model.promotable
              ? 'passed evaluation gate'
              : 'did not pass evaluation gate'}
            {model.evaluation_balanced_accuracy != null &&
              ` · ${Math.round(model.evaluation_balanced_accuracy * 100)}% balanced accuracy`}
          </p>
        </div>
      ) : (
        <p className="mt-1 text-xs text-neutral-600">None</p>
      )}
    </div>
  );
}
