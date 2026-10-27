import { contextBridge, ipcRenderer } from 'electron';

import { IPC_CHANNELS } from '../shared/ipc-contract';
import type {
  InputReel,
  MediaAsset,
  Project,
  ReferenceVideo,
  RenderJob,
  ServiceStatus,
  StorageInfo,
  StyleProfile,
  TimelineGenerateResult,
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

  pickMediaFiles(): Promise<string[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.mediaImportDialog);
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
  listMedia(projectId?: string): Promise<MediaAsset[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.mediaList, projectId);
  },

  pickReferenceFiles(): Promise<string[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.referenceImportDialog);
  },
  importReference(sourcePath: string, name?: string): Promise<ReferenceVideo> {
    return ipcRenderer.invoke(IPC_CHANNELS.referenceImport, {
      sourcePath,
      name,
    });
  },
  analyzeReference(referenceId: string): Promise<ReferenceVideo> {
    return ipcRenderer.invoke(IPC_CHANNELS.referenceAnalyze, referenceId);
  },
  listReferences(): Promise<ReferenceVideo[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.referenceList);
  },
  getReference(referenceId: string): Promise<ReferenceVideo> {
    return ipcRenderer.invoke(IPC_CHANNELS.referenceGet, referenceId);
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

  generateTimeline(
    mediaIds: string[],
    styleProfileId?: string,
    targetDurationSeconds?: number,
  ): Promise<TimelineGenerateResult> {
    return ipcRenderer.invoke(IPC_CHANNELS.timelineGenerate, {
      mediaIds,
      styleProfileId,
      targetDurationSeconds,
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
  cancelRenderJob(jobId: string): Promise<{ cancelled: boolean }> {
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

  getStorageInfo(): Promise<StorageInfo> {
    return ipcRenderer.invoke(IPC_CHANNELS.storageInfo);
  },
};

contextBridge.exposeInMainWorld('reelforge', reelforgeApi);

export type ReelforgeApi = typeof reelforgeApi;
