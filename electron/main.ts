import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AppSettings } from '../src/main/settingsStore';
import { createSettingsStore } from '../src/main/settingsStore';
import { ProcessingQueue } from '../src/main/processingQueue';
import { configureBundledPlaywrightBrowsers } from '../src/main/videoRuntime';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

if (app.isPackaged) {
  configureBundledPlaywrightBrowsers(process.resourcesPath, existsSync);
}

let mainWindow: BrowserWindow | null = null;
let settingsCache: AppSettings | null = null;

const defaultOutputDirectory = path.join(app.getPath('desktop'), 'Omni Watermark Cleaner Output');
const settingsStore = createSettingsStore(path.join(resolveUserDataPath(), 'settings.json'), { defaultOutputDirectory });
const processingQueue = new ProcessingQueue({ exists: existsSync });

processingQueue.on('task-updated', (task) => {
  mainWindow?.webContents.send('queue:task-updated', task);
});

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 860,
    minHeight: 620,
    title: 'Omni Watermark Cleaner',
    backgroundColor: '#f7f8fb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(path.join(__dirname, '..', 'dist-renderer', 'index.html'));
  }
}

async function getSettings(): Promise<AppSettings> {
  if (!settingsCache) {
    settingsCache = await settingsStore.load();
    if (settingsCache.outputDirectory) {
      await mkdir(settingsCache.outputDirectory, { recursive: true });
    }
  }
  return settingsCache;
}

function registerIpcHandlers() {
  ipcMain.handle('settings:get', () => getSettings());

  ipcMain.handle('settings:save', async (_event, settings: AppSettings) => {
    settingsCache = await settingsStore.save(settings);
    return settingsCache;
  });

  ipcMain.handle('dialog:select-output-directory', async () => {
    const options: Electron.OpenDialogOptions = {
      title: '选择导出文件夹',
      properties: ['openDirectory', 'createDirectory']
    };
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return null;
    const current = await getSettings();
    settingsCache = await settingsStore.save({ ...current, outputDirectory: result.filePaths[0] });
    return result.filePaths[0];
  });

  ipcMain.handle('queue:enqueue-files', async (_event, paths: string[]) => {
    const settings = await getSettings();
    return processingQueue.enqueue(paths, settings);
  });

  ipcMain.handle('shell:open-path', async (_event, targetPath: string) => {
    await shell.openPath(targetPath);
  });
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function resolveUserDataPath(): string {
  return process.env.OMNI_USER_DATA_DIR || app.getPath('userData');
}
