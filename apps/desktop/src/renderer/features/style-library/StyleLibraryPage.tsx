import { useEffect, useState } from 'react';
import { Download, Plus, Upload } from 'lucide-react';

import type {
  ReferenceVideo,
  StyleProfile,
  StyleProfileExport,
} from '../../../shared/ipc-contract';
import { useServiceStatus } from '../../hooks/useServiceStatus';

export function StyleLibraryPage() {
  const status = useServiceStatus();
  const [profiles, setProfiles] = useState<StyleProfile[]>([]);
  const [references, setReferences] = useState<ReferenceVideo[]>([]);
  const [selectedRefIds, setSelectedRefIds] = useState<string[]>([]);
  const [profileName, setProfileName] = useState('');
  const [creating, setCreating] = useState(false);
  const [styleDrafts, setStyleDrafts] = useState<
    Record<string, { shotDuration: number; color: Record<string, number> }>
  >({});
  const [savingProfileId, setSavingProfileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [p, r] = await Promise.all([
      window.reelforge.listStyleProfiles(),
      window.reelforge.listReferences(),
    ]);
    setProfiles(p);
    setReferences(r.filter((ref) => ref.analysis_status === 'complete'));
  }

  useEffect(() => {
    if (status.state === 'ready') void refresh();
  }, [status.state]);

  function toggleRef(id: string) {
    setSelectedRefIds((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id],
    );
  }

  async function handleCreate() {
    if (!profileName.trim() || selectedRefIds.length === 0) return;
    setCreating(true);
    setError(null);
    try {
      await window.reelforge.createStyleProfile(
        profileName.trim(),
        selectedRefIds,
      );
      setProfileName('');
      setSelectedRefIds([]);
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to create style profile',
      );
    } finally {
      setCreating(false);
    }
  }

  async function savePacing(profile: StyleProfile) {
    const current = styleDrafts[profile.id] ?? getStyleDraft(profile);
    setSavingProfileId(profile.id);
    setError(null);
    try {
      await window.reelforge.updateStyleProfile(profile.id, {
        medianShotDurationSeconds: current.shotDuration,
        color: current.color,
      });
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not save style settings',
      );
    } finally {
      setSavingProfileId(null);
    }
  }

  function getStyleDraft(profile: StyleProfile) {
    const pacing = profile.profile_json.pacing as
      | Record<string, number>
      | undefined;
    const adjustments = profile.profile_json.user_adjustments as
      | { color?: Record<string, number> }
      | undefined;
    return {
      shotDuration: pacing?.median_shot_duration_seconds ?? 3,
      color: {
        exposure: adjustments?.color?.exposure ?? 0,
        contrast: adjustments?.color?.contrast ?? 0,
        saturation: adjustments?.color?.saturation ?? 0,
        temperature: adjustments?.color?.temperature ?? 0,
      },
    };
  }

  function exportProfile(profile: StyleProfile) {
    const data: StyleProfileExport = {
      format: 'reelforge-style-profile',
      schema_version: 1,
      ...profile,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${profile.name.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'style-profile'}.reelforge-style.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importProfile(file?: File) {
    if (!file) return;
    setError(null);
    try {
      const imported = JSON.parse(await file.text()) as StyleProfileExport;
      await window.reelforge.importStyleProfile(imported);
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not import style profile',
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
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="rounded-lg border border-white/10 bg-neutral-950 p-5">
        <h2 className="mb-3 text-sm font-semibold text-neutral-200">
          Create a style profile
        </h2>
        {references.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Analyze at least one reference video in the Reference Library before
            creating a profile.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <input
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="Profile name"
              className="rounded-md border border-white/10 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-orange-500"
            />
            <div className="flex flex-col gap-1">
              {references.map((ref) => (
                <label
                  key={ref.id}
                  className="flex items-center gap-2 text-sm text-neutral-300"
                >
                  <input
                    type="checkbox"
                    checked={selectedRefIds.includes(ref.id)}
                    onChange={() => toggleRef(ref.id)}
                    className="accent-orange-500"
                  />
                  {ref.name}
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={handleCreate}
              disabled={
                creating || !profileName.trim() || selectedRefIds.length === 0
              }
              className="flex w-fit items-center gap-1.5 rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
            >
              <Plus size={16} /> Create profile
            </button>
          </div>
        )}
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-200">
            Saved profiles
          </h2>
          <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/5">
            <Upload size={14} /> Import profile
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                void importProfile(event.currentTarget.files?.[0]);
                event.currentTarget.value = '';
              }}
            />
          </label>
        </div>
        {profiles.length === 0 ? (
          <p className="text-sm text-neutral-500">No style profiles yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {profiles.map((profile) => {
              const pacing = profile.profile_json.pacing as
                | Record<string, number>
                | undefined;
              const visual = profile.profile_json.visual as
                | Record<string, number>
                | undefined;
              const audio = profile.profile_json.audio as
                | Record<string, unknown>
                | undefined;
              const speechRanges = Array.isArray(
                audio?.speech_like_ranges_seconds,
              )
                ? audio.speech_like_ranges_seconds.filter(
                    (range): range is [number, number] =>
                      Array.isArray(range) &&
                      range.length === 2 &&
                      typeof range[0] === 'number' &&
                      typeof range[1] === 'number',
                  )
                : [];
              const audioDuration =
                typeof audio?.duration_seconds === 'number'
                  ? audio.duration_seconds
                  : 0;
              const speechLikePercent = audioDuration
                ? (speechRanges.reduce(
                    (total, [start, end]) => total + end - start,
                    0,
                  ) /
                    audioDuration) *
                  100
                : undefined;
              const draft = styleDrafts[profile.id] ?? getStyleDraft(profile);
              const shotDuration = draft.shotDuration;
              return (
                <li
                  key={profile.id}
                  className="rounded-lg border border-white/10 bg-neutral-950 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-neutral-100">
                      {profile.name}
                    </div>
                    <button
                      type="button"
                      onClick={() => exportProfile(profile)}
                      className="flex shrink-0 items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-xs text-neutral-300 hover:bg-white/5"
                    >
                      <Download size={13} /> Export
                    </button>
                  </div>
                  <div className="text-xs text-neutral-500">
                    {profile.source_reference_ids.length} reference(s) ·
                    confidence {(profile.confidence * 100).toFixed(0)}%
                    {pacing
                      ? ` · median shot ${pacing.median_shot_duration_seconds.toFixed(2)}s`
                      : ''}
                  </div>
                  {visual && (
                    <p className="mt-2 text-xs text-neutral-500">
                      Visual reference averages: brightness{' '}
                      {visual.brightness_mean_0_255?.toFixed(0) ?? '—'}/255 ·
                      saturation{' '}
                      {visual.saturation_mean_0_255?.toFixed(0) ?? '—'}/255 ·
                      motion estimate{' '}
                      {visual.motion_magnitude_median?.toFixed(2) ?? '—'} ·
                      possible shake samples{' '}
                      {(
                        (visual.camera_shake_candidate_ratio ?? 0) * 100
                      ).toFixed(0)}
                      %
                    </p>
                  )}
                  {audio && (
                    <p className="mt-1 text-xs text-neutral-500">
                      Audio:{' '}
                      {typeof audio.transient_candidates_per_minute === 'number'
                        ? audio.transient_candidates_per_minute.toFixed(0)
                        : '—'}{' '}
                      transient candidates/min ·{' '}
                      {(
                        (typeof audio.silence_ratio === 'number'
                          ? audio.silence_ratio
                          : 0) * 100
                      ).toFixed(0)}
                      % measured silence
                      {Array.isArray(audio.beat_candidates_seconds)
                        ? ` · ${audio.beat_candidates_seconds.length} rhythmic onset candidates`
                        : ''}
                      {speechLikePercent !== undefined
                        ? ` · ${speechLikePercent.toFixed(0)}% speech-like activity (heuristic)`
                        : ''}
                      {Array.isArray(audio.tempo_candidates_bpm) &&
                      audio.tempo_candidates_bpm.length > 0
                        ? ` · tempo hypotheses ${audio.tempo_candidates_bpm.join(', ')} BPM (review before syncing)`
                        : ''}
                    </p>
                  )}
                  <div className="mt-3 flex max-w-lg items-center gap-3">
                    <label className="flex-1 text-xs text-neutral-400">
                      Suggested shot length: {shotDuration.toFixed(1)}s
                      <input
                        type="range"
                        min="0.5"
                        max="8"
                        step="0.1"
                        value={shotDuration}
                        onChange={(event) =>
                          setStyleDrafts((current) => ({
                            ...current,
                            [profile.id]: {
                              ...draft,
                              shotDuration: Number(event.target.value),
                            },
                          }))
                        }
                        className="mt-2 block w-full accent-orange-500"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void savePacing(profile)}
                      disabled={savingProfileId === profile.id}
                      className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/5 disabled:opacity-50"
                    >
                      Save style
                    </button>
                  </div>
                  <div className="mt-3 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
                    {(
                      [
                        ['exposure', 'Exposure', -1, 1],
                        ['contrast', 'Contrast', -0.9, 1],
                        ['saturation', 'Saturation', -1, 2],
                        ['temperature', 'Temperature', -1, 1],
                      ] as const
                    ).map(([field, label, min, max]) => (
                      <label key={field} className="text-xs text-neutral-400">
                        {label}: {draft.color[field].toFixed(2)}
                        <input
                          type="range"
                          min={min}
                          max={max}
                          step="0.05"
                          value={draft.color[field]}
                          onChange={(event) =>
                            setStyleDrafts((current) => ({
                              ...current,
                              [profile.id]: {
                                ...draft,
                                color: {
                                  ...draft.color,
                                  [field]: Number(event.target.value),
                                },
                              },
                            }))
                          }
                          className="mt-2 block w-full accent-orange-500"
                        />
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 max-w-2xl text-xs text-neutral-500">
                    A saved manual grade is applied to generated clips. Source
                    files stay unchanged; reset all four controls to zero to
                    preserve their original colors.
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
