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
  mediaImportDialog: 'reelforge:media-import-dialog',
  mediaImport: 'reelforge:media-import',
  mediaList: 'reelforge:media-list',
  referenceImportDialog: 'reelforge:reference-import-dialog',
  referenceImport: 'reelforge:reference-import',
  referenceAnalyze: 'reelforge:reference-analyze',
  referenceList: 'reelforge:reference-list',
  referenceGet: 'reelforge:reference-get',
  styleProfileCreate: 'reelforge:style-profile-create',
  styleProfileList: 'reelforge:style-profile-list',
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
  storageInfo: 'reelforge:storage-info',
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

export interface ReferenceVideo {
  id: string;
  name: string;
  storage_path: string;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  frame_rate: number | null;
  analysis_json: Record<string, unknown> | null;
  analysis_status: 'pending' | 'running' | 'complete' | 'failed';
  excluded_from_aggregation: boolean;
  tags_json: string[];
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
  validation: {
    is_valid: boolean;
    issues: Array<{ severity: string; message: string }>;
  };
}

export interface InputReel {
  filename: string;
  path: string;
  size_bytes: number;
  duration_seconds: number | null;
  modified_at: string;
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
