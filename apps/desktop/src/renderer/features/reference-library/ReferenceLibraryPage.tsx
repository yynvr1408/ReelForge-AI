import { useEffect, useState, type ReactElement } from 'react';
import {
  Upload,
  Scan,
  CheckCircle2,
  XCircle,
  Clock,
  FolderPlus,
  Search,
  Tag,
  Trash2,
  Link2,
} from 'lucide-react';

import type {
  ReferenceAnalysisJob,
  ReferenceCollection,
  ReferenceVideo,
  SimilarReference,
} from '../../../shared/ipc-contract';
import { useServiceStatus } from '../../hooks/useServiceStatus';

const STATUS_ICON: Record<string, ReactElement> = {
  pending: <Clock size={14} className="text-neutral-500" />,
  running: <Scan size={14} className="animate-pulse text-amber-400" />,
  complete: <CheckCircle2 size={14} className="text-emerald-400" />,
  failed: <XCircle size={14} className="text-red-400" />,
  cancelled: <XCircle size={14} className="text-neutral-500" />,
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function metric(value: unknown, digits = 2): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(digits)
    : '—';
}

function referenceComparisonRows(reference: ReferenceVideo) {
  const analysis = record(reference.analysis_json);
  const visual = record(analysis?.visual);
  const audio = record(analysis?.audio);
  const durations = Array.isArray(analysis?.shot_durations_seconds)
    ? analysis.shot_durations_seconds.filter(
        (item): item is number =>
          typeof item === 'number' && Number.isFinite(item),
      )
    : [];
  const meanShot = durations.length
    ? durations.reduce((total, value) => total + value, 0) / durations.length
    : undefined;
  const tempos = Array.isArray(audio?.tempo_candidates_bpm)
    ? audio.tempo_candidates_bpm
        .map((candidate) => {
          const item = record(candidate);
          return typeof item?.bpm === 'number' ? item.bpm : null;
        })
        .filter((bpm): bpm is number => bpm !== null)
        .map((bpm) => `${bpm} BPM`)
        .join(', ')
    : '—';
  const speechRanges = Array.isArray(audio?.speech_like_ranges_seconds)
    ? audio.speech_like_ranges_seconds
        .map((range) => (Array.isArray(range) ? range : []))
        .filter(
          (range): range is [number, number] =>
            range.length === 2 &&
            typeof range[0] === 'number' &&
            typeof range[1] === 'number',
        )
    : [];
  const measuredAudioDuration =
    typeof audio?.duration_seconds === 'number' ? audio.duration_seconds : 0;
  const speechLikeRatio = measuredAudioDuration
    ? speechRanges.reduce((sum, [start, end]) => sum + end - start, 0) /
      measuredAudioDuration
    : undefined;
  return [
    [
      'Duration',
      reference.duration_seconds
        ? `${metric(reference.duration_seconds, 1)}s`
        : '—',
    ],
    ['Detected cuts', metric(analysis?.cut_count, 0)],
    ['Mean shot length', meanShot === undefined ? '—' : `${metric(meanShot)}s`],
    [
      'Analysis confidence',
      analysis?.confidence === undefined
        ? '—'
        : `${metric(Number(analysis.confidence) * 100, 0)}%`,
    ],
    ['Brightness', `${metric(visual?.brightness_mean_0_255, 0)} / 255`],
    ['Saturation', `${metric(visual?.saturation_mean_0_255, 0)} / 255`],
    ['Motion estimate', metric(visual?.motion_magnitude_median)],
    [
      'Shake candidates',
      `${metric(visual?.camera_shake_candidate_ratio === undefined ? undefined : Number(visual.camera_shake_candidate_ratio) * 100, 0)}% of sampled flow`,
    ],
    ['Tempo hypotheses', tempos],
    [
      'Rhythmic onset candidates',
      metric(
        Array.isArray(audio?.beat_candidates_seconds)
          ? audio.beat_candidates_seconds.length
          : undefined,
        0,
      ),
    ],
    [
      'Speech-like activity estimate',
      speechLikeRatio === undefined
        ? '—'
        : `${metric(speechLikeRatio * 100, 0)}% (heuristic)`,
    ],
  ] as const;
}

export function ReferenceLibraryPage() {
  const status = useServiceStatus();
  const [references, setReferences] = useState<ReferenceVideo[]>([]);
  const [comparedReferences, setComparedReferences] = useState<
    ReferenceVideo[]
  >([]);
  const [similarSource, setSimilarSource] = useState<ReferenceVideo | null>(
    null,
  );
  const [similarReferences, setSimilarReferences] = useState<
    SimilarReference[]
  >([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [collections, setCollections] = useState<ReferenceCollection[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCollection, setSelectedCollection] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [collectionName, setCollectionName] = useState('');
  const [collectionDrafts, setCollectionDrafts] = useState<
    Record<string, string>
  >({});
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [relinkingId, setRelinkingId] = useState<string | null>(null);
  const [analysisJob, setAnalysisJob] = useState<ReferenceAnalysisJob | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const filters: {
      search?: string;
      collectionId?: string;
      tag?: string;
      analysisStatus?: string;
      limit?: number;
      offset?: number;
    } = {};
    if (search.trim()) filters.search = search.trim();
    if (selectedCollection) filters.collectionId = selectedCollection;
    if (tagFilter.trim()) filters.tag = tagFilter.trim();
    if (statusFilter) filters.analysisStatus = statusFilter;
    filters.limit = 51;
    filters.offset = pageIndex * 50;
    const [items, groups] = await Promise.all([
      window.reelforge.listReferences(filters),
      window.reelforge.listReferenceCollections(),
    ]);
    setReferences(items.slice(0, 50));
    setHasMore(items.length > 50);
    setCollections(groups);
  }

  async function findSimilar(reference: ReferenceVideo) {
    setSimilarSource(reference);
    setSimilarLoading(true);
    setError(null);
    try {
      setSimilarReferences(
        await window.reelforge.findSimilarReferences(reference.id),
      );
    } catch (err) {
      setSimilarReferences([]);
      setError(
        err instanceof Error ? err.message : 'Could not compare references',
      );
    } finally {
      setSimilarLoading(false);
    }
  }

  useEffect(() => {
    if (status.state === 'ready') void refresh();
  }, [
    status.state,
    search,
    selectedCollection,
    tagFilter,
    statusFilter,
    pageIndex,
  ]);

  useEffect(() => {
    if (!analysisJob || !['queued', 'running'].includes(analysisJob.status)) {
      if (
        analysisJob &&
        ['complete', 'failed', 'cancelled'].includes(analysisJob.status)
      ) {
        setAnalyzingId(null);
        void refresh();
      }
      return;
    }
    const timer = setInterval(async () => {
      try {
        setAnalysisJob(
          await window.reelforge.getReferenceAnalysisJob(analysisJob.id),
        );
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Could not read analysis status',
        );
      }
    }, 700);
    return () => clearInterval(timer);
  }, [
    analysisJob?.id,
    analysisJob?.status,
    search,
    selectedCollection,
    tagFilter,
    statusFilter,
    pageIndex,
  ]);

  async function createCollection() {
    if (!collectionName.trim()) return;
    try {
      await window.reelforge.createReferenceCollection(collectionName.trim());
      setCollectionName('');
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not create collection',
      );
    }
  }

  async function renameCollection(collection: ReferenceCollection) {
    const name = collectionDrafts[collection.id]?.trim();
    if (!name || name === collection.name) return;
    await window.reelforge.renameReferenceCollection(collection.id, name);
    await refresh();
  }

  async function saveTags(reference: ReferenceVideo) {
    const tags = (tagDrafts[reference.id] ?? reference.tags_json.join(', '))
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    try {
      await window.reelforge.updateReference(reference.id, { tags });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save tags');
    }
  }

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
      const job = await window.reelforge.analyzeReference(id);
      setAnalysisJob(job);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
      setAnalyzingId(null);
    }
  }

  async function handleRelink(reference: ReferenceVideo) {
    const sourcePath = await window.reelforge.pickReferenceReplacementFile();
    if (!sourcePath) return;
    setRelinkingId(reference.id);
    setError(null);
    try {
      await window.reelforge.relinkReference(reference.id, sourcePath);
      setSimilarSource(null);
      setSimilarReferences([]);
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not relink reference',
      );
    } finally {
      setRelinkingId(null);
    }
  }

  async function handleCancelAnalysis(jobId: string) {
    try {
      setAnalysisJob(await window.reelforge.cancelReferenceAnalysisJob(jobId));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not cancel analysis',
      );
    }
  }

  function toggleComparison(reference: ReferenceVideo) {
    setComparedReferences((current) => {
      if (current.some((item) => item.id === reference.id))
        return current.filter((item) => item.id !== reference.id);
      if (current.length >= 2) return current;
      return [...current, reference];
    });
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

      <section className="flex flex-wrap items-end gap-3 rounded-lg border border-white/10 bg-neutral-950 p-4">
        <label className="min-w-56 flex-1 text-xs text-neutral-400">
          Search reference names
          <span className="mt-1 flex items-center gap-2 rounded-md border border-white/10 bg-neutral-900 px-2">
            <Search size={14} />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPageIndex(0);
              }}
              className="w-full bg-transparent py-2 text-sm text-neutral-100 outline-none"
              placeholder="Search…"
            />
          </span>
        </label>
        <label className="text-xs text-neutral-400">
          Collection
          <select
            value={selectedCollection}
            onChange={(event) => {
              setSelectedCollection(event.target.value);
              setPageIndex(0);
            }}
            className="mt-1 block rounded-md border border-white/10 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
          >
            <option value="">All collections</option>
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-neutral-400">
          Tag
          <input
            value={tagFilter}
            onChange={(event) => {
              setTagFilter(event.target.value);
              setPageIndex(0);
            }}
            placeholder="Filter by tag"
            className="mt-1 block w-36 rounded-md border border-white/10 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
          />
        </label>
        <label className="text-xs text-neutral-400">
          Analysis
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setPageIndex(0);
            }}
            className="mt-1 block rounded-md border border-white/10 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
          >
            <option value="">Any status</option>
            <option value="pending">Pending</option>
            <option value="running">Running</option>
            <option value="complete">Complete</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <div className="flex gap-2">
          <input
            value={collectionName}
            onChange={(event) => setCollectionName(event.target.value)}
            placeholder="New collection"
            className="rounded-md border border-white/10 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
          />
          <button
            type="button"
            onClick={() => void createCollection()}
            disabled={!collectionName.trim()}
            className="flex items-center gap-1 rounded-md border border-white/10 px-3 py-2 text-xs text-neutral-300 disabled:opacity-50"
          >
            <FolderPlus size={14} /> Add
          </button>
        </div>
      </section>

      {collections.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {collections.map((collection) => (
            <div
              key={collection.id}
              className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs text-neutral-400"
            >
              <input
                aria-label={`Rename ${collection.name}`}
                value={collectionDrafts[collection.id] ?? collection.name}
                onChange={(event) =>
                  setCollectionDrafts((current) => ({
                    ...current,
                    [collection.id]: event.target.value,
                  }))
                }
                onBlur={() => void renameCollection(collection)}
                className="w-28 bg-transparent outline-none"
              />
              <button
                type="button"
                title={`Delete ${collection.name} collection`}
                onClick={async () => {
                  await window.reelforge.deleteReferenceCollection(
                    collection.id,
                  );
                  if (selectedCollection === collection.id)
                    setSelectedCollection('');
                  await refresh();
                }}
                className="text-neutral-500 hover:text-red-300"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

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
                <div className="flex min-w-0 items-start gap-3">
                  <input
                    type="checkbox"
                    aria-label={`Compare ${reference.name}`}
                    checked={comparedReferences.some(
                      (item) => item.id === reference.id,
                    )}
                    disabled={
                      comparedReferences.length >= 2 &&
                      !comparedReferences.some(
                        (item) => item.id === reference.id,
                      )
                    }
                    onChange={() => toggleComparison(reference)}
                    className="mt-1 accent-orange-500"
                  />
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
                    {reference.file_missing && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-amber-300">
                        <span>Managed reference video is missing</span>
                        <button
                          type="button"
                          onClick={() => void handleRelink(reference)}
                          disabled={
                            relinkingId === reference.id ||
                            reference.analysis_status === 'running'
                          }
                          className="flex items-center gap-1 rounded border border-amber-400/20 px-2 py-1 hover:bg-amber-400/10 disabled:opacity-40"
                        >
                          <Link2 size={12} />{' '}
                          {relinkingId === reference.id
                            ? 'Relinking…'
                            : 'Relink'}
                        </button>
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <select
                        aria-label={`Collection for ${reference.name}`}
                        value={reference.collection_id ?? ''}
                        onChange={async (event) => {
                          await window.reelforge.updateReference(reference.id, {
                            collectionId: event.target.value,
                          });
                          await refresh();
                        }}
                        className="rounded border border-white/10 bg-neutral-900 px-2 py-1 text-xs text-neutral-300"
                      >
                        <option value="">Unsorted</option>
                        {collections.map((collection) => (
                          <option key={collection.id} value={collection.id}>
                            {collection.name}
                          </option>
                        ))}
                      </select>
                      <Tag size={13} className="text-neutral-500" />
                      <input
                        aria-label={`Tags for ${reference.name}`}
                        value={
                          tagDrafts[reference.id] ??
                          reference.tags_json.join(', ')
                        }
                        onChange={(event) =>
                          setTagDrafts((current) => ({
                            ...current,
                            [reference.id]: event.target.value,
                          }))
                        }
                        placeholder="Tags, comma separated"
                        className="w-52 rounded border border-white/10 bg-neutral-900 px-2 py-1 text-xs text-neutral-300"
                      />
                      <button
                        type="button"
                        onClick={() => void saveTags(reference)}
                        className="rounded border border-white/10 px-2 py-1 text-xs text-neutral-400"
                      >
                        Save tags
                      </button>
                      <label className="flex items-center gap-1 text-xs text-neutral-500">
                        <input
                          type="checkbox"
                          checked={reference.excluded_from_aggregation}
                          onChange={async (event) => {
                            await window.reelforge.updateReference(
                              reference.id,
                              {
                                excludedFromAggregation: event.target.checked,
                              },
                            );
                            await refresh();
                          }}
                          className="accent-orange-500"
                        />
                        Exclude from styles
                      </label>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {analysisJob?.reference_id === reference.id &&
                    ['queued', 'running'].includes(analysisJob.status) && (
                      <>
                        <span className="text-[11px] text-neutral-500">
                          {analysisJob.status} ·{' '}
                          {analysisJob.stage ?? 'starting'}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            void handleCancelAnalysis(analysisJob.id)
                          }
                          className="rounded border border-red-400/20 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  <button
                    type="button"
                    onClick={() => handleAnalyze(reference.id)}
                    disabled={
                      analyzingId === reference.id ||
                      reference.analysis_status === 'running' ||
                      reference.file_missing
                    }
                    className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/5 disabled:opacity-50"
                  >
                    <Scan size={14} />
                    {reference.analysis_status === 'complete'
                      ? 'Re-analyze'
                      : 'Analyze'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void findSimilar(reference)}
                    disabled={
                      reference.analysis_status !== 'complete' ||
                      reference.file_missing ||
                      similarLoading
                    }
                    className="flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/5 disabled:opacity-40"
                    title="Rank analyzed references by measured style signals"
                  >
                    <Search size={13} /> Similar
                  </button>
                </div>
                {analysisJob?.reference_id === reference.id &&
                  analysisJob.error_message && (
                    <p className="basis-full text-xs text-red-400">
                      {analysisJob.error_message}
                    </p>
                  )}
              </li>
            );
          })}
        </ul>
      )}
      {similarSource && (
        <section className="rounded-lg border border-white/10 bg-neutral-950 p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-neutral-200">
                Similar to {similarSource.name}
              </h3>
              <p className="mt-1 text-xs text-neutral-500">
                Ranked by overlapping measured pacing, visual, and audio
                signals. This is a descriptive heuristic, not semantic or
                scene-content recognition.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSimilarSource(null);
                setSimilarReferences([]);
              }}
              className="rounded border border-white/10 px-2 py-1 text-xs text-neutral-400"
            >
              Close
            </button>
          </div>
          {similarLoading ? (
            <p className="text-xs text-neutral-500">
              Comparing analyzed references…
            </p>
          ) : similarReferences.length === 0 ? (
            <p className="text-xs text-neutral-500">
              No other analyzed references have enough signals in common.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {similarReferences.map((item) => (
                <li
                  key={item.reference_id}
                  className="flex items-center justify-between gap-3 rounded border border-white/5 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-neutral-200">
                      {item.name}
                    </div>
                    <div className="text-xs text-neutral-500">
                      Compared: {item.shared_signals.join(' · ')}
                    </div>
                  </div>
                  <span className="shrink-0 text-sm tabular-nums text-orange-300">
                    {item.similarity_score}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {comparedReferences.length > 0 && (
        <section className="rounded-lg border border-white/10 bg-neutral-950 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-neutral-200">
                Reference comparison
              </h3>
              <p className="mt-1 text-xs text-neutral-500">
                Measured signals only. Rhythm and speech-like values are rough
                review estimates; comparison does not modify profiles or
                footage.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setComparedReferences([])}
              className="rounded border border-white/10 px-2 py-1 text-xs text-neutral-400 hover:bg-white/5"
            >
              Clear
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] table-fixed text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-neutral-300">
                  <th className="w-36 py-2 pr-3 font-medium">Signal</th>
                  {comparedReferences.map((reference) => (
                    <th key={reference.id} className="py-2 pr-3 font-medium">
                      {reference.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {referenceComparisonRows(comparedReferences[0]).map(
                  ([label, firstValue], index) => (
                    <tr key={label} className="border-b border-white/5">
                      <th className="py-2 pr-3 font-normal text-neutral-500">
                        {label}
                      </th>
                      <td className="py-2 pr-3 text-neutral-300">
                        {firstValue}
                      </td>
                      {comparedReferences[1] && (
                        <td className="py-2 pr-3 text-neutral-300">
                          {
                            referenceComparisonRows(comparedReferences[1])[
                              index
                            ][1]
                          }
                        </td>
                      )}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {(pageIndex > 0 || hasMore) && (
        <nav
          className="flex items-center justify-between border-t border-white/10 pt-3"
          aria-label="Reference pages"
        >
          <span className="text-xs text-neutral-500">
            Page {pageIndex + 1} · 50 references per page
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPageIndex((page) => Math.max(0, page - 1))}
              disabled={pageIndex === 0}
              className="rounded border border-white/10 px-3 py-1.5 text-xs text-neutral-300 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPageIndex((page) => page + 1)}
              disabled={!hasMore}
              className="rounded border border-white/10 px-3 py-1.5 text-xs text-neutral-300 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
