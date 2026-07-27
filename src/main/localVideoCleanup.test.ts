import { describe, expect, it } from 'vitest';

import { buildLocalCleanupFfmpegArgs, resolveFfmpegPathFromCandidates } from './localVideoCleanup';

describe('local video cleanup', () => {
  it('builds ffmpeg args that interpolate the detected watermark region', () => {
    const args = buildLocalCleanupFfmpegArgs({
      inputPath: 'F:/in/portrait.mp4',
      outputPath: 'D:/out/portrait-clean.mp4',
      region: { x: 860, y: 1644, width: 125, height: 145 }
    });

    expect(args).toEqual([
      '-y',
      '-i',
      'F:/in/portrait.mp4',
      '-filter_complex',
      '[0:v]delogo=x=860:y=1644:w=125:h=145:show=0[v]',
      '-map',
      '[v]',
      '-map',
      '0:a?',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '18',
      '-c:a',
      'copy',
      'D:/out/portrait-clean.mp4'
    ]);
  });

  it('prefers ffmpeg-static candidates over other bundled ffmpeg binaries', () => {
    const path = resolveFfmpegPathFromCandidates(
      [
        'F:/omni/release/win-unpacked/resources/ms-playwright/ffmpeg-1011/ffmpeg-win64.exe',
        'F:/omni/release/win-unpacked/resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg.exe'
      ],
      () => true
    );

    expect(path).toBe('F:/omni/release/win-unpacked/resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg.exe');
  });
});
