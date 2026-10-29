import { app, ipcMain, dialog, shell, type BrowserWindow } from 'electron';

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

  ipcMain.handle(
    IPC_CHANNELS.projectVersions,
    async (_event, projectId: string) =>
      requireClient().get(
        `/projects/${encodeURIComponent(projectId)}/versions`,
      ),
  );
  ipcMain.handle(
    IPC_CHANNELS.projectVersionRestore,
    async (_event, payload: { projectId: string; versionId: string }) =>
      requireClient().post(
        `/projects/${encodeURIComponent(payload.projectId)}/versions/${encodeURIComponent(payload.versionId)}/restore`,
      ),
  );

  ipcMain.handle(
    IPC_CHANNELS.feedbackCreate,
    async (
      _event,
      payload: {
        projectId?: string;
        styleProfileId?: string;
        subject: string;
        action: string;
        data?: Record<string, unknown>;
      },
    ) =>
      requireClient().post('/feedback', {
        project_id: payload.projectId,
        style_profile_id: payload.styleProfileId,
        subject: payload.subject,
        action: payload.action,
        payload: payload.data ?? {},
      }),
  );
  ipcMain.handle(
    IPC_CHANNELS.feedbackList,
    async (_event, projectId?: string) => {
      return requireClient().get(
        `/feedback${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ''}`,
      );
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.feedbackDelete,
    async (_event, feedbackId: string) =>
      requireClient().delete(`/feedback/${encodeURIComponent(feedbackId)}`),
  );

  ipcMain.handle(IPC_CHANNELS.mediaImportDialog, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import media',
      properties: ['openFile', 'openDirectory', 'multiSelections'],
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
            'webp',
            'bmp',
            'mp3',
            'wav',
            'aac',
            'm4a',
            'flac',
            'srt',
            'vtt',
          ],
        },
      ],
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle(IPC_CHANNELS.mediaRelinkDialog, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose replacement media file',
      properties: ['openFile'],
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
            'webp',
            'bmp',
            'mp3',
            'wav',
            'aac',
            'm4a',
            'flac',
            'srt',
            'vtt',
          ],
        },
      ],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
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

  ipcMain.handle(
    IPC_CHANNELS.mediaImportBatch,
    async (
      _event,
      payload: { projectId: string | null; sourcePaths: string[] },
    ) =>
      requireClient().post('/media/import-batch', {
        project_id: payload.projectId || null,
        source_paths: payload.sourcePaths,
      }),
  );

  ipcMain.handle(IPC_CHANNELS.mediaList, async (_event, projectId?: string) => {
    const query = projectId
      ? `?project_id=${encodeURIComponent(projectId)}`
      : '';
    return requireClient().get(`/media${query}`);
  });

  ipcMain.handle(
    IPC_CHANNELS.mediaPage,
    async (_event, payload: { limit: number; offset: number }) =>
      requireClient().get(
        `/media/page?limit=${encodeURIComponent(payload.limit)}&offset=${encodeURIComponent(payload.offset)}`,
      ),
  );

  ipcMain.handle(IPC_CHANNELS.mediaRevalidate, async () => {
    return requireClient().post('/media/revalidate');
  });
  ipcMain.handle(
    IPC_CHANNELS.mediaRelink,
    async (_event, payload: { mediaId: string; sourcePath: string }) =>
      requireClient().post(
        `/media/${encodeURIComponent(payload.mediaId)}/relink`,
        {
          source_path: payload.sourcePath,
        },
      ),
  );

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

  ipcMain.handle(IPC_CHANNELS.referenceRelinkDialog, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose replacement reference video',
      properties: ['openFile'],
      filters: [
        {
          name: 'Video files',
          extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'],
        },
      ],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
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
    IPC_CHANNELS.referenceRelink,
    async (_event, payload: { referenceId: string; sourcePath: string }) =>
      requireClient().post(
        `/reference/${encodeURIComponent(payload.referenceId)}/relink`,
        { source_path: payload.sourcePath },
      ),
  );

  ipcMain.handle(
    IPC_CHANNELS.referenceAnalyze,
    async (_event, referenceId: string) => {
      return requireClient().post(
        `/reference/${encodeURIComponent(referenceId)}/analyze/start`,
      );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.referenceAnalysisJobGet,
    async (_event, jobId: string) =>
      requireClient().get(
        `/reference/analysis-jobs/${encodeURIComponent(jobId)}`,
      ),
  );

  ipcMain.handle(
    IPC_CHANNELS.referenceAnalysisJobCancel,
    async (_event, jobId: string) =>
      requireClient().post(
        `/reference/analysis-jobs/${encodeURIComponent(jobId)}/cancel`,
      ),
  );

  ipcMain.handle(
    IPC_CHANNELS.referenceList,
    async (
      _event,
      filters?: {
        search?: string;
        collectionId?: string;
        tag?: string;
        analysisStatus?: string;
        limit?: number;
        offset?: number;
      },
    ) => {
      const params = new URLSearchParams();
      if (filters?.search) params.set('search', filters.search);
      if (filters?.collectionId)
        params.set('collection_id', filters.collectionId);
      if (filters?.tag) params.set('tag', filters.tag);
      if (filters?.analysisStatus)
        params.set('analysis_status', filters.analysisStatus);
      if (filters?.limit !== undefined)
        params.set('limit', String(filters.limit));
      if (filters?.offset !== undefined)
        params.set('offset', String(filters.offset));
      const query = params.toString();
      return requireClient().get(`/reference${query ? `?${query}` : ''}`);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.referenceGet,
    async (_event, referenceId: string) => {
      return requireClient().get(
        `/reference/${encodeURIComponent(referenceId)}`,
      );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.referenceSimilar,
    async (_event, referenceId: string) =>
      requireClient().get(
        `/reference/similar/${encodeURIComponent(referenceId)}`,
      ),
  );

  ipcMain.handle(
    IPC_CHANNELS.referenceUpdate,
    async (
      _event,
      payload: {
        referenceId: string;
        tags?: string[];
        collectionId?: string;
        excludedFromAggregation?: boolean;
      },
    ) => {
      const body: Record<string, unknown> = {};
      if (payload.tags !== undefined) body.tags = payload.tags;
      if (payload.collectionId !== undefined)
        body.collection_id = payload.collectionId;
      if (payload.excludedFromAggregation !== undefined) {
        body.excluded_from_aggregation = payload.excludedFromAggregation;
      }
      return requireClient().patch(
        `/reference/${encodeURIComponent(payload.referenceId)}`,
        body,
      );
    },
  );

  ipcMain.handle(IPC_CHANNELS.referenceCollectionsList, async () => {
    return requireClient().get('/reference/collections');
  });
  ipcMain.handle(
    IPC_CHANNELS.referenceCollectionCreate,
    async (_event, name: string) => {
      return requireClient().post('/reference/collections', { name });
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.referenceCollectionUpdate,
    async (_event, payload: { collectionId: string; name: string }) =>
      requireClient().patch(
        `/reference/collections/${encodeURIComponent(payload.collectionId)}`,
        { name: payload.name },
      ),
  );
  ipcMain.handle(
    IPC_CHANNELS.referenceCollectionDelete,
    async (_event, collectionId: string) =>
      requireClient().delete(
        `/reference/collections/${encodeURIComponent(collectionId)}`,
      ),
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
    IPC_CHANNELS.styleProfileImport,
    async (_event, payload: Record<string, unknown>) =>
      requireClient().post('/style-profiles/import', payload),
  );

  ipcMain.handle(
    IPC_CHANNELS.styleProfileUpdate,
    async (
      _event,
      payload: {
        profileId: string;
        medianShotDurationSeconds?: number;
        color?: Record<string, number>;
      },
    ) => {
      return requireClient().patch(
        `/style-profiles/${encodeURIComponent(payload.profileId)}`,
        {
          ...(payload.medianShotDurationSeconds !== undefined
            ? {
                median_shot_duration_seconds: payload.medianShotDurationSeconds,
              }
            : {}),
          ...(payload.color ? { color: payload.color } : {}),
        },
      );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.timelineGenerate,
    async (
      _event,
      payload: {
        mediaIds: string[];
        projectId?: string;
        styleProfileId?: string;
        targetDurationSeconds?: number;
        editingBrief?: string;
        llmAdapter?: string;
        exportSettings?: {
          width: number;
          height: number;
          frame_rate: number;
          video_codec: string;
          audio_codec: string;
          container: 'mp4';
          crf: number;
        };
      },
    ) => {
      return requireClient().post('/timeline/generate', {
        media_ids: payload.mediaIds,
        project_id: payload.projectId,
        style_profile_id: payload.styleProfileId,
        target_duration_seconds: payload.targetDurationSeconds,
        editing_brief: payload.editingBrief,
        llm_adapter: payload.llmAdapter,
        export_settings: payload.exportSettings,
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

  ipcMain.handle(IPC_CHANNELS.trainingPacingModelStatus, async () => {
    return requireClient().get('/training/models/pacing');
  });

  ipcMain.handle(IPC_CHANNELS.trainingPacingModelTrain, async () => {
    return requireClient().post('/training/models/pacing/train/start', {});
  });

  ipcMain.handle(IPC_CHANNELS.trainingPacingRunActive, async () => {
    return requireClient().get('/training/models/pacing/runs/active');
  });

  ipcMain.handle(
    IPC_CHANNELS.trainingPacingRunGet,
    async (_event, jobId: string) =>
      requireClient().get(
        `/training/models/pacing/runs/${encodeURIComponent(jobId)}`,
      ),
  );

  ipcMain.handle(
    IPC_CHANNELS.trainingPacingRunCancel,
    async (_event, jobId: string) =>
      requireClient().post(
        `/training/models/pacing/runs/${encodeURIComponent(jobId)}/cancel`,
        {},
      ),
  );

  ipcMain.handle(IPC_CHANNELS.trainingPacingModelPromote, async () => {
    return requireClient().post('/training/models/pacing/promote', {});
  });

  ipcMain.handle(IPC_CHANNELS.trainingPacingModelRollback, async () => {
    return requireClient().post('/training/models/pacing/rollback', {});
  });

  ipcMain.handle(IPC_CHANNELS.modelManagerInfo, async () => {
    return requireClient().get('/models');
  });

  ipcMain.handle(IPC_CHANNELS.storageInfo, async () => {
    return requireClient().get('/storage');
  });

  ipcMain.handle(IPC_CHANNELS.storageCacheClear, async () => {
    return requireClient().post('/storage/cache/clear', {});
  });

  ipcMain.handle(IPC_CHANNELS.timelineAdapters, async () => {
    return requireClient().get('/timeline/adapters');
  });

  ipcMain.handle(
    IPC_CHANNELS.timelineAlternatives,
    async (
      _event,
      payload: { editingBrief: string; llmAdapter?: string; count?: number },
    ) => {
      return requireClient().post('/timeline/alternatives', {
        editing_brief: payload.editingBrief,
        llm_adapter: payload.llmAdapter,
        count: payload.count ?? 3,
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.trainingDatasetManifest,
    async (
      _event,
      filters?: { styleProfileId?: string; projectId?: string },
    ) => {
      const params = new URLSearchParams();
      if (filters?.styleProfileId)
        params.set('style_profile_id', filters.styleProfileId);
      if (filters?.projectId) params.set('project_id', filters.projectId);
      const query = params.toString();
      return requireClient().get(
        `/training/dataset/manifest${query ? `?${query}` : ''}`,
      );
    },
  );

  ipcMain.handle(IPC_CHANNELS.appVersion, async () => {
    return {
      version: app.getVersion(),
      isPackaged: app.isPackaged,
    };
  });

  ipcMain.handle(IPC_CHANNELS.checkForUpdates, async () => {
    const currentVersion = app.getVersion();
    try {
      const response = await fetch(
        'https://api.github.com/repos/yynvr1408/ReelForge-AI/releases/latest',
        {
          headers: {
            'User-Agent': 'ReelForge-AI-Desktop',
            Accept: 'application/vnd.github.v3+json',
          },
        },
      );

      if (!response.ok) {
        if (response.status === 404) {
          return {
            currentVersion,
            latestVersion: null,
            updateAvailable: false,
            releaseName: null,
            releaseNotes: null,
            publishedAt: null,
            htmlUrl: null,
            installerUrl: null,
            assets: [],
            error: 'No releases published yet on GitHub repository.',
          };
        }
        throw new Error(`GitHub API returned HTTP ${response.status}`);
      }

      const data = (await response.json()) as {
        tag_name: string;
        name: string;
        body: string;
        published_at: string;
        html_url: string;
        assets: Array<{
          name: string;
          browser_download_url: string;
          size: number;
          content_type: string;
        }>;
      };

      const cleanTag = data.tag_name ? data.tag_name.replace(/^v/, '') : '';
      const cleanCurrent = currentVersion.replace(/^v/, '');
      const updateAvailable = Boolean(cleanTag && cleanTag !== cleanCurrent);

      const assets = (data.assets || []).map((a) => ({
        name: a.name,
        browserDownloadUrl: a.browser_download_url,
        sizeBytes: a.size,
        contentType: a.content_type,
      }));

      const setupAsset =
        assets.find(
          (a) =>
            a.name.toLowerCase().endsWith('.exe') &&
            (a.name.toLowerCase().includes('setup') ||
              a.name.toLowerCase().includes('reelforge')),
        ) || assets.find((a) => a.name.toLowerCase().endsWith('.exe'));

      return {
        currentVersion,
        latestVersion: cleanTag || null,
        updateAvailable,
        releaseName: data.name || data.tag_name || null,
        releaseNotes: data.body || '',
        publishedAt: data.published_at || null,
        htmlUrl: data.html_url || null,
        installerUrl: setupAsset
          ? setupAsset.browserDownloadUrl
          : data.html_url,
        assets,
      };
    } catch (err) {
      return {
        currentVersion,
        latestVersion: null,
        updateAvailable: false,
        releaseName: null,
        releaseNotes: null,
        publishedAt: null,
        htmlUrl: null,
        installerUrl: null,
        assets: [],
        error:
          err instanceof Error
            ? err.message
            : 'Could not connect to GitHub releases',
      };
    }
  });
}
