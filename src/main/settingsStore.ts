import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface AppSettings {
  outputDirectory: string | null;
  videoPage: string;
  timeoutMs: number;
  allowLowConfidence: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  outputDirectory: null,
  videoPage: 'https://geminiwatermarkremover.io/video',
  timeoutMs: 15 * 60 * 1000,
  allowLowConfidence: false
};

export interface SettingsStore {
  load(): Promise<AppSettings>;
  save(settings: AppSettings): Promise<AppSettings>;
}

export interface SettingsStoreOptions {
  defaultOutputDirectory?: string | null;
}

export function createSettingsStore(settingsPath: string, options: SettingsStoreOptions = {}): SettingsStore {
  const defaults = {
    ...DEFAULT_SETTINGS,
    outputDirectory: options.defaultOutputDirectory ?? DEFAULT_SETTINGS.outputDirectory
  };

  return {
    async load() {
      try {
        const raw = await readFile(settingsPath, 'utf8');
        return normalizeSettings(JSON.parse(raw), defaults);
      } catch (error) {
        if (isMissingFileError(error)) {
          return defaults;
        }
        throw error;
      }
    },
    async save(settings) {
      const nextSettings = normalizeSettings(settings, defaults);
      await mkdir(path.dirname(settingsPath), { recursive: true });
      await writeFile(settingsPath, `${JSON.stringify(nextSettings, null, 2)}\n`, 'utf8');
      return nextSettings;
    }
  };
}

function normalizeSettings(value: Partial<AppSettings>, defaults: AppSettings): AppSettings {
  return {
    outputDirectory: typeof value.outputDirectory === 'string' && value.outputDirectory ? value.outputDirectory : defaults.outputDirectory,
    videoPage: typeof value.videoPage === 'string' && value.videoPage ? value.videoPage : DEFAULT_SETTINGS.videoPage,
    timeoutMs: Number.isFinite(value.timeoutMs) && Number(value.timeoutMs) > 0 ? Number(value.timeoutMs) : DEFAULT_SETTINGS.timeoutMs,
    allowLowConfidence: Boolean(value.allowLowConfidence)
  };
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
