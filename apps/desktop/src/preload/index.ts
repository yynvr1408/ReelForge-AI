import { contextBridge, ipcRenderer } from 'electron';

import { IPC_CHANNELS } from '../shared/ipc-contract';
import type {
  ClearCacheResult,
  DatasetManifest,
  EditingFeedback,
  ExportSettings,
  InputReel,
  LLMAdapterInfo,
  MediaAsset,
  MediaBatchImportResult,
  MediaPage,
  ModelManagerInfo,
  Project,
  ProjectVersion,
  ReferenceAnalysisJob,
  ReferenceCollection,
  ReferenceVideo,
  RenderJob,
  ServiceStatus,
  SimilarReference,
  StorageInfo,
  StyleProfile,
  StyleProfileExport,
  TimelineAlternative,
  TimelineGenerateResult,
  TrainingModelStatus,
  TrainingRun,
} from '../shared/ipc-contract';

/**
 * Minimal, fully-typed bridge. Every method here maps to exactly one
 * allowlisted IPC channel registered in src/main/ipcHandlers.ts — the
 * renderer has no other way to reach Node.js, Python, or the
 * filesystem.
 */
const reelforgeApi = {
  onServiceStatus(callback: (status: ServiceStatus) => void): () => void {
    const listener = (_event: unknown, status: ServiceStatus) =>
      callback(status);
    ipcRenderer.on(IPC_CHANNELS.serviceStatus, listener);
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.serviceStatus, listener);
  },
  getServiceStatus(): Promise<ServiceStatus> {
    return ipcRenderer.invoke(IPC_CHANNELS.serviceStatus);
  },

  createProject(name: string): Promise<Project> {
    return ipcRenderer.invoke(IPC_CHANNELS.projectCreate, { name });
  },
  listProjects(): Promise<Project[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.projectList);
  },
  getProject(projectId: string): Promise<Project> {
    return ipcRenderer.invoke(IPC_CHANNELS.projectGet, projectId);
  },
  updateProject(
    projectId: string,
    payload: Partial<Project>,
  ): Promise<Project> {
    return ipcRenderer.invoke(IPC_CHANNELS.projectUpdate, projectId, payload);
  },
  deleteProject(projectId: string): Promise<{ deleted: boolean }> {
    return ipcRenderer.invoke(IPC_CHANNELS.projectDelete, projectId);
  },
  listProjectVersions(projectId: string): Promise<ProjectVersion[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.projectVersions, projectId);
  },
  restoreProjectVersion(
    projectId: string,
    versionId: string,
  ): Promise<Project> {
    return ipcRenderer.invoke(IPC_CHANNELS.projectVersionRestore, {
      projectId,
      versionId,
    });
  },
  createEditingFeedback(payload: {
    projectId?: string;
    styleProfileId?: string;
    subject: 'timeline_pacing' | 'clip_selection' | 'color';
    action: 'accepted' | 'rejected' | 'too_fast' | 'too_slow' | 'adjusted';
    data?: Record<string, unknown>;
  }): Promise<EditingFeedback> {
    return ipcRenderer.invoke(IPC_CHANNELS.feedbackCreate, payload);
  },
  listEditingFeedback(projectId?: string): Promise<EditingFeedback[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.feedbackList, projectId);
  },
  deleteEditingFeedback(feedbackId: string): Promise<{ deleted: boolean }> {
    return ipcRenderer.invoke(IPC_CHANNELS.feedbackDelete, feedbackId);
  },

  pickMediaFiles(): Promise<string[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.mediaImportDialog);
  },
  pickMediaFile(): Promise<string | null> {
    return ipcRenderer.invoke(IPC_CHANNELS.mediaRelinkDialog);
  },
  importMedia(
    projectId: string | null,
    sourcePath: string,
  ): Promise<MediaAsset> {
    return ipcRenderer.invoke(IPC_CHANNELS.mediaImport, {
      projectId,
      sourcePath,
    });
  },
  importMediaBatch(
    projectId: string | null,
    sourcePaths: string[],
  ): Promise<MediaBatchImportResult[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.mediaImportBatch, {
      projectId,
      sourcePaths,
    });
  },
  listMedia(projectId?: string): Promise<MediaAsset[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.mediaList, projectId);
  },
  listMediaPage(limit: number, offset: number): Promise<MediaPage> {
    return ipcRenderer.invoke(IPC_CHANNELS.mediaPage, { limit, offset });
  },
  revalidateMedia(): Promise<MediaAsset[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.mediaRevalidate);
  },
  relinkMedia(mediaId: string, sourcePath: string): Promise<MediaAsset> {
    return ipcRenderer.invoke(IPC_CHANNELS.mediaRelink, {
      mediaId,
      sourcePath,
    });
  },

  pickReferenceFiles(): Promise<string[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.referenceImportDialog);
  },
  pickReferenceReplacementFile(): Promise<string | null> {
    return ipcRenderer.invoke(IPC_CHANNELS.referenceRelinkDialog);
  },
  importReference(sourcePath: string, name?: string): Promise<ReferenceVideo> {
    return ipcRenderer.invoke(IPC_CHANNELS.referenceImport, {
      sourcePath,
      name,
    });
  },
  relinkReference(
    referenceId: string,
    sourcePath: string,
  ): Promise<ReferenceVideo> {
    return ipcRenderer.invoke(IPC_CHANNELS.referenceRelink, {
      referenceId,
      sourcePath,
    });
  },
  analyzeReference(referenceId: string): Promise<ReferenceAnalysisJob> {
    return ipcRenderer.invoke(IPC_CHANNELS.referenceAnalyze, referenceId);
  },
  getReferenceAnalysisJob(jobId: string): Promise<ReferenceAnalysisJob> {
    return ipcRenderer.invoke(IPC_CHANNELS.referenceAnalysisJobGet, jobId);
  },
  cancelReferenceAnalysisJob(jobId: string): Promise<ReferenceAnalysisJob> {
    return ipcRenderer.invoke(IPC_CHANNELS.referenceAnalysisJobCancel, jobId);
  },
  listReferences(filters?: {
    search?: string;
    collectionId?: string;
    tag?: string;
    analysisStatus?: string;
    limit?: number;
    offset?: number;
  }): Promise<ReferenceVideo[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.referenceList, filters);
  },
  findSimilarReferences(referenceId: string): Promise<SimilarReference[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.referenceSimilar, referenceId);
  },
  getReference(referenceId: string): Promise<ReferenceVideo> {
    return ipcRenderer.invoke(IPC_CHANNELS.referenceGet, referenceId);
  },
  updateReference(
    referenceId: string,
    payload: {
      tags?: string[];
      collectionId?: string;
      excludedFromAggregation?: boolean;
    },
  ): Promise<ReferenceVideo> {
    return ipcRenderer.invoke(IPC_CHANNELS.referenceUpdate, {
      referenceId,
      ...payload,
    });
  },
  listReferenceCollections(): Promise<ReferenceCollection[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.referenceCollectionsList);
  },
  createReferenceCollection(name: string): Promise<ReferenceCollection> {
    return ipcRenderer.invoke(IPC_CHANNELS.referenceCollectionCreate, name);
  },
  renameReferenceCollection(
    collectionId: string,
    name: string,
  ): Promise<ReferenceCollection> {
    return ipcRenderer.invoke(IPC_CHANNELS.referenceCollectionUpdate, {
      collectionId,
      name,
    });
  },
  deleteReferenceCollection(
    collectionId: string,
  ): Promise<{ deleted: boolean }> {
    return ipcRenderer.invoke(
      IPC_CHANNELS.referenceCollectionDelete,
      collectionId,
    );
  },

  createStyleProfile(
    name: string,
    referenceIds: string[],
  ): Promise<StyleProfile> {
    return ipcRenderer.invoke(IPC_CHANNELS.styleProfileCreate, {
      name,
      referenceIds,
    });
  },
  listStyleProfiles(): Promise<StyleProfile[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.styleProfileList);
  },
  importStyleProfile(profile: StyleProfileExport): Promise<StyleProfile> {
    return ipcRenderer.invoke(IPC_CHANNELS.styleProfileImport, profile);
  },
  updateStyleProfile(
    profileId: string,
    updates: {
      medianShotDurationSeconds?: number;
      color?: Record<string, number>;
    },
  ): Promise<StyleProfile> {
    return ipcRenderer.invoke(IPC_CHANNELS.styleProfileUpdate, {
      profileId,
      ...updates,
    });
  },

  generateTimeline(
    mediaIds: string[],
    projectId?: string,
    styleProfileId?: string,
    targetDurationSeconds?: number,
    editingBrief?: string,
    exportSettings?: ExportSettings,
    llmAdapter?: string,
  ): Promise<TimelineGenerateResult> {
    return ipcRenderer.invoke(IPC_CHANNELS.timelineGenerate, {
      mediaIds,
      projectId,
      styleProfileId,
      targetDurationSeconds,
      editingBrief,
      exportSettings,
      llmAdapter,
    });
  },

  startRender(
    projectId: string,
    timeline: Record<string, unknown>,
  ): Promise<RenderJob> {
    return ipcRenderer.invoke(IPC_CHANNELS.renderStart, {
      projectId,
      timeline,
    });
  },
  getRenderJob(jobId: string): Promise<RenderJob> {
    return ipcRenderer.invoke(IPC_CHANNELS.renderGet, jobId);
  },
  listRenderJobs(projectId?: string): Promise<RenderJob[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.renderList, projectId);
  },
  cancelRenderJob(
    jobId: string,
  ): Promise<{ cancelled: boolean; status: string }> {
    return ipcRenderer.invoke(IPC_CHANNELS.renderCancel, jobId);
  },

  openPathInShell(targetPath: string): Promise<void> {
    return ipcRenderer.invoke(IPC_CHANNELS.openPathInShell, targetPath);
  },
  openFolderInShell(folderPath: string): Promise<void> {
    return ipcRenderer.invoke(IPC_CHANNELS.openFolderInShell, folderPath);
  },

  listTrainingInputReels(): Promise<InputReel[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.trainingInputReelsList);
  },
  pickTrainingInputFiles(): Promise<string[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.trainingInputReelsImportDialog);
  },
  importTrainingInputReel(sourcePath: string): Promise<InputReel> {
    return ipcRenderer.invoke(
      IPC_CHANNELS.trainingInputReelsImport,
      sourcePath,
    );
  },
  deleteTrainingInputReel(filename: string): Promise<{ deleted: boolean }> {
    return ipcRenderer.invoke(IPC_CHANNELS.trainingInputReelsDelete, filename);
  },
  getTrainingModelStatus(): Promise<TrainingModelStatus> {
    return ipcRenderer.invoke(IPC_CHANNELS.trainingPacingModelStatus);
  },
  trainPacingPreferenceModel(): Promise<TrainingRun> {
    return ipcRenderer.invoke(IPC_CHANNELS.trainingPacingModelTrain);
  },
  getActivePacingTrainingRun(): Promise<TrainingRun | null> {
    return ipcRenderer.invoke(IPC_CHANNELS.trainingPacingRunActive);
  },
  getPacingTrainingRun(jobId: string): Promise<TrainingRun> {
    return ipcRenderer.invoke(IPC_CHANNELS.trainingPacingRunGet, jobId);
  },
  cancelPacingTrainingRun(jobId: string): Promise<TrainingRun> {
    return ipcRenderer.invoke(IPC_CHANNELS.trainingPacingRunCancel, jobId);
  },
  promotePacingPreferenceModel(): Promise<TrainingModelStatus> {
    return ipcRenderer.invoke(IPC_CHANNELS.trainingPacingModelPromote);
  },
  rollbackPacingPreferenceModel(): Promise<TrainingModelStatus> {
    return ipcRenderer.invoke(IPC_CHANNELS.trainingPacingModelRollback);
  },
  getModelManagerInfo(): Promise<ModelManagerInfo> {
    return ipcRenderer.invoke(IPC_CHANNELS.modelManagerInfo);
  },

  getStorageInfo(): Promise<StorageInfo> {
    return ipcRenderer.invoke(IPC_CHANNELS.storageInfo);
  },
  clearCache(): Promise<ClearCacheResult> {
    return ipcRenderer.invoke(IPC_CHANNELS.storageCacheClear);
  },
  listLLMAdapters(): Promise<LLMAdapterInfo[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.timelineAdapters);
  },
  generateTimelineAlternatives(payload: {
    editingBrief: string;
    llmAdapter?: string;
    count?: number;
  }): Promise<TimelineAlternative[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.timelineAlternatives, payload);
  },
  getDatasetManifest(filters?: {
    styleProfileId?: string;
    projectId?: string;
  }): Promise<DatasetManifest> {
    return ipcRenderer.invoke(IPC_CHANNELS.trainingDatasetManifest, filters);
  },
};

contextBridge.exposeInMainWorld('reelforge', reelforgeApi);

export type ReelforgeApi = typeof reelforgeApi;
