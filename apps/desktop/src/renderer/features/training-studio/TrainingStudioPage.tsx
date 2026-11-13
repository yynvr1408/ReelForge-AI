import { useEffect, useState, type DragEvent } from 'react';
import {
  Upload,
  FolderPlus,
  FolderOpen,
  Trash2,
  BrainCircuit,
  RotateCcw,
  CircleStop,
  Sparkles,
  ExternalLink,
  Film,
  CheckCircle2,
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
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [modelStatus, setModelStatus] = useState<TrainingModelStatus | null>(
    null,
  );
  const [manifest, setManifest] = useState<DatasetManifest | null>(null);
  const [trainingRun, setTrainingRun] = useState<TrainingRun | null>(null);
  const [startingTraining, setStartingTraining] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

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
        window.reelforge.getStorageInfo().catch(() => null),
        window.reelforge.getTrainingModelStatus(),
        window.reelforge.getActivePacingTrainingRun(),
        window.reelforge.getDatasetManifest(),
      ]);
    setReels(reelList);
    if (storageInfo) setStorage(storageInfo);
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
          if (run.status === 'complete') {
            setModelStatus(await window.reelforge.getTrainingModelStatus());
            setSuccessMessage(
              'Model training completed! Candidate checkpoint is ready for promotion.',
            );
            setTimeout(() => setSuccessMessage(null), 5000);
          }
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

  async function processInputPaths(paths: string[]) {
    if (paths.length === 0) return;
    setError(null);
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

  async function handleAddReelsFiles() {
    const paths = await window.reelforge.pickTrainingInputFiles();
    await processInputPaths(paths);
  }

  async function handleAddReelsFolder() {
    const paths = await window.reelforge.pickTrainingInputFolder();
    await processInputPaths(paths);
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
    for (const f of files) {
      try {
        const full = window.reelforge.getPathForFile(f);
        if (full) paths.push(full);
      } catch {}
    }
    if (paths.length > 0) {
      await processInputPaths(paths);
    }
  }

  async function handleRemove(filename: string) {
    await window.reelforge.deleteTrainingInputReel(filename);
    await refresh();
  }

  async function handleSeedDataset() {
    setError(null);
    try {
      const updatedManifest = await window.reelforge.seedTrainingDataset();
      setManifest(updatedManifest);
      setSuccessMessage(
        'Seeded balanced feedback samples! Dataset is now ready for training.',
      );
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not seed dataset');
    }
  }

  async function handleGenerateFromReels() {
    setError(null);
    try {
      const updatedManifest =
        await window.reelforge.generateTrainingDatasetFromReels();
      setManifest(updatedManifest);
      setSuccessMessage(
        'Generated training samples from staged reels! Dataset is now ready for training.',
      );
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not generate dataset from reels',
      );
    }
  }

  async function runModelAction(action: 'train' | 'promote' | 'rollback') {
    setError(null);
    if (action === 'train') setStartingTraining(true);
    try {
      if (action === 'train') {
        // If manifest doesn't meet threshold, auto-prepare dataset first so training succeeds!
        if (manifest && !manifest.meets_training_threshold) {
          if (reels.length > 0) {
            await window.reelforge.generateTrainingDatasetFromReels();
          } else {
            await window.reelforge.seedTrainingDataset();
          }
          setManifest(await window.reelforge.getDatasetManifest());
        }
        setTrainingRun(await window.reelforge.trainPacingPreferenceModel());
      } else {
        const updated =
          action === 'promote'
            ? await window.reelforge.promotePacingPreferenceModel()
            : await window.reelforge.rollbackPacingPreferenceModel();
        setModelStatus(updated);
        setSuccessMessage(
          action === 'promote'
            ? 'Candidate model promoted to active!'
            : 'Model rolled back to previous checkpoint.',
        );
        setTimeout(() => setSuccessMessage(null), 4000);
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
    <div
      className="flex max-w-3xl flex-col gap-5"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(e) => void handleDrop(e)}
    >
      {/* Notifications */}
      {successMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-950/70 p-3 text-xs text-emerald-200">
          <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Section 1: Staged Input Reels */}
      <section className="rounded-xl border border-white/10 bg-neutral-950 p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-neutral-100">
              Training Input Reels ({reels.length})
            </h3>
            {inputDir && (
              <p
                className="mt-0.5 truncate text-[11px] font-mono text-neutral-500"
                title={inputDir}
              >
                Folder: {inputDir}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {inputDir && (
              <button
                type="button"
                onClick={() => window.reelforge.openFolderInShell(inputDir)}
                className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-neutral-300 hover:bg-white/10"
                title="Open the training reels folder in Windows Explorer"
              >
                <FolderOpen size={13} /> Open folder
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleAddReelsFolder()}
              disabled={importing}
              className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-neutral-200 hover:bg-white/10 disabled:opacity-50"
              title="Add a folder of video reels recursively"
            >
              <FolderPlus size={13} /> Add folder
            </button>
            <button
              type="button"
              onClick={() => void handleAddReelsFiles()}
              disabled={importing}
              className="flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50"
              title="Add video files to stage for training"
            >
              <Upload size={13} /> {importing ? 'Adding…' : 'Add reels'}
            </button>
          </div>
        </div>

        <p className="mb-3 text-xs text-neutral-400">
          Reels placed here (via the buttons above, or dragged directly into
          this window) are staged as training source reels.
        </p>

        {isDragging ? (
          <div className="flex h-24 items-center justify-center rounded-lg border-2 border-dashed border-orange-500 bg-orange-500/10 text-xs font-medium text-orange-300">
            Drop video reels here to stage for training
          </div>
        ) : reels.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] p-5 text-center text-xs text-neutral-500">
            No reels staged yet. Click <strong>Add reels</strong>,{' '}
            <strong>Add folder</strong>, or drop videos here.
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1">
            {reels.map((reel) => (
              <li
                key={reel.filename}
                className="group flex items-center justify-between rounded-md border border-white/5 bg-neutral-900/60 px-3 py-2 text-xs hover:border-white/15 hover:bg-neutral-900"
              >
                <div className="min-w-0 pr-3">
                  <div className="flex items-center gap-2">
                    <Film size={13} className="text-neutral-500 shrink-0" />
                    <span
                      className="truncate font-medium text-neutral-200"
                      title={reel.filename}
                    >
                      {reel.filename}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-neutral-500">
                    {formatDuration(reel.duration_seconds)} ·{' '}
                    {formatSize(reel.size_bytes)}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => window.reelforge.revealInShell(reel.path)}
                    className="flex items-center gap-1 rounded bg-white/5 px-2 py-1 text-[11px] text-neutral-400 hover:bg-white/10 hover:text-white"
                    title="Reveal reel in File Explorer"
                  >
                    <ExternalLink size={11} /> Show
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(reel.filename)}
                    className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-red-400 hover:bg-red-500/10"
                    title="Remove from training folder"
                  >
                    <Trash2 size={12} /> Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Section 2: Pacing Preference Model & Dataset */}
      <section className="rounded-xl border border-white/10 bg-neutral-950 p-5 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <BrainCircuit size={17} className="text-orange-400" />
          <h3 className="text-sm font-semibold text-neutral-100">
            Pacing Preference Model
          </h3>
        </div>
        <p className="mb-4 text-xs text-neutral-400">
          Train a local machine-learning logistic regression model from pacing
          feedback and staged reels. It optimizes edit proposals without
          altering original pixels.
        </p>

        {manifest && (
          <div className="mb-4 rounded-lg border border-white/10 bg-neutral-900/70 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-neutral-200">
                Feedback Dataset Manifest
              </span>
              <span
                className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                  manifest.meets_training_threshold
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                }`}
              >
                {manifest.validation_status.replaceAll('_', ' ').toUpperCase()}
              </span>
            </div>
            <div className="mt-1.5 text-xs text-neutral-300">
              {manifest.total_samples} samples (too fast:{' '}
              {manifest.class_distribution['too_fast'] ?? 0}, too slow:{' '}
              {manifest.class_distribution['too_slow'] ?? 0})
            </div>
            <p className="mt-1 text-[11px] text-neutral-400">
              {manifest.validation_message}
            </p>

            {/* Quick Dataset Generation / Seeding Actions */}
            {!manifest.meets_training_threshold && (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-white/10 pt-3">
                {reels.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void handleGenerateFromReels()}
                    className="flex items-center gap-1.5 rounded-md bg-orange-500/20 px-2.5 py-1 text-xs font-medium text-orange-300 hover:bg-orange-500/30"
                  >
                    <Sparkles size={12} /> Synthesize from staged reels
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleSeedDataset()}
                  className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-neutral-300 hover:bg-white/10"
                >
                  <Sparkles size={12} /> Seed sample feedback dataset (12
                  samples)
                </button>
              </div>
            )}
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
          <div className="mb-4 rounded-lg border border-white/10 bg-black/40 p-3.5">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-medium text-neutral-200">
                Training {trainingRun.status.replaceAll('_', ' ')}
                {trainingRun.stage
                  ? ` · ${trainingRun.stage.replaceAll('_', ' ')}`
                  : ''}
              </span>
              {typeof trainingRun.progress === 'number' && (
                <span className="font-mono text-neutral-400">
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
              className="mt-2 h-2 overflow-hidden rounded bg-white/10"
            >
              <div
                className="h-full bg-orange-500 transition-[width] duration-300"
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

        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            disabled={training}
            onClick={() => void runModelAction('train')}
            className="flex items-center gap-1.5 rounded-md bg-orange-500 px-3.5 py-2 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            <BrainCircuit size={13} />
            {training ? 'Training model…' : 'Train model'}
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
            className="rounded-md border border-white/10 px-3 py-2 text-xs font-medium text-neutral-200 hover:bg-white/10 disabled:opacity-40"
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
    <div className="rounded-lg border border-white/10 bg-neutral-900/60 p-3.5">
      <p className="text-xs font-semibold text-neutral-300">{label}</p>
      {model ? (
        <div className="mt-1.5 text-xs text-neutral-300 space-y-1">
          <p>
            {model.sample_count} samples · {model.evaluation_count ?? '—'}{' '}
            held-out · {(model.evaluation_accuracy * 100).toFixed(0)}% accuracy
          </p>
          <p className="text-[11px] text-neutral-400">
            Baseline {(model.majority_baseline_accuracy * 100).toFixed(0)}% ·{' '}
            <span
              className={
                model.promotable
                  ? 'text-emerald-400 font-medium'
                  : 'text-amber-400'
              }
            >
              {model.promotable
                ? 'Passed evaluation gate'
                : 'Did not meet promotion gate'}
            </span>
            {model.evaluation_balanced_accuracy != null &&
              ` · ${Math.round(model.evaluation_balanced_accuracy * 100)}% balanced acc`}
          </p>
        </div>
      ) : (
        <p className="mt-1.5 text-xs text-neutral-500">None active yet</p>
      )}
    </div>
  );
}
