import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createSettingsStore, DEFAULT_SETTINGS } from './settingsStore';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe('settings store', () => {
  it('returns defaults when no settings file exists', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'omni-settings-'));
    tempDirs.push(dir);
    const store = createSettingsStore(path.join(dir, 'settings.json'));

    await expect(store.load()).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it('uses the configured default output directory when no settings file exists', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'omni-settings-'));
    tempDirs.push(dir);
    const store = createSettingsStore(path.join(dir, 'settings.json'), {
      defaultOutputDirectory: 'D:/Omni Watermark Cleaner Output'
    });

    await expect(store.load()).resolves.toEqual({
      ...DEFAULT_SETTINGS,
      outputDirectory: 'D:/Omni Watermark Cleaner Output'
    });
  });

  it('persists output directory and video page overrides', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'omni-settings-'));
    tempDirs.push(dir);
    const store = createSettingsStore(path.join(dir, 'settings.json'));

    await store.save({
      outputDirectory: 'D:/exports',
      videoPage: 'http://127.0.0.1:4173/video-preview.html',
      timeoutMs: 1200000,
      allowLowConfidence: true
    });

    await expect(store.load()).resolves.toEqual({
      outputDirectory: 'D:/exports',
      videoPage: 'http://127.0.0.1:4173/video-preview.html',
      timeoutMs: 1200000,
      allowLowConfidence: true
    });
  });
});
