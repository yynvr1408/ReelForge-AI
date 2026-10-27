import { app, BrowserWindow, session, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import started from 'electron-squirrel-startup';
import { updateElectronApp, UpdateSourceType } from 'update-electron-app';

import { registerIpcHandlers } from './ipcHandlers';
import {
  startProcessingService,
  type ProcessingServiceHandle,
} from './pythonService';
import { ServiceClient } from './serviceClient';
import { resolvePythonLogDir } from './pythonService';
import { IPC_CHANNELS } from '../shared/ipc-contract';
import { ipcMain } from 'electron';

if (started) {
  app.quit();
}

function writeCrashLog(context: string, error: unknown): void {
  try {
    const logDir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    const message =
      error instanceof Error
        ? `${error.message}\n${error.stack}`
        : String(error);
    fs.appendFileSync(
      path.join(logDir, 'main-process-crash.log'),
      `[${new Date().toISOString()}] ${context}: ${message}\n`,
    );
  } catch {
    // last resort: nothing more we can do
  }
}

process.on('uncaughtException', (error) =>
  writeCrashLog('uncaughtException', error),
);
process.on('unhandledRejection', (error) =>
  writeCrashLog('unhandledRejection', error),
);

let serviceHandle: ProcessingServiceHandle | null = null;
let serviceClient: ServiceClient | null = null;
let mainWindow: BrowserWindow | null = null;

function broadcastServiceStatus(
  state: 'starting' | 'ready' | 'error' | 'stopped',
  message?: string,
): void {
  if (state === 'error' || state === 'stopped') {
    appendLog(`[service-status] ${state}${message ? `: ${message}` : ''}`);
  }
  if (
    mainWindow &&
    !mainWindow.isDestroyed() &&
    !mainWindow.webContents.isDestroyed()
  ) {
    mainWindow.webContents.send(IPC_CHANNELS.serviceStatus, { state, message });
  }
}

function appendLog(line: string): void {
  try {
    const logDir = resolvePythonLogDir();
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(
      path.join(logDir, 'processing-service.stdout.log'),
      `${line}\n`,
    );
  } catch {
    // Logging failures must never crash the app.
  }
}

const isDev = !app.isPackaged;

function buildContentSecurityPolicy(): string {
  if (isDev) {
    // Vite's dev server needs an HMR websocket connection and inline
    // module scripts; this relaxed policy is dev-only and never ships.
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self' ws: http://localhost:*",
      "img-src 'self' data: blob: file:",
      "media-src 'self' blob: file:",
    ].join('; ');
  }
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self'",
    "img-src 'self' data: blob: file:",
    "media-src 'self' blob: file:",
    "object-src 'none'",
  ].join('; ');
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0f0f10',
    icon: path.join(__dirname, '../../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [buildContentSecurityPolicy()],
      },
    });
  });

  // Block navigation away from the app shell and force external links
  // out to the OS browser instead of into a privileged renderer.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isDevServer =
      MAIN_WINDOW_VITE_DEV_SERVER_URL &&
      url.startsWith(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    if (!isDevServer) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
}

async function launchProcessingService(): Promise<void> {
  broadcastServiceStatus('starting');
  try {
    serviceHandle = await startProcessingService({
      onLog: appendLog,
      onExit: (code) => {
        serviceClient = null;
        if (code !== 0) {
          broadcastServiceStatus(
            'error',
            `Processing service exited with code ${code}`,
          );
        } else {
          broadcastServiceStatus('stopped');
        }
      },
    });
    serviceClient = new ServiceClient(serviceHandle);
    broadcastServiceStatus('ready');
  } catch (error) {
    broadcastServiceStatus(
      'error',
      error instanceof Error ? error.message : String(error),
    );
  }
}

function startAutoUpdater(): void {
  // Electron's own public update service proxies GitHub releases for
  // Squirrel.Windows/Squirrel.Mac, which is what our Squirrel maker
  // produces. Dev builds never check for updates.
  if (!app.isPackaged) return;
  try {
    updateElectronApp({
      updateSource: {
        type: UpdateSourceType.ElectronPublicUpdateService,
        repo: 'yynvr1408/ReelForge-AI',
      },
      updateInterval: '1 hour',
      logger: {
        log: (message) => appendLog(`[updater] ${message}`),
        info: (message) => appendLog(`[updater] ${message}`),
        warn: (message) => appendLog(`[updater] ${message}`),
        error: (message) => appendLog(`[updater] ${message}`),
      },
    });
  } catch (error) {
    writeCrashLog('autoUpdaterInit', error);
  }
}

app.whenReady().then(async () => {
  appendLog('[lifecycle] whenReady fired');
  try {
    createWindow();
    appendLog('[lifecycle] createWindow done');
    startAutoUpdater();
    appendLog('[lifecycle] startAutoUpdater done');
    registerIpcHandlers(() => serviceClient, mainWindow!);
    ipcMain.handle(IPC_CHANNELS.serviceStatus, () => {
      if (serviceClient) return { state: 'ready' };
      if (serviceHandle) return { state: 'starting' };
      return { state: 'starting' };
    });
    appendLog(
      '[lifecycle] IPC handlers registered, launching processing service',
    );
    await launchProcessingService();
    appendLog('[lifecycle] launchProcessingService returned');

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (error) {
    writeCrashLog('whenReady', error);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

let isQuitting = false;

app.on('before-quit', async (event) => {
  if (isQuitting) return;
  if (serviceHandle) {
    event.preventDefault();
    isQuitting = true;
    const handle = serviceHandle;
    serviceHandle = null;
    serviceClient = null;
    await handle.stop();
    app.quit();
  }
});
