import { describe, expect, it } from 'vitest';

import { resolveBundledPlaywrightBrowsersPath } from './videoRuntime';

describe('video runtime helpers', () => {
  it('uses bundled Playwright browsers when packaged resources contain them', () => {
    const result = resolveBundledPlaywrightBrowsersPath('C:/app/resources', (candidate) =>
      candidate === 'C:\\app\\resources\\ms-playwright'
    );

    expect(result).toBe('C:\\app\\resources\\ms-playwright');
  });

  it('does not override Playwright when bundled browsers are missing', () => {
    const result = resolveBundledPlaywrightBrowsersPath('C:/app/resources', () => false);

    expect(result).toBeNull();
  });
});
