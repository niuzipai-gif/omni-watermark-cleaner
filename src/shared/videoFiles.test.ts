import { describe, expect, it } from 'vitest';

import { createOutputPath, getMediaKind, isSupportedMediaFile, isSupportedVideoFile } from './videoFiles';

describe('video file helpers', () => {
  it('accepts common Omni/Gemini video extensions case-insensitively', () => {
    expect(isSupportedVideoFile('F:/clips/veo-result.MP4')).toBe(true);
    expect(isSupportedVideoFile('F:/clips/scene.mov')).toBe(true);
    expect(isSupportedVideoFile('F:/clips/render.webm')).toBe(true);
    expect(isSupportedVideoFile('F:/clips/frame.png')).toBe(false);
  });

  it('classifies supported Gemini image and video extensions case-insensitively', () => {
    expect(getMediaKind('F:/images/Gemini.PNG')).toBe('image');
    expect(getMediaKind('F:/images/photo.WebP')).toBe('image');
    expect(getMediaKind('F:/clips/scene.MOV')).toBe('video');
    expect(getMediaKind('F:/notes/readme.txt')).toBeNull();
    expect(isSupportedMediaFile('F:/images/photo.jpeg')).toBe(true);
    expect(isSupportedVideoFile('F:/images/photo.jpeg')).toBe(false);
  });

  it('creates a cleaned output path in the selected directory', () => {
    expect(createOutputPath('F:/input/clip.mp4', 'D:/exports')).toBe('D:\\exports\\clip-clean.mp4');
  });

  it('keeps an image extension when reserving a clean output path', () => {
    expect(createOutputPath('F:/input/photo.WEBP', 'D:/exports')).toBe('D:\\exports\\photo-clean.WEBP');
  });

  it('adds a counter when the preferred output path already exists', () => {
    const existing = new Set(['D:\\exports\\clip-clean.mp4', 'D:\\exports\\clip-clean-2.mp4']);

    expect(createOutputPath('F:/input/clip.mp4', 'D:/exports', (candidate) => existing.has(candidate))).toBe(
      'D:\\exports\\clip-clean-3.mp4'
    );
  });
});
