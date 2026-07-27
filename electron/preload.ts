import { contextBridge, ipcRenderer, webUtils } from 'electron';

import type { AppSettings, OmniApi, ProcessingTask } from '../src/types/omniApi';

const api: OmniApi = {
  getSettings: () => ipcRenderer.invoke('settings:get') as Promise<AppSettings>,
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings) as Promise<AppSettings>,
  selectOutputDirectory: () => ipcRenderer.invoke('dialog:select-output-directory') as Promise<string | null>,
  getPathForFile: (file) => webUtils.getPathForFile(file),
  enqueueVideos: (paths) => ipcRenderer.invoke('queue:enqueue-videos', paths) as Promise<ProcessingTask[]>,
  openPath: (targetPath) => ipcRenderer.invoke('shell:open-path', targetPath) as Promise<void>,
  onTaskUpdated(callback) {
    const listener = (_event: Electron.IpcRendererEvent, task: ProcessingTask) => callback(task);
    ipcRenderer.on('queue:task-updated', listener);
    return () => ipcRenderer.off('queue:task-updated', listener);
  }
};

contextBridge.exposeInMainWorld('omni', api);
