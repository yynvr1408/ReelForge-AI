/**
 * Typed IPC contract shared between the main process (handlers), the
 * preload bridge, and the renderer. This is the complete allowlist of
 * operations the renderer may invoke — nothing outside this set is
 * reachable from the renderer.
 *
 * Mirrors the processing service's REST surface closely but is not
 * identical: the renderer never talks HTTP directly, and these types
 * describe the shape IPC actually carries across the bridge.
 */

export const IPC_CHANNELS = {
  serviceStatus: 'reelforge:service-status',
  projectCreate: 'reelforge:project-create',
  projectList: 'reelforge:project-list',
  projectGet: 'reelforge:project-get',
  projectUpdate: 'reelforge:project-update',
  projectDelete: 'reelforge:project-delete',
  projectVersions: 'reelforge:project-versions',
  projectVersionRestore: 'reelforge:project-version-restore',
  feedbackCreate: 'reelforge:feedback-create',
  feedbackList: 'reelforge:feedback-list',
  feedbackDelete: 'reelforge:feedback-delete',
  mediaImportDialog: 'reelforge:media-import-dialog',
  mediaRelinkDialog: 'reelforge:media-relink-dialog',
  mediaImport: 'reelforge:media-import',
  mediaImportBatch: 'reelforge:media-import-batch',
  mediaList: 'reelforge:media-list',
  mediaPage: 'reelforge:media-page',
  mediaRevalidate: 'reelforge:media-revalidate',
  mediaRelink: 'reelforge:media-relink',
  referenceImportDialog: 'reelforge:reference-import-dialog',
  referenceRelinkDialog: 'reelforge:reference-relink-dialog',
  referenceImport: 'reelforge:reference-import',
  referenceRelink: 'reelforge:reference-relink',
  referenceAnalyze: 'reelforge:reference-analyze',
  referenceAnalysisJobGet: 'reelforge:reference-analysis-job-get',
  referenceAnalysisJobCancel: 'reelforge:reference-analysis-job-cancel',
  referenceList: 'reelforge:reference-list',
  referenceSimilar: 'reelforge:reference-similar',
  referenceGet: 'reelforge:reference-get',
  referenceUpdate: 'reelforge:reference-update',
  referenceCollectionsList: 'reelforge:reference-collections-list',
  referenceCollectionCreate: 'reelforge:reference-collection-create',
  referenceCollectionUpdate: 'reelforge:reference-collection-update',
  referenceCollectionDelete: 'reelforge:reference-collection-delete',
  styleProfileCreate: 'reelforge:style-profile-create',
  styleProfileList: 'reelforge:style-profile-list',
  styleProfileUpdate: 'reelforge:style-profile-update',
  styleProfileImport: 'reelforge:style-profile-import',
  timelineGenerate: 'reelforge:timeline-generate',
  renderStart: 'reelforge:render-start',
  renderGet: 'reelforge:render-get',
  renderList: 'reelforge:render-list',
  renderCancel: 'reelforge:render-cancel',
  openPathInShell: 'reelforge:open-path-in-shell',
  openFolderInShell: 'reelforge:open-folder-in-shell',
  trainingInputReelsList: 'reelforge:training-input-reels-list',
  trainingInputReelsImportDialog:
    'reelforge:training-input-reels-import-dialog',
  trainingInputReelsImport: 'reelforge:training-input-reels-import',
  trainingInputReelsDelete: 'reelforge:training-input-reels-delete',
  trainingPacingModelStatus: 'reelforge:training-pacing-model-status',
  trainingPacingModelTrain: 'reelforge:training-pacing-model-train',
  trainingPacingRunActive: 'reelforge:training-pacing-run-active',
  trainingPacingRunGet: 'reelforge:training-pacing-run-get',
  trainingPacingRunCancel: 'reelforge:training-pacing-run-cancel',
  trainingPacingModelPromote: 'reelforge:training-pacing-model-promote',
  trainingPacingModelRollback: 'reelforge:training-pacing-model-rollback',
  modelManagerInfo: 'reelforge:model-manager-info',
  storageInfo: 'reelforge:storage-info',
  storageCacheClear: 'reelforge:storage-cache-clear',
  timelineAdapters: 'reelforge:timeline-adapters',
  timelineAlternatives: 'reelforge:timeline-alternatives',
  trainingDatasetManifest: 'reelforge:training-dataset-manifest',
  appVersion: 'reelforge:app-version',
  checkForUpdates: 'reelforge:check-for-updates',
  listReleases: 'reelforge:list-releases',
  installRelease: 'reelforge:install-release',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

export interface ServiceStatus {
  state: 'starting' | 'ready' | 'error' | 'stopped';
  message?: string;
}

export interface Project {
  id: string;
  name: string;
  schema_version: number;
  created_at: string;
  updated_at: string;
  output_settings: Record<string, unknown>;
  selected_style_profile_id: string | null;
  timeline_json: Record<string, unknown> | null;
  is_archived: boolean;
}

export interface ProjectVersion {
  id: string;
  project_id: string;
  version_number: number;
  snapshot_json: Record<string, unknown>;
  reason: string;
  created_at: string;
}

export interface EditingFeedback {
  id: string;
  project_id: string | null;
  style_profile_id: string | null;
  subject: string;
  action: string;
  payload_json: Record<string, unknown>;
  created_at: string;
}

export interface MediaAsset {
  id: string;
  project_id: string | null;
  kind: 'video' | 'image' | 'audio' | 'subtitle';
  original_path: string;
  storage_path: string;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  frame_rate: number | null;
  has_audio: boolean | null;
  thumbnail_path: string | null;
  status: string;
  created_at: string;
}

export interface MediaPage {
  items: MediaAsset[];
  total: number;
  limit: number;
  offset: number;
}

export interface MediaBatchImportResult {
  source_path: string;
  media: MediaAsset | null;
  error: string | null;
}

export interface ReferenceVideo {
  id: string;
  name: string;
  storage_path: string;
  file_missing: boolean;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  frame_rate: number | null;
  analysis_json: Record<string, unknown> | null;
  analysis_status: 'pending' | 'running' | 'complete' | 'failed' | 'cancelled';
  excluded_from_aggregation: boolean;
  tags_json: string[];
  collection_id: string | null;
  created_at: string;
}

export interface ReferenceAnalysisJob {
  id: string;
  reference_id: string;
  status: 'queued' | 'running' | 'complete' | 'failed' | 'cancelled';
  stage: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface SimilarReference {
  reference_id: string;
  name: string;
  similarity_score: number;
  shared_signals: string[];
  signal_differences: Record<string, number>;
}

export interface ReferenceCollection {
  id: string;
  name: string;
  created_at: string;
}

export interface StyleProfile {
  id: string;
  name: string;
  version: number;
  source_reference_ids: string[];
  profile_json: Record<string, unknown>;
  confidence: number;
  created_at: string;
  updated_at: string;
}

export interface StyleProfileExport extends StyleProfile {
  format: 'reelforge-style-profile';
  schema_version: 1;
}

export interface RenderJob {
  id: string;
  project_id: string;
  job_type: string;
  status: 'queued' | 'running' | 'complete' | 'failed' | 'cancelled';
  stage: string | null;
  progress: number | null;
  error_message: string | null;
  output_path: string | null;
  validation_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface TimelineGenerateResult {
  timeline: Record<string, unknown>;
  planning?: {
    requested_duration_seconds: number | null;
    actual_duration_seconds: number;
    duration_fulfilled: boolean;
    duration_shortfall_seconds: number;
    repeated_source_ranges: boolean;
  };
  interpretation?: {
    recognized: string[];
    not_yet_supported?: string[];
    [key: string]: unknown;
  };
  validation: {
    is_valid: boolean;
    issues: Array<{ severity: string; message: string }>;
  };
}

export interface ExportSettings {
  width: number;
  height: number;
  frame_rate: number;
  video_codec: string;
  audio_codec: string;
  container: 'mp4';
  crf: number;
}

export interface InputReel {
  filename: string;
  path: string;
  size_bytes: number;
  duration_seconds: number | null;
  modified_at: string;
}

export interface TrainedModelSummary {
  model_name: string;
  created_at: string;
  sample_count: number;
  training_count?: number;
  evaluation_training_count?: number;
  evaluation_count?: number;
  evaluation_accuracy: number;
  majority_baseline_accuracy: number;
  evaluation_balanced_accuracy?: number | null;
  majority_baseline_balanced_accuracy?: number | null;
  promotable: boolean;
  dataset_sha256: string;
}

export interface TrainingModelStatus {
  active: TrainedModelSummary | null;
  candidate: TrainedModelSummary | null;
  rollback_available: boolean;
}

export interface TrainingRun {
  id: string;
  status:
    | 'queued'
    | 'running'
    | 'cancel_requested'
    | 'cancelled'
    | 'failed'
    | 'complete';
  stage: string | null;
  progress: number;
  error_message: string | null;
  candidate: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ModelManagerInfo {
  models: Array<{
    id: string;
    name: string;
    status: string;
    integrity: string;
    sha256: string | null;
    size_bytes: number | null;
    license: string;
    runtime: string;
    compatibility: {
      architectures: string[];
      minimum_python: string;
      accelerator_required: boolean;
    };
    metrics: TrainedModelSummary | null;
    resource_policy: string;
  }>;
  candidate: TrainedModelSummary | null;
  rollback_available: boolean;
  hardware: {
    architecture: string;
    processor: string;
    logical_cpu_count: number | null;
    memory_bytes: number | null;
    accelerator: string;
  };
}

export interface StorageLocation {
  key: string;
  label: string;
  path: string;
}

export interface StorageInfo {
  locations: StorageLocation[];
  free_bytes: number;
  total_bytes: number;
}

export interface ClearCacheResult {
  reclaimed_bytes: number;
  files_removed: number;
  message: string;
}

export interface LLMAdapterInfo {
  id: string;
  name: string;
  available: boolean;
  is_default: boolean;
}

export interface TimelineAlternative {
  name: string;
  description: string;
  shot_duration_seconds: number;
  audio_priority?: string;
  avoid_shake_candidates?: boolean;
  [key: string]: unknown;
}

export interface DatasetManifest {
  id: string;
  task: string;
  version: number;
  created_at: string;
  total_samples: number;
  class_distribution: Record<string, number>;
  is_balanced: boolean;
  meets_training_threshold: boolean;
  validation_status: string;
  validation_message: string;
  checksum_sha256: string;
}

export interface AppVersionInfo {
  version: string;
  isPackaged: boolean;
}

export interface ReleaseAsset {
  name: string;
  browserDownloadUrl: string;
  sizeBytes: number;
  contentType: string;
}

export interface AppUpdateCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseName: string | null;
  releaseNotes: string | null;
  publishedAt: string | null;
  htmlUrl: string | null;
  installerUrl: string | null;
  assets: ReleaseAsset[];
  releasesRepo: string;
  error?: string;
}

export interface ReleaseInfo {
  version: string;
  tagName: string;
  name: string;
  publishedAt: string | null;
  releaseNotes: string;
  htmlUrl: string;
  installerUrl: string | null;
  installerName: string | null;
  installerSize: number | null;
  isCurrent: boolean;
  isNewer: boolean;
}

export interface InstallReleaseResult {
  success: boolean;
  message: string;
}
