import { describe, expect, it, vi } from 'vitest';

import { buildGwrArgs, runWatermarkRemoval, selectProcessingStrategy } from './removalRunner';

describe('removal runner', () => {
  it('builds stable gwr CLI arguments for video removal', () => {
    expect(
      buildGwrArgs({
        inputPath: 'F:/in/video.mp4',
        outputPath: 'D:/out/video-clean.mp4',
        videoPage: 'https://geminiwatermarkremover.io/video',
        timeoutMs: 900000,
        allowLowConfidence: true
      })
    ).toEqual([
      'remove',
      'F:/in/video.mp4',
      '--output',
      'D:/out/video-clean.mp4',
      '--overwrite',
      '--json',
      '--video-page',
      'https://geminiwatermarkremover.io/video',
      '--video-timeout-ms',
      '900000',
      '--allow-low-confidence'
    ]);
  });

  it('runs the configured executor and parses JSON output', async () => {
    const executor = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({ input: 'F:/in/video.mp4', output: 'D:/out/video-clean.mp4', kind: 'video' }),
      stderr: '',
      exitCode: 0
    });

    const result = await runWatermarkRemoval(
      {
        inputPath: 'F:/in/video.mp4',
        outputPath: 'D:/out/video-clean.mp4',
        videoPage: 'https://geminiwatermarkremover.io/video',
        timeoutMs: 900000,
        allowLowConfidence: false
      },
      executor
    );

    expect(executor).toHaveBeenCalledWith(expect.stringContaining('gwr'), [
      'remove',
      'F:/in/video.mp4',
      '--output',
      'D:/out/video-clean.mp4',
      '--overwrite',
      '--json',
      '--video-page',
      'https://geminiwatermarkremover.io/video',
      '--video-timeout-ms',
      '900000'
    ]);
    expect(result.output).toBe('D:/out/video-clean.mp4');
  });

  it('surfaces stderr when the CLI fails', async () => {
    const executor = vi.fn().mockResolvedValue({
      stdout: '',
      stderr: 'Video export failed',
      exitCode: 4
    });

    await expect(
      runWatermarkRemoval(
        {
          inputPath: 'F:/in/video.mp4',
          outputPath: 'D:/out/video-clean.mp4',
          videoPage: 'https://geminiwatermarkremover.io/video',
          timeoutMs: 900000,
          allowLowConfidence: false
        },
        executor
      )
    ).rejects.toThrow('Video export failed');
  });

  it('uses the public video page processor by default so current site selectors are supported', async () => {
    const processor = vi.fn().mockResolvedValue({
      input: 'F:/in/video.mp4',
      output: 'D:/out/video-clean.mp4',
      kind: 'video',
      meta: { status: 'ok' }
    });

    const result = await runWatermarkRemoval(
      {
        inputPath: 'F:/in/video.mp4',
        outputPath: 'D:/out/video-clean.mp4',
        videoPage: 'https://geminiwatermarkremover.io/video',
        timeoutMs: 900000,
        allowLowConfidence: true
      },
      undefined,
      processor
    );

    expect(processor).toHaveBeenCalledWith({
      inputPath: 'F:/in/video.mp4',
      outputPath: 'D:/out/video-clean.mp4',
      videoPage: 'https://geminiwatermarkremover.io/video',
      timeoutMs: 900000,
      allowLowConfidence: true
    });
    expect(result).toEqual({
      input: 'F:/in/video.mp4',
      output: 'D:/out/video-clean.mp4',
      kind: 'video',
      meta: { status: 'ok' }
    });
  });

  it('selects exact local alpha cleanup for 16:9 landscape videos', () => {
    expect(selectProcessingStrategy({ width: 1920, height: 1080, duration: 6, aspect: 'landscape' })).toBe('local-alpha');
  });

  it('selects exact local alpha cleanup for portrait and square videos', () => {
    expect(selectProcessingStrategy({ width: 1080, height: 1920, duration: 6, aspect: 'portrait' })).toBe('local-alpha');
    expect(selectProcessingStrategy({ width: 1080, height: 1080, duration: 6, aspect: 'square' })).toBe('local-alpha');
  });

  it('selects exact local alpha cleanup for other uncommon ratios', () => {
    expect(selectProcessingStrategy({ width: 1440, height: 1080, duration: 6, aspect: 'other' })).toBe('local-alpha');
  });
});
