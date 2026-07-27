import { describe, expect, it } from 'vitest';

import { createOutputPath, isSupportedVideoFile } from './videoFiles';

describe('video file helpers', () => {
  it('accepts common Omni/Gemini video extensions case-insensitively', () => {
    expect(isSupportedVideoFile('F:/clips/veo-result.MP4')).toBe(true);
    expect(isSupportedVideoFile('F:/clips/scene.mov')).toBe(true);
    expect(isSupportedVideoFile('F:/clips/render.webm')).toBe(true);
    expect(isSupportedVideoFile('F:/clips/frame.png')).toBe(false);
  });

  it('creates a cleaned output path in the selected directory', () => {
    expect(createOutputPath('F:/input/clip.mp4', 'D:/exports')).toBe('D:\\exports\\clip-clean.mp4');
  });

  it('adds a counter when the preferred output path already exists', () => {
    const existing = new Set(['D:\\exports\\clip-clean.mp4', 'D:\\exports\\clip-clean-2.mp4']);

    expect(createOutputPath('F:/input/clip.mp4', 'D:/exports', (candidate) => existing.has(candidate))).toBe(
      'D:\\exports\\clip-clean-3.mp4'
    );
  });
});
