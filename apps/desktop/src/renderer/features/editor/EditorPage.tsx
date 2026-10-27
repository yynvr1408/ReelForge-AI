import { useEffect, useRef, useState } from 'react';
import { Upload, Wand2, Play, FolderOpen, Save } from 'lucide-react';

import { useAppStore } from '../../stores/useAppStore';
import { useServiceStatus } from '../../hooks/useServiceStatus';
import type {
  MediaAsset,
  Project,
  RenderJob,
  StyleProfile,
  TimelineGenerateResult,
} from '../../../shared/ipc-contract';

export function EditorPage() {
  const status = useServiceStatus();
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);

  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [profiles, setProfiles] = useState<StyleProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [targetDuration, setTargetDuration] = useState<number>(15);
  const [generated, setGenerated] = useState<TimelineGenerateResult | null>(
    null,
  );
  const [renderJob, setRenderJob] = useState<RenderJob | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (status.state === 'ready')
      void window.reelforge.listProjects().then(setProjects);
  }, [status.state]);

  useEffect(() => {
    if (!activeProjectId) {
      setProject(null);
      return;
    }
    void window.reelforge.getProject(activeProjectId).then((p) => {
      setProject(p);
      setSelectedProfileId(p.selected_style_profile_id ?? '');
      if (p.timeline_json)
        setGenerated({
          timeline: p.timeline_json,
          validation: { is_valid: true, issues: [] },
        });
    });
    void window.reelforge.listMedia(activeProjectId).then(setMedia);
    void window.reelforge.listStyleProfiles().then(setProfiles);
  }, [activeProjectId]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  if (status.state !== 'ready') {
    return (
      <p className="text-sm text-neutral-500">
        Waiting for the local processing service to start…
      </p>
    );
  }

  if (!activeProjectId) {
    return (
      <div className="flex max-w-md flex-col gap-3">
        <p className="text-sm text-neutral-400">Select a project to edit.</p>
        <select
          className="rounded-md border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
          onChange={(e) => e.target.value && setActiveProjectId(e.target.value)}
          defaultValue=""
        >
          <option value="" disabled>
            Choose a project…
          </option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  async function handleImportSource() {
    setError(null);
    const paths = await window.reelforge.pickMediaFiles();
    if (paths.length === 0) return;
    setBusy('importing');
    try {
      for (const sourcePath of paths) {
        await window.reelforge.importMedia(activeProjectId!, sourcePath);
      }
      setMedia(await window.reelforge.listMedia(activeProjectId!));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(null);
    }
  }

  async function handleGenerate() {
    if (media.length === 0) return;
    setBusy('generating');
    setError(null);
    try {
      const result = await window.reelforge.generateTimeline(
        media.map((m) => m.id),
        selectedProfileId || undefined,
        targetDuration,
      );
      setGenerated(result);
      setRenderJob(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Timeline generation failed',
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleRender() {
    if (!generated || !activeProjectId) return;
    setBusy('rendering');
    setError(null);
    try {
      const job = await window.reelforge.startRender(
        activeProjectId,
        generated.timeline,
      );
      setRenderJob(job);
      pollRef.current = setInterval(async () => {
        const updated = await window.reelforge.getRenderJob(job.id);
        setRenderJob(updated);
        if (
          updated.status === 'complete' ||
          updated.status === 'failed' ||
          updated.status === 'cancelled'
        ) {
          if (pollRef.current) clearInterval(pollRef.current);
          setBusy(null);
        }
      }, 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Render failed to start');
      setBusy(null);
    }
  }

  async function handleSaveProject() {
    if (!activeProjectId || !generated) return;
    setBusy('saving');
    try {
      const updated = await window.reelforge.updateProject(activeProjectId, {
        timeline_json: generated.timeline,
        selected_style_profile_id: selectedProfileId || null,
      });
      setProject(updated);
    } finally {
      setBusy(null);
    }
  }

  const clips =
    (generated?.timeline.tracks as Array<{ clips: unknown[] }> | undefined)?.[0]
      ?.clips ?? [];

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-200">
          {project?.name ?? 'Loading…'}
        </h2>
        <button
          type="button"
          onClick={() => setActiveProjectId(null)}
          className="text-xs text-neutral-500 hover:text-neutral-300"
        >
          Switch project
        </button>
      </div>

      {error && (
        <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <section className="rounded-lg border border-white/10 bg-neutral-950 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-neutral-200">
            1. Source footage ({media.length})
          </h3>
          <button
            type="button"
            onClick={handleImportSource}
            disabled={busy === 'importing'}
            className="flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50"
          >
            <Upload size={14} /> Import footage
          </button>
        </div>
        {media.length === 0 && (
          <p className="text-sm text-neutral-500">
            No source footage imported yet.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-white/10 bg-neutral-950 p-5">
        <h3 className="mb-3 text-sm font-medium text-neutral-200">
          2. Style and duration
        </h3>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedProfileId}
            onChange={(e) => setSelectedProfileId(e.target.value)}
            className="rounded-md border border-white/10 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
          >
            <option value="">No style profile (default pacing)</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-neutral-400">
            Target duration
            <input
              type="number"
              min={1}
              value={targetDuration}
              onChange={(e) => setTargetDuration(Number(e.target.value))}
              className="w-20 rounded-md border border-white/10 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
            />
            sec
          </label>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={busy === 'generating' || media.length === 0}
            className="flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50"
          >
            <Wand2 size={14} /> Generate timeline
          </button>
        </div>
      </section>

      {generated && (
        <section className="rounded-lg border border-white/10 bg-neutral-950 p-5">
          <h3 className="mb-3 text-sm font-medium text-neutral-200">
            3. Timeline ({clips.length} clips)
          </h3>
          <ol className="flex flex-col gap-1 text-xs text-neutral-400">
            {clips.map((clip: any, i: number) => (
              <li
                key={clip.id ?? i}
                className="flex justify-between rounded bg-white/5 px-2 py-1"
              >
                <span>Clip {i + 1}</span>
                <span>
                  {clip.timeline_position_seconds?.toFixed(2)}s, duration{' '}
                  {(clip.source_out_seconds - clip.source_in_seconds).toFixed(
                    2,
                  )}
                  s
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleRender}
              disabled={busy === 'rendering' || !generated.validation.is_valid}
              className="flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50"
            >
              <Play size={14} /> Render
            </button>
            <button
              type="button"
              onClick={handleSaveProject}
              disabled={busy === 'saving'}
              className="flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/5 disabled:opacity-50"
            >
              <Save size={14} /> Save project
            </button>
          </div>
        </section>
      )}

      {renderJob && (
        <section className="rounded-lg border border-white/10 bg-neutral-950 p-5">
          <h3 className="mb-2 text-sm font-medium text-neutral-200">
            4. Render status
          </h3>
          <p className="text-sm text-neutral-400">
            Status: <span className="text-neutral-200">{renderJob.status}</span>
            {renderJob.stage ? ` · stage: ${renderJob.stage}` : ''}
          </p>
          {renderJob.error_message && (
            <p className="mt-1 text-sm text-red-400">
              {renderJob.error_message}
            </p>
          )}
          {renderJob.status === 'complete' && renderJob.output_path && (
            <button
              type="button"
              onClick={() =>
                window.reelforge.openPathInShell(renderJob.output_path!)
              }
              className="mt-3 flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/5"
            >
              <FolderOpen size={14} /> Show rendered file
            </button>
          )}
        </section>
      )}
    </div>
  );
}
