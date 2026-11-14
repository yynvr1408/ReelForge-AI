import { useEffect, useRef, useState, type DragEvent } from 'react';
import {
  Upload,
  FolderPlus,
  FolderOpen,
  ExternalLink,
  Film,
  Wand2,
  Play,
  Save,
  ThumbsUp,
  ThumbsDown,
  Undo2,
  Redo2,
  ArrowUp,
  ArrowDown,
  Trash2,
  Palette,
  History,
  CheckCircle2,
  Music,
  RefreshCw,
  Volume2,
  VolumeX,
  Copy,
  Sparkles,
} from 'lucide-react';

import { useAppStore } from '../../stores/useAppStore';
import { useServiceStatus } from '../../hooks/useServiceStatus';
import type {
  LLMAdapterInfo,
  LutInfo,
  MediaAsset,
  MusicSyncReport,
  Project,
  ProjectVersion,
  RenderJob,
  StyleProfile,
  TimelineAlternative,
  TimelineGenerateResult,
} from '../../../shared/ipc-contract';

const EXPORT_PRESETS = {
  vertical_1080: {
    label: '9:16 Vertical HD (1080 × 1920)',
    width: 1080,
    height: 1920,
  },
  vertical_720: {
    label: '9:16 Vertical Fast (720 × 1280)',
    width: 720,
    height: 1280,
  },
  portrait_4_5: {
    label: '4:5 Portrait Feed (1080 × 1350)',
    width: 1080,
    height: 1350,
  },
  horizontal: {
    label: '16:9 Landscape HD (1920 × 1080)',
    width: 1920,
    height: 1080,
  },
  square: {
    label: '1:1 Square Feed (1080 × 1080)',
    width: 1080,
    height: 1080,
  },
} as const;

type ExportPreset = keyof typeof EXPORT_PRESETS;

function presetForDimensions(width?: number, height?: number): ExportPreset {
  if (!width || !height) return 'vertical_1080';
  if (Math.abs(width - height) <= 2) return 'square';
  if (width === 1080 && height === 1350) return 'portrait_4_5';
  if (width === 720 && height === 1280) return 'vertical_720';
  if (width > height) return 'horizontal';
  return 'vertical_1080';
}

const COLOR_PRESETS = [
  {
    name: 'Neutral',
    values: { exposure: 0, contrast: 0, saturation: 0, temperature: 0 },
  },
  {
    name: 'Golden Hour',
    values: {
      exposure: 0.08,
      contrast: 0.12,
      saturation: 0.25,
      temperature: 0.35,
    },
  },
  {
    name: 'Cinematic Teal',
    values: {
      exposure: -0.05,
      contrast: 0.2,
      saturation: -0.1,
      temperature: -0.25,
    },
  },
  {
    name: 'Vivid Pop',
    values: {
      exposure: 0.05,
      contrast: 0.25,
      saturation: 0.45,
      temperature: 0.05,
    },
  },
  {
    name: 'Vintage Film',
    values: {
      exposure: 0.1,
      contrast: -0.15,
      saturation: -0.2,
      temperature: 0.2,
    },
  },
  {
    name: 'Dramatic B&W',
    values: {
      exposure: 0.0,
      contrast: 0.35,
      saturation: -1.0,
      temperature: 0.0,
    },
  },
] as const;

type EditableClip = {
  id: string;
  source_media_id: string;
  source_in_seconds: number;
  source_out_seconds: number;
  timeline_position_seconds: number;
  playback_speed: number;
  transition_in?:
    | 'none'
    | 'cut'
    | 'fade'
    | 'crossfade'
    | 'wipeleft'
    | 'wiperight'
    | 'slideup'
    | 'slidedown'
    | 'dissolve';
  transition_duration_seconds?: number;
  stabilize?: boolean;
  reframe_x?: number;
  reframe_y?: number;
  color?: {
    exposure: number;
    contrast: number;
    saturation: number;
    temperature: number;
    lut_path?: string | null;
    lut_name?: string | null;
    lut_intensity?: number;
  };
  audio?: {
    gain_db: number;
    fade_in_seconds: number;
    fade_out_seconds: number;
  };
  selection_reason?: string | null;
  quality_score?: number | null;
  [key: string]: unknown;
};

type EditableTrack = {
  id: string;
  kind: string;
  clips: EditableClip[];
  overlays?: EditableTextOverlay[];
  [key: string]: unknown;
};

type EditableTextOverlay = {
  text: string;
  start_seconds: number;
  end_seconds: number;
  position: 'top' | 'center' | 'bottom';
  style_preset?:
    | 'default'
    | 'bold_yellow'
    | 'minimal_white'
    | 'cinematic_box'
    | 'neon_cyan';
  animation_preset?: 'none' | 'pop_in' | 'fade' | 'slide_up';
  font_size?: number;
  font_color?: string;
};

type EditableTimeline = {
  tracks: EditableTrack[];
  background_music?: {
    media_path?: string | null;
    media_id?: string | null;
    volume_db?: number;
    fade_in_seconds?: number;
    fade_out_seconds?: number;
    ducking_enabled?: boolean;
    ducking_attenuation_db?: number;
    loop?: boolean;
  } | null;
  voiceover?: {
    media_path?: string | null;
    media_id?: string | null;
    volume_db?: number;
    start_time_seconds?: number;
  } | null;
  [key: string]: unknown;
};

function formatEta(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

export function EditorPage() {
  const status = useServiceStatus();
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);

  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [projectVersions, setProjectVersions] = useState<ProjectVersion[]>([]);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [profiles, setProfiles] = useState<StyleProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [targetDuration, setTargetDuration] = useState<string>('');
  const [exportPreset, setExportPreset] =
    useState<ExportPreset>('vertical_1080');
  const [exportFps, setExportFps] = useState<number>(30);
  const [exportCrf, setExportCrf] = useState<number>(20);
  const [editingBrief, setEditingBrief] = useState('');
  const [adapters, setAdapters] = useState<LLMAdapterInfo[]>([]);
  const [selectedAdapterId, setSelectedAdapterId] =
    useState<string>('rule_based');
  const [alternatives, setAlternatives] = useState<TimelineAlternative[]>([]);
  const [loadingAlternatives, setLoadingAlternatives] = useState(false);
  const [generated, setGenerated] = useState<TimelineGenerateResult | null>(
    null,
  );
  const [renderJob, setRenderJob] = useState<RenderJob | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedbackNotice, setFeedbackNotice] = useState('');
  const [captionText, setCaptionText] = useState('');
  const [captionStart, setCaptionStart] = useState('0');
  const [captionEnd, setCaptionEnd] = useState('2');
  const [captionPosition, setCaptionPosition] =
    useState<EditableTextOverlay['position']>('bottom');
  const [captionStyle, setCaptionStyle] =
    useState<NonNullable<EditableTextOverlay['style_preset']>>('bold_yellow');
  const [captionAnimation, setCaptionAnimation] =
    useState<NonNullable<EditableTextOverlay['animation_preset']>>('pop_in');
  const [captionFontSize, setCaptionFontSize] = useState<number>(0);
  const [luts, setLuts] = useState<LutInfo[]>([]);
  const [tempoBpm, setTempoBpm] = useState<number>(120);
  const [syncScoreReport, setSyncScoreReport] =
    useState<MusicSyncReport | null>(null);
  const [busySnapBeats, setBusySnapBeats] = useState<boolean>(false);
  const [busyAutoCaptions, setBusyAutoCaptions] = useState<boolean>(false);
  const [captionNotification, setCaptionNotification] = useState<string | null>(
    null,
  );
  const [historyState, setHistoryState] = useState({
    canUndo: false,
    canRedo: false,
  });
  const [mediaDir, setMediaDir] = useState<string | null>(null);
  const [isDraggingSource, setIsDraggingSource] = useState(false);
  const historyRef = useRef<{
    past: TimelineGenerateResult[];
    future: TimelineGenerateResult[];
  }>({ past: [], future: [] });

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (status.state === 'ready') {
      void window.reelforge.listProjects().then(setProjects);
      void window.reelforge.listLLMAdapters().then(setAdapters);
      void window.reelforge
        .listLuts()
        .then(setLuts)
        .catch(() => {});
      void window.reelforge
        .getStorageInfo()
        .then((s) => {
          const m = s.locations.find((l) => l.key === 'media');
          if (m) setMediaDir(m.path);
        })
        .catch(() => {});
    }
  }, [status.state]);

  useEffect(() => {
    if (!activeProjectId) {
      setProject(null);
      setProjectVersions([]);
      return;
    }
    setProjectVersions([]);
    setShowVersionHistory(false);
    void window.reelforge.getProject(activeProjectId).then((p) => {
      historyRef.current = { past: [], future: [] };
      setHistoryState({ canUndo: false, canRedo: false });
      setProject(p);
      setSelectedProfileId(p.selected_style_profile_id ?? '');
      if (p.timeline_json)
        setGenerated({
          timeline: p.timeline_json,
          validation: { is_valid: true, issues: [] },
        });
      const settings = p.timeline_json?.export_settings as
        | { width?: number; height?: number; frame_rate?: number; crf?: number }
        | undefined;
      if (settings) {
        setExportPreset(presetForDimensions(settings.width, settings.height));
        if (typeof settings.frame_rate === 'number')
          setExportFps(settings.frame_rate);
        if (typeof settings.crf === 'number') setExportCrf(settings.crf);
      }
    });
    void window.reelforge
      .listProjectVersions(activeProjectId)
      .then(setProjectVersions)
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : 'Could not load project history',
        );
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

  async function processSourcePaths(paths: string[]) {
    if (paths.length === 0 || !activeProjectId) return;
    setError(null);
    setBusy('importing');
    try {
      const results = await window.reelforge.importMediaBatch(
        activeProjectId,
        paths,
      );
      const failures = results.filter((r) => r.error);
      if (failures.length > 0) {
        setError(
          `Imported ${results.length - failures.length} of ${results.length} files. (${failures[0].error})`,
        );
      }
      setMedia(await window.reelforge.listMedia(activeProjectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(null);
    }
  }

  async function handleImportSourceFiles() {
    const paths = await window.reelforge.pickMediaFiles();
    await processSourcePaths(paths);
  }

  async function handleImportSourceFolder() {
    const paths = await window.reelforge.pickMediaFolder();
    await processSourcePaths(paths);
  }

  function handleSourceDragOver(e: DragEvent<HTMLElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingSource(true);
  }

  function handleSourceDragLeave(e: DragEvent<HTMLElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingSource(false);
  }

  async function handleSourceDrop(e: DragEvent<HTMLElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingSource(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    const paths: string[] = [];
    for (const f of files) {
      try {
        const full = window.reelforge.getPathForFile(f);
        if (full) paths.push(full);
      } catch {
        // Fallback
      }
    }
    if (paths.length > 0) {
      await processSourcePaths(paths);
    }
  }

  async function handleGenerate() {
    if (media.filter((asset) => asset.kind === 'video').length === 0) return;
    setBusy('generating');
    setError(null);
    try {
      const result = await window.reelforge.generateTimeline(
        media.filter((asset) => asset.kind === 'video').map((m) => m.id),
        activeProjectId || undefined,
        selectedProfileId || undefined,
        targetDuration ? Number(targetDuration) : undefined,
        editingBrief || undefined,
        {
          width: EXPORT_PRESETS[exportPreset].width,
          height: EXPORT_PRESETS[exportPreset].height,
          frame_rate: exportFps,
          video_codec: 'libx264',
          audio_codec: 'aac',
          container: 'mp4',
          crf: exportCrf,
        },
        selectedAdapterId || undefined,
      );
      setGenerated(result);
      historyRef.current = { past: [], future: [] };
      setHistoryState({ canUndo: false, canRedo: false });
      setRenderJob(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Timeline generation failed',
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleFetchAlternatives() {
    if (!editingBrief.trim()) return;
    setLoadingAlternatives(true);
    try {
      const results = await window.reelforge.generateTimelineAlternatives({
        editingBrief,
        llmAdapter: selectedAdapterId,
        count: 3,
      });
      setAlternatives(results);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to generate alternatives',
      );
    } finally {
      setLoadingAlternatives(false);
    }
  }

  async function sendPacingFeedback(
    action: 'too_fast' | 'too_slow' | 'accepted' | 'rejected',
  ) {
    if (!activeProjectId || !generated) return;
    try {
      await window.reelforge.createEditingFeedback({
        projectId: activeProjectId,
        styleProfileId: selectedProfileId || undefined,
        subject: 'timeline_pacing',
        action,
        data: {
          clip_count: clips.length,
          target_duration_seconds: targetDuration
            ? Number(targetDuration)
            : null,
        },
      });
      setError(null);
      setFeedbackNotice(
        'Thanks. Your pacing feedback will inform the next suggestion.',
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not save editing feedback',
      );
    }
  }

  async function sendClipSelectionFeedback(
    clip: EditableClip,
    action: 'accepted' | 'rejected',
  ) {
    try {
      await window.reelforge.createEditingFeedback({
        projectId: activeProjectId || undefined,
        styleProfileId: selectedProfileId || undefined,
        subject: 'clip_selection',
        action,
        data: {
          media_id: clip.source_media_id,
          clip_id: clip.id,
          source_in_seconds: clip.source_in_seconds,
          source_out_seconds: clip.source_out_seconds,
          quality_score: clip.quality_score ?? null,
        },
      });
      setFeedbackNotice(
        action === 'accepted'
          ? 'Clip preference saved for future suggestions.'
          : 'Clip rejection saved for future suggestions.',
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not save clip feedback',
      );
    }
  }

  async function saveColorPreference(clip: EditableClip) {
    try {
      await window.reelforge.createEditingFeedback({
        projectId: activeProjectId || undefined,
        styleProfileId: selectedProfileId || undefined,
        subject: 'color',
        action: 'adjusted',
        data: {
          media_id: clip.source_media_id,
          clip_id: clip.id,
          color: {
            exposure: clip.color?.exposure ?? 0,
            contrast: clip.color?.contrast ?? 0,
            saturation: clip.color?.saturation ?? 0,
            temperature: clip.color?.temperature ?? 0,
          },
        },
      });
      setFeedbackNotice(
        'Grade saved for this source. Future suggestions will blend toward it.',
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not save color grade',
      );
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
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Render failed to start');
      setBusy(null);
    }
  }

  async function handleCancelRender() {
    if (!renderJob || !['queued', 'running'].includes(renderJob.status)) return;
    try {
      await window.reelforge.cancelRenderJob(renderJob.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel render');
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
      setProjectVersions(
        await window.reelforge.listProjectVersions(activeProjectId),
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleRestoreVersion(version: ProjectVersion) {
    if (!activeProjectId) return;
    setBusy('restoring');
    setError(null);
    try {
      const restored = await window.reelforge.restoreProjectVersion(
        activeProjectId,
        version.id,
      );
      setProject(restored);
      setSelectedProfileId(restored.selected_style_profile_id ?? '');
      historyRef.current = { past: [], future: [] };
      setHistoryState({ canUndo: false, canRedo: false });
      if (restored.timeline_json) {
        setGenerated({
          timeline: restored.timeline_json,
          validation: { is_valid: true, issues: [] },
        });
        const settings = restored.timeline_json.export_settings as
          | {
              width?: number;
              height?: number;
              frame_rate?: number;
              crf?: number;
            }
          | undefined;
        if (settings) {
          setExportPreset(presetForDimensions(settings.width, settings.height));
          if (typeof settings.frame_rate === 'number')
            setExportFps(settings.frame_rate);
          if (typeof settings.crf === 'number') setExportCrf(settings.crf);
        }
      } else {
        setGenerated(null);
      }
      setProjectVersions(
        await window.reelforge.listProjectVersions(activeProjectId),
      );
      setFeedbackNotice(`Restored version ${version.version_number}.`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not restore project version',
      );
    } finally {
      setBusy(null);
    }
  }

  const clips =
    (generated?.timeline.tracks as EditableTrack[] | undefined)?.find(
      (track) => track.kind === 'video',
    )?.clips ?? [];
  const captions =
    (generated?.timeline.tracks as EditableTrack[] | undefined)
      ?.filter((track) => track.kind === 'text')
      .flatMap((track) => track.overlays ?? []) ?? [];
  const timelineBgm = (generated?.timeline as EditableTimeline | undefined)
    ?.background_music;
  const timelineVo = (generated?.timeline as EditableTimeline | undefined)
    ?.voiceover;
  const videoMedia = media.filter((asset) => asset.kind === 'video');
  const previewClip = clips[0];
  const previewAsset = previewClip
    ? videoMedia.find((asset) => asset.id === previewClip.source_media_id)
    : undefined;
  const previewUrl = previewAsset
    ? `file:///${previewAsset.storage_path
        .replaceAll('\\', '/')
        .split('/')
        .map((segment, index) =>
          index === 0 ? segment : encodeURIComponent(segment),
        )
        .join('/')}`
    : undefined;
  const exportSettings = generated?.timeline.export_settings as
    | { width?: number; height?: number }
    | undefined;
  const outputWidth =
    exportSettings?.width ?? EXPORT_PRESETS[exportPreset].width;
  const outputHeight =
    exportSettings?.height ?? EXPORT_PRESETS[exportPreset].height;
  const firstSavedCaption = captions[0];
  const captionPreviewText =
    captionText.trim() || firstSavedCaption?.text || 'Caption preview';
  const captionPreviewPosition = captionText.trim()
    ? captionPosition
    : (firstSavedCaption?.position ?? 'bottom');

  function commitTimeline(timeline: EditableTimeline) {
    if (!generated) return;
    const videoTrack = timeline.tracks.find((track) => track.kind === 'video');
    let cursor = 0;
    let valid = true;
    if (videoTrack) {
      let previousDuration = 0;
      for (const [index, clip] of videoTrack.clips.entries()) {
        const sourceDuration = media.find(
          (asset) => asset.id === clip.source_media_id,
        )?.duration_seconds;
        if (
          clip.source_in_seconds < 0 ||
          clip.source_out_seconds <= clip.source_in_seconds ||
          clip.playback_speed <= 0 ||
          (sourceDuration !== null &&
            sourceDuration !== undefined &&
            clip.source_out_seconds > sourceDuration)
        ) {
          valid = false;
        }
        const clipDuration =
          (clip.source_out_seconds - clip.source_in_seconds) /
          Math.max(clip.playback_speed, 0.001);
        const transition = clip.transition_in ?? 'cut';
        if (index === 0 && transition === 'crossfade') {
          clip.transition_in = 'cut';
          clip.transition_duration_seconds = 0;
        } else if (transition === 'fade' || transition === 'crossfade') {
          const maximum = Math.min(
            2,
            clipDuration,
            transition === 'crossfade' ? previousDuration : clipDuration,
          );
          clip.transition_duration_seconds = Math.min(
            maximum,
            Math.max(0.1, clip.transition_duration_seconds || 0.5),
          );
          if (clip.transition_duration_seconds > 0) {
            cursor -=
              transition === 'crossfade' ? clip.transition_duration_seconds : 0;
          }
        } else {
          clip.transition_duration_seconds = 0;
        }
        clip.timeline_position_seconds = Number(cursor.toFixed(3));
        cursor += clipDuration;
        previousDuration = clipDuration;
      }
    }
    const timelineDuration = videoTrack
      ? Math.max(
          0,
          ...videoTrack.clips.map(
            (clip) =>
              clip.timeline_position_seconds +
              (clip.source_out_seconds - clip.source_in_seconds) /
                Math.max(clip.playback_speed, 0.001),
          ),
        )
      : 0;
    if (
      timeline.tracks
        .filter((track) => track.kind === 'text')
        .flatMap((track) => track.overlays ?? [])
        .some((overlay) => overlay.end_seconds > timelineDuration)
    ) {
      valid = false;
    }
    historyRef.current.past = [
      ...historyRef.current.past,
      structuredClone(generated),
    ].slice(-50);
    historyRef.current.future = [];
    setHistoryState({ canUndo: true, canRedo: false });
    setGenerated({
      ...generated,
      timeline: timeline as unknown as Record<string, unknown>,
      validation: {
        ...generated.validation,
        is_valid: valid && Boolean(videoTrack?.clips.length),
      },
    });
    setRenderJob(null);
  }

  function undoTimelineEdit() {
    if (!generated || historyRef.current.past.length === 0) return;
    const previous = historyRef.current.past.at(-1)!;
    historyRef.current.past = historyRef.current.past.slice(0, -1);
    historyRef.current.future = [
      ...historyRef.current.future,
      structuredClone(generated),
    ].slice(-50);
    setHistoryState({
      canUndo: historyRef.current.past.length > 0,
      canRedo: true,
    });
    setGenerated(previous);
    setRenderJob(null);
  }

  function redoTimelineEdit() {
    if (!generated || historyRef.current.future.length === 0) return;
    const next = historyRef.current.future.at(-1)!;
    historyRef.current.future = historyRef.current.future.slice(0, -1);
    historyRef.current.past = [
      ...historyRef.current.past,
      structuredClone(generated),
    ].slice(-50);
    setHistoryState({
      canUndo: true,
      canRedo: historyRef.current.future.length > 0,
    });
    setGenerated(next);
    setRenderJob(null);
  }

  function changeClip(
    clipId: string,
    field:
      | 'source_in_seconds'
      | 'source_out_seconds'
      | 'playback_speed'
      | 'reframe_x'
      | 'reframe_y',
    value: number,
  ) {
    if (!Number.isFinite(value)) return;
    const timeline = structuredClone(generated?.timeline) as
      | EditableTimeline
      | undefined;
    const track = timeline?.tracks.find((item) => item.kind === 'video');
    const clip = track?.clips.find((item) => item.id === clipId);
    if (!timeline || !clip) return;
    clip[field] = value;
    const sourceDuration = media.find(
      (asset) => asset.id === clip.source_media_id,
    )?.duration_seconds;
    if (
      clip.source_in_seconds < 0 ||
      clip.source_out_seconds <= clip.source_in_seconds ||
      clip.playback_speed <= 0 ||
      (sourceDuration !== null &&
        sourceDuration !== undefined &&
        clip.source_out_seconds > sourceDuration)
    )
      return;
    commitTimeline(timeline);
  }

  function changeClipColor(
    clipId: string,
    field: 'exposure' | 'contrast' | 'saturation' | 'temperature',
    value: number,
  ) {
    if (!Number.isFinite(value)) return;
    const timeline = structuredClone(generated?.timeline) as
      | EditableTimeline
      | undefined;
    const clip = timeline?.tracks
      .find((track) => track.kind === 'video')
      ?.clips.find((item) => item.id === clipId);
    if (!timeline || !clip) return;
    clip.color ??= { exposure: 0, contrast: 0, saturation: 0, temperature: 0 };
    clip.color[field] = value;
    commitTimeline(timeline);
  }

  function changeClipStabilization(clipId: string, enabled: boolean) {
    const timeline = structuredClone(generated?.timeline) as
      | EditableTimeline
      | undefined;
    const clip = timeline?.tracks
      .find((track) => track.kind === 'video')
      ?.clips.find((item) => item.id === clipId);
    if (!timeline || !clip) return;
    clip.stabilize = enabled;
    commitTimeline(timeline);
  }

  function changeClipTransition(
    clipId: string,
    transition: NonNullable<EditableClip['transition_in']>,
  ) {
    const timeline = structuredClone(generated?.timeline) as
      | EditableTimeline
      | undefined;
    const clip = timeline?.tracks
      .find((track) => track.kind === 'video')
      ?.clips.find((item) => item.id === clipId);
    if (!timeline || !clip) return;
    clip.transition_in = transition;
    clip.transition_duration_seconds =
      transition !== 'none' && transition !== 'cut' ? 0.5 : 0;
    commitTimeline(timeline);
  }

  function changeClipTransitionDuration(clipId: string, value: number) {
    if (!Number.isFinite(value)) return;
    const timeline = structuredClone(generated?.timeline) as
      | EditableTimeline
      | undefined;
    const clip = timeline?.tracks
      .find((track) => track.kind === 'video')
      ?.clips.find((item) => item.id === clipId);
    if (!timeline || !clip) return;
    clip.transition_duration_seconds = value;
    commitTimeline(timeline);
  }

  function moveClip(clipId: string, delta: -1 | 1) {
    const timeline = structuredClone(generated?.timeline) as
      | EditableTimeline
      | undefined;
    const track = timeline?.tracks.find((item) => item.kind === 'video');
    if (!timeline || !track) return;
    const index = track.clips.findIndex((item) => item.id === clipId);
    const nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || nextIndex >= track.clips.length) return;
    [track.clips[index], track.clips[nextIndex]] = [
      track.clips[nextIndex],
      track.clips[index],
    ];
    commitTimeline(timeline);
  }

  function removeClip(clipId: string) {
    const timeline = structuredClone(generated?.timeline) as
      | EditableTimeline
      | undefined;
    const track = timeline?.tracks.find((item) => item.kind === 'video');
    if (!timeline || !track) return;
    track.clips = track.clips.filter((item) => item.id !== clipId);
    commitTimeline(timeline);
  }

  function updateExportSettings(
    preset: ExportPreset,
    fps: number,
    crf: number,
  ) {
    setExportPreset(preset);
    setExportFps(fps);
    setExportCrf(crf);
    if (generated) {
      const timeline = structuredClone(generated.timeline) as EditableTimeline;
      timeline.export_settings = {
        width: EXPORT_PRESETS[preset].width,
        height: EXPORT_PRESETS[preset].height,
        frame_rate: fps,
        video_codec: 'libx264',
        audio_codec: 'aac',
        container: 'mp4',
        crf,
      };
      commitTimeline(timeline);
    }
  }

  function applyColorPresetToClip(
    clipId: string,
    presetValues: {
      exposure: number;
      contrast: number;
      saturation: number;
      temperature: number;
    },
  ) {
    const timeline = structuredClone(generated?.timeline) as
      | EditableTimeline
      | undefined;
    const clip = timeline?.tracks
      .find((track) => track.kind === 'video')
      ?.clips.find((item) => item.id === clipId);
    if (!timeline || !clip) return;
    clip.color = { ...presetValues };
    commitTimeline(timeline);
  }

  function applyColorToAllClips(color: NonNullable<EditableClip['color']>) {
    const timeline = structuredClone(generated?.timeline) as
      | EditableTimeline
      | undefined;
    const track = timeline?.tracks.find((t) => t.kind === 'video');
    if (!timeline || !track) return;
    for (const clip of track.clips) {
      clip.color = { ...color };
    }
    commitTimeline(timeline);
    setFeedbackNotice('Applied color grade to all timeline clips.');
  }

  function changeClipAudio(
    clipId: string,
    field: 'gain_db' | 'fade_in_seconds' | 'fade_out_seconds',
    value: number,
  ) {
    if (!Number.isFinite(value)) return;
    const timeline = structuredClone(generated?.timeline) as
      | EditableTimeline
      | undefined;
    const clip = timeline?.tracks
      .find((track) => track.kind === 'video')
      ?.clips.find((item) => item.id === clipId);
    if (!timeline || !clip) return;
    clip.audio ??= { gain_db: 0, fade_in_seconds: 0, fade_out_seconds: 0 };
    clip.audio[field] = value;
    commitTimeline(timeline);
  }

  function toggleClipMute(clipId: string) {
    const timeline = structuredClone(generated?.timeline) as
      | EditableTimeline
      | undefined;
    const clip = timeline?.tracks
      .find((track) => track.kind === 'video')
      ?.clips.find((item) => item.id === clipId);
    if (!timeline || !clip) return;
    clip.audio ??= { gain_db: 0, fade_in_seconds: 0, fade_out_seconds: 0 };
    clip.audio.gain_db = clip.audio.gain_db <= -40 ? 0 : -60;
    commitTimeline(timeline);
  }

  function addCaption() {
    const timeline = structuredClone(generated?.timeline) as
      | EditableTimeline
      | undefined;
    if (!timeline) return;
    const start = Number(captionStart);
    const end = Number(captionEnd);
    const duration = Math.max(
      0,
      ...timeline.tracks
        .filter((track) => track.kind === 'video')
        .flatMap((track) =>
          track.clips.map(
            (clip) =>
              clip.timeline_position_seconds +
              (clip.source_out_seconds - clip.source_in_seconds) /
                clip.playback_speed,
          ),
        ),
    );
    if (!captionText.trim() || start < 0 || end <= start || end > duration) {
      setError(
        `Enter caption text and a time range within 0–${duration.toFixed(2)} seconds.`,
      );
      return;
    }
    let textTrack = timeline.tracks.find((track) => track.kind === 'text');
    if (!textTrack) {
      textTrack = {
        id: `text-${Date.now()}`,
        kind: 'text',
        clips: [],
        overlays: [],
      };
      timeline.tracks.push(textTrack);
    }
    textTrack.overlays ??= [];
    textTrack.overlays.push({
      text: captionText.trim(),
      start_seconds: start,
      end_seconds: end,
      position: captionPosition,
      style_preset: captionStyle,
      animation_preset: captionAnimation,
      ...(captionFontSize > 0 ? { font_size: captionFontSize } : {}),
    });
    setError(null);
    setCaptionText('');
    commitTimeline(timeline);
  }

  function removeCaption(index: number) {
    const timeline = structuredClone(generated?.timeline) as
      | EditableTimeline
      | undefined;
    const textTrack = timeline?.tracks.find((track) => track.kind === 'text');
    if (!timeline || !textTrack?.overlays) return;
    textTrack.overlays.splice(index, 1);
    if (textTrack.overlays.length === 0) {
      timeline.tracks = timeline.tracks.filter((track) => track !== textTrack);
    }
    commitTimeline(timeline);
  }

  async function handleImportCustomLut() {
    try {
      const filePath = await window.reelforge.importLutDialog();
      if (!filePath) return;
      const imported = await window.reelforge.importLut({
        source_path: filePath,
      });
      const updated = await window.reelforge.listLuts();
      setLuts(updated);
      setFeedbackNotice(`Imported 3D LUT "${imported.name}" successfully.`);
      return imported;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to import .cube LUT file.',
      );
    }
  }

  function changeClipLut(
    clipId: string,
    lutPath: string | null,
    lutName: string | null,
  ) {
    const timeline = structuredClone(generated?.timeline) as
      | EditableTimeline
      | undefined;
    const clip = timeline?.tracks
      .flatMap((t) => t.clips)
      .find((c) => c.id === clipId);
    if (!timeline || !clip) return;
    clip.color ??= { exposure: 0, contrast: 0, saturation: 0, temperature: 0 };
    clip.color.lut_path = lutPath;
    clip.color.lut_name = lutName;
    commitTimeline(timeline);
  }

  function applyLutToAllClips(lutPath: string | null, lutName: string | null) {
    const timeline = structuredClone(generated?.timeline) as
      | EditableTimeline
      | undefined;
    if (!timeline) return;
    for (const track of timeline.tracks) {
      for (const clip of track.clips) {
        clip.color ??= {
          exposure: 0,
          contrast: 0,
          saturation: 0,
          temperature: 0,
        };
        clip.color.lut_path = lutPath;
        clip.color.lut_name = lutName;
      }
    }
    commitTimeline(timeline);
    setFeedbackNotice(
      lutName
        ? `Applied 3D LUT "${lutName}" to all clips.`
        : 'Cleared 3D LUT on all clips.',
    );
  }

  async function handleSelectBgm() {
    const filePath = await window.reelforge.selectAudioFileDialog();
    if (!filePath) return;
    const timeline = structuredClone(generated?.timeline) as
      | EditableTimeline
      | undefined;
    if (!timeline) return;
    timeline.background_music = {
      media_path: filePath,
      media_id: null,
      volume_db: -10,
      fade_in_seconds: 1.0,
      fade_out_seconds: 1.5,
      ducking_enabled: true,
      ducking_attenuation_db: -12,
      loop: true,
    };
    commitTimeline(timeline);
    setFeedbackNotice('Background music track added with auto-ducking.');
  }

  function handleRemoveBgm() {
    const timeline = structuredClone(generated?.timeline) as
      | EditableTimeline
      | undefined;
    if (!timeline) return;
    timeline.background_music = null;
    commitTimeline(timeline);
    setFeedbackNotice('Removed background music track.');
  }

  function changeBgmField(field: string, value: unknown) {
    const timeline = structuredClone(generated?.timeline) as
      | EditableTimeline
      | undefined;
    if (!timeline || !timeline.background_music) return;
    (timeline.background_music as Record<string, unknown>)[field] = value;
    commitTimeline(timeline);
  }

  async function handleSelectVoiceover() {
    const filePath = await window.reelforge.selectAudioFileDialog();
    if (!filePath) return;
    const timeline = structuredClone(generated?.timeline) as
      | EditableTimeline
      | undefined;
    if (!timeline) return;
    timeline.voiceover = {
      media_path: filePath,
      media_id: null,
      volume_db: 0,
      start_time_seconds: 0,
    };
    commitTimeline(timeline);
    setFeedbackNotice('Voiceover audio track added.');
  }

  function handleRemoveVoiceover() {
    const timeline = structuredClone(generated?.timeline) as
      | EditableTimeline
      | undefined;
    if (!timeline) return;
    timeline.voiceover = null;
    commitTimeline(timeline);
    setFeedbackNotice('Removed voiceover audio track.');
  }

  function changeVoiceoverField(field: string, value: unknown) {
    const timeline = structuredClone(generated?.timeline) as
      | EditableTimeline
      | undefined;
    if (!timeline || !timeline.voiceover) return;
    (timeline.voiceover as Record<string, unknown>)[field] = value;
    commitTimeline(timeline);
  }

  async function handleSnapToBeats() {
    if (!generated?.timeline) return;
    setBusySnapBeats(true);
    setError(null);
    try {
      const result = await window.reelforge.snapTimelineToBeats({
        timeline: generated.timeline,
        tempoBpm,
        maxDriftSeconds: 0.25,
      });
      commitTimeline(result.timeline as EditableTimeline);
      setSyncScoreReport(result.sync_report);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not snap cuts to beats',
      );
    } finally {
      setBusySnapBeats(false);
    }
  }

  async function handleAutoGenerateCaptions() {
    if (!activeProjectId) return;
    setBusyAutoCaptions(true);
    setError(null);
    try {
      const result = await window.reelforge.autoGenerateCaptions({
        projectId: activeProjectId,
        timeline: generated?.timeline,
      });
      if (result.captions.length === 0) {
        setCaptionNotification(
          'No spoken dialogue or embedded subtitle streams detected in footage.',
        );
        setTimeout(() => setCaptionNotification(null), 4000);
        return;
      }
      const timeline = structuredClone(generated?.timeline) as
        | EditableTimeline
        | undefined;
      if (!timeline) return;
      let textTrack = timeline.tracks.find((track) => track.kind === 'text');
      if (!textTrack) {
        textTrack = {
          id: `text-${Date.now()}`,
          kind: 'text',
          clips: [],
          overlays: [],
        };
        timeline.tracks.push(textTrack);
      }
      textTrack.overlays ??= [];
      textTrack.overlays.push(...result.captions);
      commitTimeline(timeline);
      setCaptionNotification(
        `Generated ${result.captions.length} timed captions via ${result.source}`,
      );
      setTimeout(() => setCaptionNotification(null), 4000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to auto-generate captions',
      );
    } finally {
      setBusyAutoCaptions(false);
    }
  }

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

      <section
        className={`rounded-lg border bg-neutral-950 p-5 transition ${
          isDraggingSource
            ? 'border-orange-500 bg-orange-500/10'
            : 'border-white/10'
        }`}
        onDragOver={handleSourceDragOver}
        onDragLeave={handleSourceDragLeave}
        onDrop={(e) => void handleSourceDrop(e)}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-medium text-neutral-200">
              1. Source footage ({videoMedia.length} videos)
            </h3>
            {mediaDir && (
              <p
                className="mt-0.5 truncate text-[11px] text-neutral-500 font-mono"
                title={mediaDir}
              >
                Folder: {mediaDir}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {mediaDir && (
              <button
                type="button"
                onClick={() => window.reelforge.openFolderInShell(mediaDir)}
                className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-neutral-300 hover:bg-white/10"
                title="Open source media folder in Windows Explorer"
              >
                <FolderOpen size={13} /> Open folder
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleImportSourceFolder()}
              disabled={busy === 'importing'}
              className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-neutral-200 hover:bg-white/10 disabled:opacity-50"
              title="Add an entire folder of footage recursively"
            >
              <FolderPlus size={13} /> Add folder
            </button>
            <button
              type="button"
              onClick={() => void handleImportSourceFiles()}
              disabled={busy === 'importing'}
              className="flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-1 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50"
              title="Choose video files to import into this project"
            >
              <Upload size={13} />{' '}
              {busy === 'importing' ? 'Adding…' : 'Add videos'}
            </button>
          </div>
        </div>

        {isDraggingSource ? (
          <div className="flex h-24 items-center justify-center rounded-lg border-2 border-dashed border-orange-500 bg-orange-500/10 text-xs font-medium text-orange-300">
            Drop video files or folders here to import into project
          </div>
        ) : videoMedia.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
            <Film size={24} className="text-neutral-600 mb-1" />
            <p className="text-xs text-neutral-400">
              No source footage in this project yet.
            </p>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              Click <strong>Add videos</strong> or drop video files directly
              into this area.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6 mt-2 max-h-48 overflow-y-auto pr-1">
            {videoMedia.map((asset) => (
              <div
                key={asset.id}
                className="group relative flex flex-col justify-between rounded-md border border-white/5 bg-neutral-900 p-2 hover:border-white/20"
              >
                <div className="relative aspect-video w-full overflow-hidden rounded bg-black/40 flex items-center justify-center">
                  {asset.thumbnail_path ? (
                    <img
                      src={`file://${asset.thumbnail_path}`}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Film size={16} className="text-neutral-600" />
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      window.reelforge.revealInShell(asset.storage_path)
                    }
                    className="absolute right-1 top-1 rounded bg-black/80 p-1 text-white/80 opacity-0 transition group-hover:opacity-100 hover:text-white"
                    title="Reveal file in File Explorer"
                  >
                    <ExternalLink size={11} />
                  </button>
                </div>
                <div
                  className="mt-1 truncate text-[11px] font-medium text-neutral-300"
                  title={asset.storage_path.split(/[\\/]/).pop()}
                >
                  {asset.storage_path.split(/[\\/]/).pop()}
                </div>
                <div className="flex items-center justify-between text-[10px] text-neutral-500 mt-0.5">
                  <span>
                    {asset.duration_seconds
                      ? `${asset.duration_seconds.toFixed(1)}s`
                      : '—'}
                  </span>
                  {asset.width && asset.height && (
                    <span>
                      {asset.width}×{asset.height}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
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
              onChange={(e) => setTargetDuration(e.target.value)}
              placeholder="From brief"
              className="w-20 rounded-md border border-white/10 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
            />
            sec
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-400">
            Export preset
            <select
              value={exportPreset}
              onChange={(event) =>
                updateExportSettings(
                  event.target.value as ExportPreset,
                  exportFps,
                  exportCrf,
                )
              }
              className="rounded-md border border-white/10 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
            >
              <option value="vertical_1080">
                9:16 Vertical HD (1080 × 1920)
              </option>
              <option value="vertical_720">
                9:16 Vertical Fast (720 × 1280)
              </option>
              <option value="portrait_4_5">
                4:5 Portrait Feed (1080 × 1350)
              </option>
              <option value="horizontal">
                16:9 Landscape HD (1920 × 1080)
              </option>
              <option value="square">1:1 Square Feed (1080 × 1080)</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-400">
            Frame rate
            <select
              value={exportFps}
              onChange={(event) =>
                updateExportSettings(
                  exportPreset,
                  Number(event.target.value),
                  exportCrf,
                )
              }
              className="rounded-md border border-white/10 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
            >
              <option value={24}>24 fps (Cinematic)</option>
              <option value={30}>30 fps (Standard)</option>
              <option value={60}>60 fps (Smooth)</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-400">
            Quality
            <select
              value={exportCrf}
              onChange={(event) =>
                updateExportSettings(
                  exportPreset,
                  exportFps,
                  Number(event.target.value),
                )
              }
              className="rounded-md border border-white/10 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
            >
              <option value={18}>Production (CRF 18)</option>
              <option value={20}>Balanced (CRF 20)</option>
              <option value={24}>Compact (CRF 24)</option>
            </select>
          </label>
          {adapters.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-neutral-400">
              AI assistant
              <select
                value={selectedAdapterId}
                onChange={(event) => setSelectedAdapterId(event.target.value)}
                className="rounded-md border border-white/10 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
              >
                {adapters.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}{' '}
                    {!a.available && a.id !== 'rule_based'
                      ? '(Unavailable)'
                      : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="w-full text-sm text-neutral-400">
            Editing brief
            <input
              value={editingBrief}
              onChange={(event) => setEditingBrief(event.target.value)}
              placeholder="e.g. 30 seconds, vertical, fast cuts, keep original colors"
              className="mt-1 w-full rounded-md border border-white/10 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500"
            />
          </label>
          <div className="flex w-full items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={
                  busy === 'generating' ||
                  media.filter((asset) => asset.kind === 'video').length === 0
                }
                className="flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50"
              >
                <Wand2 size={14} /> Generate timeline
              </button>
              <button
                type="button"
                onClick={() => void handleFetchAlternatives()}
                disabled={loadingAlternatives || !editingBrief.trim()}
                className="flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-white/5 disabled:opacity-40"
              >
                {loadingAlternatives
                  ? 'Generating options…'
                  : 'Generate 3 alternative edits'}
              </button>
            </div>
          </div>
          {alternatives.length > 0 && (
            <div className="flex w-full flex-col gap-2 rounded-md border border-white/10 bg-neutral-900/60 p-3">
              <div className="text-xs font-semibold text-neutral-300">
                Alternative Edit Proposals
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {alternatives.map((alt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      if (alt.shot_duration_seconds)
                        setTargetDuration(
                          String(alt.target_duration_seconds || targetDuration),
                        );
                      setEditingBrief(
                        `${editingBrief} · ${alt.name.toLowerCase()} (${alt.shot_duration_seconds}s pacing)`,
                      );
                      void handleGenerate();
                    }}
                    className="flex flex-col items-start rounded border border-white/10 bg-neutral-900 p-2 text-left hover:border-orange-500/50"
                  >
                    <span className="text-xs font-medium text-orange-400">
                      {alt.name}
                    </span>
                    <span className="mt-1 text-[11px] text-neutral-400">
                      {alt.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {generated && (
        <section className="rounded-lg border border-white/10 bg-neutral-950 p-5">
          {generated.planning && !generated.planning.duration_fulfilled && (
            <p className="mb-3 rounded-md border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-200">
              The selected source footage provides{' '}
              {generated.planning.actual_duration_seconds.toFixed(1)} seconds of
              distinct usable ranges, short of the requested{' '}
              {generated.planning.requested_duration_seconds?.toFixed(1)}{' '}
              seconds. Add more footage or choose a shorter target; the
              suggestion does not repeat source ranges.
            </p>
          )}
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-neutral-200">
              3. Timeline ({clips.length} clips)
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={undoTimelineEdit}
                disabled={!historyState.canUndo}
                className="flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs text-neutral-300 hover:bg-white/5 disabled:opacity-40"
                aria-label="Undo timeline edit"
              >
                <Undo2 size={13} /> Undo
              </button>
              <button
                type="button"
                onClick={redoTimelineEdit}
                disabled={!historyState.canRedo}
                className="flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs text-neutral-300 hover:bg-white/5 disabled:opacity-40"
                aria-label="Redo timeline edit"
              >
                <Redo2 size={13} /> Redo
              </button>
            </div>
          </div>
          {previewClip && previewAsset && previewUrl && (
            <div className="mb-3 max-w-xl">
              <p className="mb-1 text-xs text-neutral-500">
                Export frame preview · {outputWidth} × {outputHeight} · clip 1
                at {previewClip.source_in_seconds.toFixed(2)}s
              </p>
              <div
                className="relative w-full max-w-md overflow-hidden rounded-md bg-black"
                style={{ aspectRatio: `${outputWidth} / ${outputHeight}` }}
              >
                <video
                  key={`${previewAsset.id}:${previewClip.source_in_seconds}:${outputWidth}:${outputHeight}`}
                  controls
                  muted
                  preload="metadata"
                  src={`${previewUrl}#t=${previewClip.source_in_seconds}`}
                  className="absolute inset-0 h-full w-full bg-black object-cover"
                  style={{
                    objectPosition: `${(previewClip.reframe_x ?? 0.5) * 100}% ${(previewClip.reframe_y ?? 0.5) * 100}%`,
                  }}
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-[10%] border border-dashed border-cyan-200/70"
                />
                <p
                  className="pointer-events-none absolute left-[8%] right-[8%] text-center font-semibold text-white [text-shadow:0_2px_4px_#000,0_0_2px_#000]"
                  style={{
                    fontSize: 'clamp(12px, 5.56cqh, 32px)',
                    ...(captionPreviewPosition === 'top'
                      ? { top: '10%' }
                      : captionPreviewPosition === 'bottom'
                        ? { bottom: '10%' }
                        : { top: '50%', transform: 'translateY(-50%)' }),
                  }}
                >
                  {captionPreviewText}
                </p>
              </div>
              <p className="mt-1 text-[11px] text-neutral-500">
                Dashed guide marks the 10% safe area. Preview shows the draft
                caption or first saved caption at its export position.
              </p>
            </div>
          )}
          <div className="mb-3 rounded-md border border-white/10 bg-white/[0.02] p-3">
            <h4 className="mb-2 text-xs font-medium text-neutral-300">
              Captions
            </h4>
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-48 flex-1 text-[11px] text-neutral-500">
                Caption text
                <input
                  value={captionText}
                  maxLength={300}
                  onChange={(event) => setCaptionText(event.target.value)}
                  placeholder="Add a caption"
                  className="mt-1 w-full rounded border border-white/10 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-200"
                />
              </label>
              <label className="text-[11px] text-neutral-500">
                Start (s)
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={captionStart}
                  onChange={(event) => setCaptionStart(event.target.value)}
                  className="mt-1 block w-20 rounded border border-white/10 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-200"
                />
              </label>
              <label className="text-[11px] text-neutral-500">
                End (s)
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={captionEnd}
                  onChange={(event) => setCaptionEnd(event.target.value)}
                  className="mt-1 block w-20 rounded border border-white/10 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-200"
                />
              </label>
              <label className="text-[11px] text-neutral-500">
                Position
                <select
                  value={captionPosition}
                  onChange={(event) =>
                    setCaptionPosition(
                      event.target.value as EditableTextOverlay['position'],
                    )
                  }
                  className="mt-1 block rounded border border-white/10 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-200"
                >
                  <option value="top">Top</option>
                  <option value="center">Center</option>
                  <option value="bottom">Bottom</option>
                </select>
              </label>
              <label className="text-[11px] text-neutral-500">
                Style Preset
                <select
                  value={captionStyle}
                  onChange={(event) =>
                    setCaptionStyle(
                      event.target.value as NonNullable<
                        EditableTextOverlay['style_preset']
                      >,
                    )
                  }
                  className="mt-1 block rounded border border-white/10 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-200"
                >
                  <option value="bold_yellow">
                    Reel / TikTok Bold (Yellow)
                  </option>
                  <option value="minimal_white">
                    Minimalist Modern (White)
                  </option>
                  <option value="cinematic_box">Cinematic Film (Box)</option>
                  <option value="neon_cyan">Neon Glow (Cyan)</option>
                  <option value="default">Classic Default</option>
                </select>
              </label>
              <label className="text-[11px] text-neutral-500">
                Animation
                <select
                  value={captionAnimation}
                  onChange={(event) =>
                    setCaptionAnimation(
                      event.target.value as NonNullable<
                        EditableTextOverlay['animation_preset']
                      >,
                    )
                  }
                  className="mt-1 block rounded border border-white/10 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-200"
                >
                  <option value="pop_in">Pop-in / Zoom</option>
                  <option value="slide_up">Slide Up</option>
                  <option value="fade">Smooth Fade</option>
                  <option value="none">None (Static)</option>
                </select>
              </label>
              <label className="text-[11px] text-neutral-500">
                Font Size (px)
                <input
                  type="number"
                  min="0"
                  max="120"
                  step="2"
                  value={captionFontSize || ''}
                  placeholder="Auto"
                  onChange={(event) =>
                    setCaptionFontSize(
                      Math.max(0, Number(event.target.value) || 0),
                    )
                  }
                  className="mt-1 block w-20 rounded border border-white/10 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-200"
                  title="Leave empty for auto font sizing based on frame dimensions"
                />
              </label>
              <button
                type="button"
                onClick={addCaption}
                disabled={!captionText.trim()}
                className="rounded bg-orange-500 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
              >
                Add caption
              </button>
              <button
                type="button"
                onClick={() => void handleAutoGenerateCaptions()}
                disabled={busyAutoCaptions}
                className="flex items-center gap-1.5 rounded border border-orange-500/30 bg-orange-950/20 px-3 py-1.5 text-xs text-orange-300 hover:bg-orange-500/10 disabled:opacity-50"
                title="Detect embedded subtitles or speech intervals across imported footage"
              >
                {busyAutoCaptions ? (
                  <RefreshCw size={12} className="animate-spin" />
                ) : (
                  <Wand2 size={12} />
                )}
                Auto-generate captions from audio
              </button>
            </div>
            {captionNotification && (
              <p className="mt-2 rounded border border-emerald-900/40 bg-emerald-950/40 px-2.5 py-1.5 text-xs text-emerald-400">
                {captionNotification}
              </p>
            )}
            {captions.map((overlay, index) => (
              <div
                key={`${overlay.start_seconds}-${index}`}
                className="mt-2 flex items-center justify-between gap-3 border-t border-white/5 pt-2 text-xs"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-neutral-300">
                  <span className="font-mono text-neutral-400">
                    {overlay.start_seconds.toFixed(1)}–
                    {overlay.end_seconds.toFixed(1)}s
                  </span>
                  <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-neutral-400">
                    {overlay.position}
                  </span>
                  {overlay.style_preset && (
                    <span className="rounded bg-orange-500/20 px-1.5 py-0.5 text-[10px] text-orange-300">
                      {overlay.style_preset}
                    </span>
                  )}
                  {overlay.animation_preset &&
                    overlay.animation_preset !== 'none' && (
                      <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] text-sky-300">
                        {overlay.animation_preset}
                      </span>
                    )}
                  {Boolean(overlay.font_size) && (
                    <span className="text-[10px] text-neutral-400">
                      {overlay.font_size}px
                    </span>
                  )}
                  <span className="truncate font-medium text-white">
                    {overlay.text}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeCaption(index)}
                  aria-label="Remove caption"
                  className="shrink-0 rounded p-1 text-red-300 hover:bg-red-500/10"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <p className="mt-2 text-[11px] text-neutral-600">
              Captions are burned into the original footage during export with
              chosen style and animated keyframes. They do not alter or generate
              scene content.
            </p>
          </div>

          {/* Multi-Track Audio Mixing (BGM & Voiceover with Auto-Ducking) */}
          <div className="mb-3 rounded-md border border-white/10 bg-white/[0.02] p-3">
            <div className="flex items-center justify-between">
              <h4 className="flex items-center gap-1.5 text-xs font-medium text-neutral-300">
                <Music size={13} className="text-orange-400" />
                Multi-Track Audio Mixing & Ducking
              </h4>
              <span className="text-[11px] text-neutral-500">
                Voiceover + Background Music with smart sidechain compression
              </span>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              {/* Background Music Card */}
              <div className="rounded border border-white/5 bg-neutral-900/60 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-neutral-200">
                    Background Music (BGM)
                  </span>
                  {timelineBgm?.media_path ? (
                    <button
                      type="button"
                      onClick={handleRemoveBgm}
                      className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300"
                    >
                      <Trash2 size={11} /> Remove
                    </button>
                  ) : null}
                </div>

                {!timelineBgm?.media_path ? (
                  <div className="mt-2.5 flex flex-col items-start gap-2">
                    <p className="text-[11px] text-neutral-400">
                      Add a background soundtrack with automatic audio ducking
                      during speech.
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleSelectBgm()}
                      className="rounded border border-white/10 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:border-orange-500/50 hover:text-white"
                    >
                      + Choose Music Audio File (.mp3, .wav, .m4a)
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-col gap-2.5 text-xs">
                    <div className="flex items-center justify-between rounded bg-neutral-950 px-2 py-1 text-[11px] text-neutral-300">
                      <span
                        className="max-w-[220px] truncate"
                        title={timelineBgm.media_path}
                      >
                        🎵 {timelineBgm.media_path.split(/[\\/]/).pop()}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleSelectBgm()}
                        className="text-[10px] text-neutral-400 hover:text-white"
                      >
                        Change
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <label className="text-neutral-400">
                        Volume: {timelineBgm.volume_db ?? -10} dB
                        <input
                          type="range"
                          min="-30"
                          max="6"
                          step="1"
                          value={timelineBgm.volume_db ?? -10}
                          onChange={(e) =>
                            changeBgmField('volume_db', Number(e.target.value))
                          }
                          className="mt-1 block w-full accent-orange-500"
                        />
                      </label>
                      <label className="flex items-center gap-2 pt-3 text-neutral-300">
                        <input
                          type="checkbox"
                          checked={timelineBgm.loop ?? true}
                          onChange={(e) =>
                            changeBgmField('loop', e.target.checked)
                          }
                          className="accent-orange-500"
                        />
                        Loop to video length
                      </label>
                    </div>

                    {/* Auto-Ducking controls */}
                    <div className="rounded border border-orange-500/20 bg-orange-950/15 p-2 text-[11px]">
                      <label className="flex items-center gap-2 font-medium text-orange-200">
                        <input
                          type="checkbox"
                          checked={timelineBgm.ducking_enabled ?? true}
                          onChange={(e) =>
                            changeBgmField('ducking_enabled', e.target.checked)
                          }
                          className="accent-orange-500"
                        />
                        Auto-Duck music during voice / speech
                      </label>
                      {timelineBgm.ducking_enabled !== false && (
                        <label className="mt-2 block text-neutral-400">
                          Attenuation:{' '}
                          {timelineBgm.ducking_attenuation_db ?? -12} dB
                          <input
                            type="range"
                            min="-24"
                            max="-3"
                            step="1"
                            value={timelineBgm.ducking_attenuation_db ?? -12}
                            onChange={(e) =>
                              changeBgmField(
                                'ducking_attenuation_db',
                                Number(e.target.value),
                              )
                            }
                            className="mt-1 block w-full accent-orange-500"
                          />
                        </label>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Voiceover Card */}
              <div className="rounded border border-white/5 bg-neutral-900/60 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-neutral-200">
                    Voiceover / Narration Track
                  </span>
                  {timelineVo?.media_path ? (
                    <button
                      type="button"
                      onClick={handleRemoveVoiceover}
                      className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300"
                    >
                      <Trash2 size={11} /> Remove
                    </button>
                  ) : null}
                </div>

                {!timelineVo?.media_path ? (
                  <div className="mt-2.5 flex flex-col items-start gap-2">
                    <p className="text-[11px] text-neutral-400">
                      Add a separate voiceover or commentary track overlaid on
                      top of clips.
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleSelectVoiceover()}
                      className="rounded border border-white/10 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:border-orange-500/50 hover:text-white"
                    >
                      + Choose Voiceover File (.mp3, .wav, .m4a)
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-col gap-2.5 text-xs">
                    <div className="flex items-center justify-between rounded bg-neutral-950 px-2 py-1 text-[11px] text-neutral-300">
                      <span
                        className="max-w-[220px] truncate"
                        title={timelineVo.media_path}
                      >
                        🎙️ {timelineVo.media_path.split(/[\\/]/).pop()}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleSelectVoiceover()}
                        className="text-[10px] text-neutral-400 hover:text-white"
                      >
                        Change
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <label className="text-neutral-400">
                        Volume: {timelineVo.volume_db ?? 0} dB
                        <input
                          type="range"
                          min="-20"
                          max="12"
                          step="1"
                          value={timelineVo.volume_db ?? 0}
                          onChange={(e) =>
                            changeVoiceoverField(
                              'volume_db',
                              Number(e.target.value),
                            )
                          }
                          className="mt-1 block w-full accent-orange-500"
                        />
                      </label>
                      <label className="text-neutral-400">
                        Start delay:{' '}
                        {(timelineVo.start_time_seconds ?? 0).toFixed(1)}s
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={timelineVo.start_time_seconds ?? 0}
                          onChange={(e) =>
                            changeVoiceoverField(
                              'start_time_seconds',
                              Math.max(0, Number(e.target.value) || 0),
                            )
                          }
                          className="mt-1 block w-full rounded border border-white/10 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-2">
            <span className="text-xs text-neutral-400">
              {clips.length} clips ·{' '}
              {clips
                .reduce(
                  (sum: number, c: any) =>
                    sum +
                    (c.source_out_seconds - c.source_in_seconds) /
                      (c.playback_speed || 1),
                  0,
                )
                .toFixed(1)}
              s total duration
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-neutral-500">Music sync:</span>
              <input
                type="number"
                min="60"
                max="200"
                step="1"
                value={tempoBpm}
                onChange={(e) => setTempoBpm(Number(e.target.value) || 120)}
                className="w-16 rounded border border-white/10 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
                title="Target Beats Per Minute"
              />
              <span className="text-[11px] text-neutral-500">BPM</span>
              <button
                type="button"
                onClick={() => void handleSnapToBeats()}
                disabled={clips.length < 2 || busySnapBeats}
                className="flex items-center gap-1 rounded border border-sky-500/30 bg-sky-950/20 px-2.5 py-1 text-xs text-sky-300 hover:bg-sky-500/10 disabled:opacity-40"
                title="Snap cut boundaries within 0.25s of musical beats"
              >
                <Music size={12} /> Snap cuts to beats
              </button>
              {syncScoreReport && (
                <span
                  className="rounded border border-sky-800/60 bg-sky-950 px-2 py-0.5 text-[11px] font-medium text-sky-300"
                  title={`Mean drift: ${(syncScoreReport.mean_drift_seconds * 1000).toFixed(0)}ms`}
                >
                  {Math.round(syncScoreReport.sync_score * 100)}% on-beat (
                  {syncScoreReport.aligned_cut_count}/
                  {syncScoreReport.total_cut_count})
                </span>
              )}
            </div>
          </div>
          <ol className="flex flex-col gap-1 text-xs text-neutral-400">
            {clips.map((clip: any, i: number) => (
              <li
                key={clip.id ?? i}
                className="flex flex-col gap-2 rounded bg-white/5 px-3 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-neutral-200">
                    Clip {i + 1} ·{' '}
                    {media
                      .find((asset) => asset.id === clip.source_media_id)
                      ?.original_path.split(/[\\/]/)
                      .pop() ?? 'Source video'}
                    {clip.selection_reason ? ` · ${clip.selection_reason}` : ''}
                    {typeof clip.quality_score === 'number'
                      ? ` · score ${clip.quality_score.toFixed(2)}`
                      : ''}
                  </span>
                  <span>
                    Timeline {clip.timeline_position_seconds?.toFixed(2)}s ·{' '}
                    {(clip.source_out_seconds - clip.source_in_seconds).toFixed(
                      2,
                    )}
                    s source
                  </span>
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      title="Prefer this source in future edit suggestions"
                      aria-label={`Prefer source for clip ${i + 1}`}
                      onClick={() =>
                        sendClipSelectionFeedback(clip, 'accepted')
                      }
                      className="rounded p-1 text-neutral-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                    >
                      <ThumbsUp size={13} />
                    </button>
                    <button
                      type="button"
                      title="Avoid this source in future edit suggestions"
                      aria-label={`Avoid source for clip ${i + 1}`}
                      onClick={() =>
                        sendClipSelectionFeedback(clip, 'rejected')
                      }
                      className="rounded p-1 text-neutral-400 hover:bg-red-500/10 hover:text-red-300"
                    >
                      <ThumbsDown size={13} />
                    </button>
                    <button
                      type="button"
                      title="Save this grade as a preference for this source"
                      aria-label={`Save color preference for clip ${i + 1}`}
                      onClick={() => saveColorPreference(clip)}
                      className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-neutral-400 hover:bg-orange-500/10 hover:text-orange-300"
                    >
                      <Palette size={13} /> Save grade
                    </button>
                    <button
                      type="button"
                      title="Apply this clip's color grade to all clips in the timeline"
                      aria-label={`Apply color grade to all clips from clip ${i + 1}`}
                      onClick={() =>
                        applyColorToAllClips(
                          clip.color ?? {
                            exposure: 0,
                            contrast: 0,
                            saturation: 0,
                            temperature: 0,
                          },
                        )
                      }
                      className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-neutral-400 hover:bg-cyan-500/10 hover:text-cyan-300"
                    >
                      <Copy size={13} /> Grade to all
                    </button>
                  </span>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-[11px] text-neutral-500">
                    Source in
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={clip.source_in_seconds}
                      onChange={(event) =>
                        changeClip(
                          clip.id,
                          'source_in_seconds',
                          Number(event.target.value),
                        )
                      }
                      className="ml-1 w-20 rounded border border-white/10 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
                    />
                  </label>
                  <label className="text-[11px] text-neutral-500">
                    Source out
                    <input
                      type="number"
                      min={clip.source_in_seconds + 0.1}
                      step="0.1"
                      value={clip.source_out_seconds}
                      onChange={(event) =>
                        changeClip(
                          clip.id,
                          'source_out_seconds',
                          Number(event.target.value),
                        )
                      }
                      className="ml-1 w-20 rounded border border-white/10 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
                    />
                  </label>
                  <label className="text-[11px] text-neutral-500">
                    Speed
                    <select
                      value={clip.playback_speed}
                      onChange={(event) =>
                        changeClip(
                          clip.id,
                          'playback_speed',
                          Number(event.target.value),
                        )
                      }
                      className="ml-1 rounded border border-white/10 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
                    >
                      {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                        <option key={speed} value={speed}>
                          {speed}×
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-[11px] text-neutral-500">
                    Transition in
                    <select
                      value={clip.transition_in ?? 'cut'}
                      onChange={(event) =>
                        changeClipTransition(
                          clip.id,
                          event.target.value as NonNullable<
                            EditableClip['transition_in']
                          >,
                        )
                      }
                      className="ml-1 rounded border border-white/10 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
                    >
                      <option value="cut">Cut</option>
                      <option value="fade">Fade</option>
                      <option value="crossfade" disabled={i === 0}>
                        Crossfade
                      </option>
                      <option value="wipeleft" disabled={i === 0}>
                        Wipe Left
                      </option>
                      <option value="wiperight" disabled={i === 0}>
                        Wipe Right
                      </option>
                      <option value="slideup" disabled={i === 0}>
                        Slide Up
                      </option>
                      <option value="slidedown" disabled={i === 0}>
                        Slide Down
                      </option>
                      <option value="dissolve" disabled={i === 0}>
                        Dissolve
                      </option>
                      <option value="none">None</option>
                    </select>
                  </label>
                  {clip.transition_in !== 'none' &&
                    clip.transition_in !== 'cut' && (
                      <label className="text-[11px] text-neutral-500">
                        Transition length
                        <input
                          type="number"
                          min="0.1"
                          max="2"
                          step="0.1"
                          value={clip.transition_duration_seconds ?? 0.5}
                          onChange={(event) =>
                            changeClipTransitionDuration(
                              clip.id,
                              Number(event.target.value),
                            )
                          }
                          className="ml-1 w-16 rounded border border-white/10 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
                        />
                        sec
                      </label>
                    )}
                  <label
                    title="Conventional FFmpeg motion correction. Blank edges may be visible; no generated fill is used."
                    className="flex items-center gap-1.5 text-[11px] text-neutral-400"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(clip.stabilize)}
                      onChange={(event) =>
                        changeClipStabilization(clip.id, event.target.checked)
                      }
                      className="accent-orange-500"
                    />
                    Stabilize · blank edges
                  </label>
                  <button
                    type="button"
                    title="Move clip earlier"
                    disabled={i === 0}
                    onClick={() => moveClip(clip.id, -1)}
                    className="rounded p-1 text-neutral-400 hover:bg-white/10 disabled:opacity-30"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    title="Move clip later"
                    disabled={i === clips.length - 1}
                    onClick={() => moveClip(clip.id, 1)}
                    className="rounded p-1 text-neutral-400 hover:bg-white/10 disabled:opacity-30"
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    title="Remove clip"
                    onClick={() => removeClip(clip.id)}
                    className="rounded p-1 text-red-300 hover:bg-red-500/10"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 border-t border-white/5 pt-2 text-[11px]">
                  <span className="flex items-center gap-1 text-neutral-500">
                    <Sparkles size={11} /> Presets:
                  </span>
                  {COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() =>
                        applyColorPresetToClip(clip.id, preset.values)
                      }
                      className="rounded border border-white/10 bg-neutral-900 px-2 py-0.5 text-neutral-300 hover:border-orange-500/50 hover:text-white"
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-white/5 pt-2 text-[11px]">
                  <span className="flex items-center gap-1 font-medium text-neutral-400">
                    <Palette size={12} className="text-orange-400" /> 3D LUT
                    (.cube):
                  </span>
                  <select
                    value={clip.color?.lut_path ?? ''}
                    onChange={(event) => {
                      const selectedPath = event.target.value || null;
                      const matched = luts.find((l) => l.path === selectedPath);
                      changeClipLut(
                        clip.id,
                        selectedPath,
                        matched ? matched.name : null,
                      );
                    }}
                    className="rounded border border-white/10 bg-neutral-900 px-2 py-0.5 text-xs text-neutral-200"
                  >
                    <option value="">None (Standard EQ)</option>
                    {luts.map((l) => (
                      <option key={l.id} value={l.path}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void handleImportCustomLut()}
                    className="rounded border border-white/10 bg-neutral-900 px-2 py-0.5 text-[11px] text-orange-300 hover:bg-white/5 hover:text-orange-200"
                  >
                    + Import .cube
                  </button>
                  {clip.color?.lut_path && (
                    <button
                      type="button"
                      onClick={() =>
                        applyLutToAllClips(
                          clip.color!.lut_path!,
                          clip.color?.lut_name ?? null,
                        )
                      }
                      className="rounded border border-white/10 bg-neutral-900 px-2 py-0.5 text-[11px] text-neutral-400 hover:text-white"
                      title="Apply this LUT to all clips"
                    >
                      Apply LUT to all
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-white/5 pt-2 sm:grid-cols-3">
                  {(
                    [
                      ['exposure', 'Exposure', -1, 1, 0.05],
                      ['contrast', 'Contrast', -0.9, 1, 0.05],
                      ['saturation', 'Saturation', -1, 2, 0.05],
                      ['temperature', 'Warmth', -1, 1, 0.05],
                    ] as const
                  ).map(([field, label, min, max, step]) => (
                    <label key={field} className="text-[11px] text-neutral-500">
                      {label} {(clip.color?.[field] ?? 0).toFixed(2)}
                      <input
                        type="range"
                        min={min}
                        max={max}
                        step={step}
                        value={clip.color?.[field] ?? 0}
                        onChange={(event) =>
                          changeClipColor(
                            clip.id,
                            field,
                            Number(event.target.value),
                          )
                        }
                        className="mt-1 block w-full accent-orange-500"
                      />
                    </label>
                  ))}
                  {(
                    [
                      ['reframe_x', 'Horizontal crop'],
                      ['reframe_y', 'Vertical crop'],
                    ] as const
                  ).map(([field, label]) => (
                    <label key={field} className="text-[11px] text-neutral-500">
                      {label} {(clip[field] ?? 0.5).toFixed(2)}
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={clip[field] ?? 0.5}
                        onChange={(event) =>
                          changeClip(clip.id, field, Number(event.target.value))
                        }
                        className="mt-1 block w-full accent-orange-500"
                      />
                    </label>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-4 border-t border-white/5 pt-2 text-[11px]">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleClipMute(clip.id)}
                      className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                        (clip.audio?.gain_db ?? 0) <= -40
                          ? 'border border-red-500/40 bg-red-950/40 text-red-400'
                          : 'border border-white/10 bg-neutral-900 text-neutral-300 hover:bg-white/5'
                      }`}
                      title={
                        (clip.audio?.gain_db ?? 0) <= -40
                          ? 'Unmute clip'
                          : 'Mute clip'
                      }
                    >
                      {(clip.audio?.gain_db ?? 0) <= -40 ? (
                        <>
                          <VolumeX size={13} /> Muted
                        </>
                      ) : (
                        <>
                          <Volume2 size={13} /> Audio
                        </>
                      )}
                    </button>
                  </div>
                  <label className="flex items-center gap-2 text-neutral-500">
                    <span>
                      Gain:{' '}
                      {(clip.audio?.gain_db ?? 0) <= -40
                        ? 'Muted'
                        : `${(clip.audio?.gain_db ?? 0) >= 0 ? '+' : ''}${(clip.audio?.gain_db ?? 0).toFixed(1)} dB`}
                    </span>
                    <input
                      type="range"
                      min="-24"
                      max="12"
                      step="0.5"
                      disabled={(clip.audio?.gain_db ?? 0) <= -40}
                      value={
                        (clip.audio?.gain_db ?? 0) <= -40
                          ? -24
                          : (clip.audio?.gain_db ?? 0)
                      }
                      onChange={(event) =>
                        changeClipAudio(
                          clip.id,
                          'gain_db',
                          Number(event.target.value),
                        )
                      }
                      className="w-24 accent-orange-500 disabled:opacity-30"
                    />
                  </label>
                  <label className="flex items-center gap-1.5 text-neutral-500">
                    <span>Fade in:</span>
                    <input
                      type="number"
                      min="0"
                      max="2"
                      step="0.1"
                      value={clip.audio?.fade_in_seconds ?? 0}
                      onChange={(event) =>
                        changeClipAudio(
                          clip.id,
                          'fade_in_seconds',
                          Number(event.target.value),
                        )
                      }
                      className="w-16 rounded border border-white/10 bg-neutral-900 px-2 py-0.5 text-xs text-neutral-200"
                    />
                    <span>s</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-neutral-500">
                    <span>Fade out:</span>
                    <input
                      type="number"
                      min="0"
                      max="2"
                      step="0.1"
                      value={clip.audio?.fade_out_seconds ?? 0}
                      onChange={(event) =>
                        changeClipAudio(
                          clip.id,
                          'fade_out_seconds',
                          Number(event.target.value),
                        )
                      }
                      className="w-16 rounded border border-white/10 bg-neutral-900 px-2 py-0.5 text-xs text-neutral-200"
                    />
                    <span>s</span>
                  </label>
                </div>
              </li>
            ))}
          </ol>
          {generated.interpretation && (
            <div className="mt-2 space-y-1 text-xs text-neutral-500">
              <p>
                Understood:{' '}
                {generated.interpretation.recognized.length
                  ? generated.interpretation.recognized.join(' · ')
                  : 'No supported constraints found; default settings were used.'}
              </p>
              {!!generated.interpretation.not_yet_supported?.length && (
                <p className="text-amber-300">
                  Not applied yet:{' '}
                  {generated.interpretation.not_yet_supported.join(' · ')}
                </p>
              )}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
            <span className="mr-1 text-xs text-neutral-500">
              Improve the next suggestion:
            </span>
            <button
              type="button"
              onClick={() => void sendPacingFeedback('too_fast')}
              className="flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-neutral-300 hover:bg-white/5"
            >
              <ThumbsDown size={13} /> Cuts too fast
            </button>
            <button
              type="button"
              onClick={() => void sendPacingFeedback('too_slow')}
              className="flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-neutral-300 hover:bg-white/5"
            >
              <ThumbsDown size={13} /> Cuts too slow
            </button>
            <button
              type="button"
              onClick={() => void sendPacingFeedback('accepted')}
              className="flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-neutral-300 hover:bg-white/5"
            >
              <ThumbsUp size={13} /> Keep this edit
            </button>
            {feedbackNotice && (
              <span className="text-xs text-emerald-400">{feedbackNotice}</span>
            )}
          </div>
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
            <button
              type="button"
              onClick={() => setShowVersionHistory((visible) => !visible)}
              className="flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/5"
            >
              <History size={14} /> History ({projectVersions.length})
            </button>
          </div>
          {showVersionHistory && (
            <div className="mt-4 rounded-md border border-white/10 bg-black/20 p-3">
              <h4 className="text-xs font-medium text-neutral-200">
                Saved project versions
              </h4>
              <p className="mt-1 text-[11px] text-neutral-500">
                Saving creates a persistent checkpoint. Restoring a version adds
                a new checkpoint and updates the active timeline.
              </p>
              {projectVersions.length === 0 ? (
                <p className="mt-2 text-xs text-neutral-500">
                  No saved versions yet.
                </p>
              ) : (
                <ol className="mt-2 flex flex-col gap-2">
                  {projectVersions.map((version) => (
                    <li
                      key={version.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded border border-white/5 px-2.5 py-2"
                    >
                      <div>
                        <p className="text-xs text-neutral-200">
                          Version {version.version_number}
                          {version.reason.startsWith('restore:')
                            ? ` · restored from ${version.reason.slice('restore:'.length)}`
                            : version.reason === 'created'
                              ? ' · project created'
                              : ' · saved'}
                        </p>
                        <p className="text-[11px] text-neutral-500">
                          {new Date(version.created_at).toLocaleString()}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleRestoreVersion(version)}
                        disabled={busy !== null}
                        className="rounded border border-white/10 px-2.5 py-1 text-xs text-neutral-300 hover:bg-white/5 disabled:opacity-50"
                      >
                        Restore
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </section>
      )}

      {renderJob && (
        <section className="rounded-lg border border-white/10 bg-neutral-950 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-neutral-200">
              4. Render status
            </h3>
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                renderJob.status === 'complete'
                  ? 'border border-emerald-800/60 bg-emerald-950 text-emerald-400'
                  : renderJob.status === 'running'
                    ? 'border border-amber-800/60 bg-amber-950 text-amber-300'
                    : renderJob.status === 'failed'
                      ? 'border border-red-800/60 bg-red-950 text-red-300'
                      : 'border border-white/10 bg-white/5 text-neutral-400'
              }`}
            >
              {renderJob.status.toUpperCase()}
              {renderJob.stage ? ` · ${renderJob.stage}` : ''}
            </span>
          </div>

          {['queued', 'running', 'complete'].includes(renderJob.status) && (
            <div className="mt-4 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-neutral-200">
                  {renderJob.status === 'complete'
                    ? '100%'
                    : `${Math.min(100, Math.max(0, Math.round((renderJob.progress ?? 0) * 100)))}%`}
                </span>
                {(() => {
                  const details = (
                    renderJob.validation_json as {
                      progress_details?: {
                        speed?: string;
                        fps?: number;
                        eta_seconds?: number;
                        frames?: number;
                      };
                    } | null
                  )?.progress_details;
                  if (renderJob.status === 'running' && details) {
                    const metrics = [
                      details.speed ? `Speed: ${details.speed}` : null,
                      details.fps ? `${details.fps} fps` : null,
                      details.frames ? `Frame ${details.frames}` : null,
                      details.eta_seconds !== undefined
                        ? `ETA: ${formatEta(details.eta_seconds)}`
                        : null,
                    ].filter(Boolean);
                    return (
                      <span className="text-neutral-400">
                        {metrics.join(' · ')}
                      </span>
                    );
                  }
                  if (renderJob.status === 'queued') {
                    return (
                      <span className="text-neutral-500">
                        Preparing encoder pipeline...
                      </span>
                    );
                  }
                  if (renderJob.status === 'complete') {
                    return (
                      <span className="flex items-center gap-1 text-emerald-400">
                        <CheckCircle2 size={13} /> Encoded and validated
                      </span>
                    );
                  }
                  return null;
                })()}
              </div>

              <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    renderJob.status === 'complete'
                      ? 'bg-emerald-500'
                      : 'bg-amber-400'
                  }`}
                  style={{
                    width: `${
                      renderJob.status === 'complete'
                        ? 100
                        : Math.min(
                            100,
                            Math.max(
                              0,
                              Math.round((renderJob.progress ?? 0) * 100),
                            ),
                          )
                    }%`,
                  }}
                />
              </div>
            </div>
          )}

          {['queued', 'running'].includes(renderJob.status) && (
            <div className="mt-3">
              <button
                type="button"
                onClick={handleCancelRender}
                className="rounded-md border border-red-400/30 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
              >
                Cancel render
              </button>
            </div>
          )}

          {renderJob.error_message && (
            <p className="mt-3 rounded border border-red-900/50 bg-red-950/40 p-2.5 text-sm text-red-400">
              {renderJob.error_message}
            </p>
          )}

          {renderJob.validation_json &&
            typeof renderJob.validation_json.quality_report === 'object' &&
            renderJob.validation_json.quality_report !== null && (
              <div className="mt-4 rounded-md border border-white/10 bg-black/20 p-3 text-xs text-neutral-400">
                <p className="font-medium text-neutral-200">
                  Export quality check
                </p>
                {(() => {
                  const report = renderJob.validation_json?.quality_report as {
                    available?: boolean;
                    max_volume_dbfs?: number | null;
                    integrated_loudness_lufs?: number | null;
                    true_peak_dbfs?: number | null;
                    black_segments?: Array<{
                      start_seconds: number;
                      end_seconds: number;
                    }>;
                    warnings?: string[];
                  };
                  return (
                    <>
                      {report.available ? (
                        <p className="mt-1">
                          Sustained black segments:{' '}
                          {report.black_segments?.length ?? 0} · sample peak:{' '}
                          {typeof report.max_volume_dbfs === 'number'
                            ? `${report.max_volume_dbfs.toFixed(1)} dBFS`
                            : 'no measurable audio peak'}
                          {typeof report.integrated_loudness_lufs === 'number'
                            ? ` · integrated ${report.integrated_loudness_lufs.toFixed(1)} LUFS`
                            : ''}
                          {typeof report.true_peak_dbfs === 'number'
                            ? ` · true peak ${report.true_peak_dbfs.toFixed(1)} dBFS`
                            : ''}
                        </p>
                      ) : (
                        <p className="mt-1">Quality scan unavailable.</p>
                      )}
                      {report.warnings?.map((warning) => (
                        <p key={warning} className="mt-1 text-amber-300">
                          {warning}
                        </p>
                      ))}
                      {!!report.black_segments?.length && (
                        <p className="mt-1">
                          Black intervals:{' '}
                          {report.black_segments
                            .slice(0, 5)
                            .map(
                              (segment) =>
                                `${segment.start_seconds.toFixed(1)}–${segment.end_seconds.toFixed(1)}s`,
                            )
                            .join(', ')}
                        </p>
                      )}
                      <p className="mt-1 text-neutral-500">
                        Checks flag possible issues for review; intentional
                        fades may also be detected.
                      </p>
                    </>
                  );
                })()}
              </div>
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
