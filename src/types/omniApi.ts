import type { AppSettings } from '../main/settingsStore';
import type { ProcessingTask } from '../main/processingQueue';

export type { AppSettings, ProcessingTask };

export interface OmniApi {
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<AppSettings>;
  selectOutputDirectory(): Promise<string | null>;
  getPathForFile(file: File): string;
  enqueueFiles(paths: string[]): Promise<ProcessingTask[]>;
  openPath(path: string): Promise<void>;
  onTaskUpdated(callback: (task: ProcessingTask) => void): () => void;
}

declare global {
  interface Window {
    omni?: OmniApi;
  }
}
