import { ipcMain, dialog, shell, type BrowserWindow } from 'electron';

import { IPC_CHANNELS } from '../shared/ipc-contract';
import type { ServiceClient } from './serviceClient';

/**
 * Registers every IPC handler the renderer is allowed to call. This is
 * the complete allowlist — the preload bridge only ever forwards to
 * channels registered here, and every payload is a plain
 * JSON-serializable object validated by the processing service itself
 * (Pydantic) on the far side of the HTTP call.
 */
export function registerIpcHandlers(
  getClient: () => ServiceClient | null,
  mainWindow: BrowserWindow,
): void {
  function requireClient(): ServiceClient {
    const client = getClient();
    if (!client) {
      throw new Error('Processing service is not ready yet');
    }
    return client;
  }

  ipcMain.handle(
    IPC_CHANNELS.projectCreate,
    async (_event, payload: { name: string }) => {
      return requireClient().post('/projects', payload);
    },
  );

  ipcMain.handle(IPC_CHANNELS.projectList, async () => {
    return requireClient().get('/projects');
  });

  ipcMain.handle(IPC_CHANNELS.projectGet, async (_event, projectId: string) => {
    return requireClient().get(`/projects/${encodeURIComponent(projectId)}`);
  });

  ipcMain.handle(
    IPC_CHANNELS.projectUpdate,
    async (_event, projectId: string, payload: Record<string, unknown>) => {
      return requireClient().patch(
        `/projects/${encodeURIComponent(projectId)}`,
        payload,
      );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.projectDelete,
    async (_event, projectId: string) => {
      return requireClient().delete(
        `/projects/${encodeURIComponent(projectId)}`,
      );
    },
  );

  ipcMain.handle(IPC_CHANNELS.mediaImportDialog, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import media',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Media files',
          extensions: [
            'mp4',
            'mov',
            'mkv',
            'webm',
            'avi',
            'm4v',
            'jpg',
            'jpeg',
            'png',
            'mp3',
            'wav',
            'aac',
          ],
        },
      ],
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle(
    IPC_CHANNELS.mediaImport,
    async (
      _event,
      payload: { projectId: string | null; sourcePath: string },
    ) => {
      return requireClient().post('/media/import', {
        project_id: payload.projectId || null,
        source_path: payload.sourcePath,
      });
    },
  );

  ipcMain.handle(IPC_CHANNELS.mediaList, async (_event, projectId?: string) => {
    const query = projectId
      ? `?project_id=${encodeURIComponent(projectId)}`
      : '';
    return requireClient().get(`/media${query}`);
  });

  ipcMain.handle(IPC_CHANNELS.referenceImportDialog, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import reference videos',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Video files',
          extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'],
        },
      ],
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle(
    IPC_CHANNELS.referenceImport,
    async (_event, payload: { sourcePath: string; name?: string }) => {
      return requireClient().post('/reference/import', {
        source_path: payload.sourcePath,
        name: payload.name,
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.referenceAnalyze,
    async (_event, referenceId: string) => {
      return requireClient().post(
        `/reference/${encodeURIComponent(referenceId)}/analyze`,
      );
    },
  );

  ipcMain.handle(IPC_CHANNELS.referenceList, async () => {
    return requireClient().get('/reference');
  });

  ipcMain.handle(
    IPC_CHANNELS.referenceGet,
    async (_event, referenceId: string) => {
      return requireClient().get(
        `/reference/${encodeURIComponent(referenceId)}`,
      );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.styleProfileCreate,
    async (_event, payload: { name: string; referenceIds: string[] }) => {
      return requireClient().post('/style-profiles', {
        name: payload.name,
        reference_ids: payload.referenceIds,
      });
    },
  );

  ipcMain.handle(IPC_CHANNELS.styleProfileList, async () => {
    return requireClient().get('/style-profiles');
  });

  ipcMain.handle(
    IPC_CHANNELS.timelineGenerate,
    async (
      _event,
      payload: {
        mediaIds: string[];
        styleProfileId?: string;
        targetDurationSeconds?: number;
      },
    ) => {
      return requireClient().post('/timeline/generate', {
        media_ids: payload.mediaIds,
        style_profile_id: payload.styleProfileId,
        target_duration_seconds: payload.targetDurationSeconds,
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.renderStart,
    async (
      _event,
      payload: { projectId: string; timeline: Record<string, unknown> },
    ) => {
      return requireClient().post('/render/start', {
        project_id: payload.projectId,
        timeline: payload.timeline,
      });
    },
  );

  ipcMain.handle(IPC_CHANNELS.renderGet, async (_event, jobId: string) => {
    return requireClient().get(`/render/${encodeURIComponent(jobId)}`);
  });

  ipcMain.handle(
    IPC_CHANNELS.renderList,
    async (_event, projectId?: string) => {
      const query = projectId
        ? `?project_id=${encodeURIComponent(projectId)}`
        : '';
      return requireClient().get(`/render${query}`);
    },
  );

  ipcMain.handle(IPC_CHANNELS.renderCancel, async (_event, jobId: string) => {
    return requireClient().post(`/render/${encodeURIComponent(jobId)}/cancel`);
  });

  ipcMain.handle(
    IPC_CHANNELS.openPathInShell,
    async (_event, targetPath: string) => {
      await shell.showItemInFolder(targetPath);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.openFolderInShell,
    async (_event, folderPath: string) => {
      const errorMessage = await shell.openPath(folderPath);
      if (errorMessage) {
        throw new Error(errorMessage);
      }
    },
  );

  ipcMain.handle(IPC_CHANNELS.trainingInputReelsList, async () => {
    return requireClient().get('/training/input-reels');
  });

  ipcMain.handle(IPC_CHANNELS.trainingInputReelsImportDialog, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Add reels to training input',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Video files',
          extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'],
        },
      ],
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle(
    IPC_CHANNELS.trainingInputReelsImport,
    async (_event, sourcePath: string) => {
      return requireClient().post('/training/input-reels/import', {
        source_path: sourcePath,
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.trainingInputReelsDelete,
    async (_event, filename: string) => {
      return requireClient().delete(
        `/training/input-reels/${encodeURIComponent(filename)}`,
      );
    },
  );

  ipcMain.handle(IPC_CHANNELS.storageInfo, async () => {
    return requireClient().get('/storage');
  });
}
