import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { ProcessingQueue } from './processingQueue';

describe('processing queue', () => {
  it('rejects unsupported files before invoking the runner', async () => {
    const runner = vi.fn();
    const queue = new ProcessingQueue({ runner, exists: () => false });
    const events: unknown[] = [];
    queue.on('task-updated', (task) => events.push(task));

    const tasks = await queue.enqueue(['F:/in/frame.txt'], {
      outputDirectory: 'D:/exports',
      videoPage: 'https://geminiwatermarkremover.io/video',
      timeoutMs: 900000,
      allowLowConfidence: false
    });

    expect(tasks[0].status).toBe('failed');
    expect(tasks[0].error).toContain('Unsupported media file');
    expect(runner).not.toHaveBeenCalled();
    expect(events).toHaveLength(1);
  });

  it('processes supported videos with a generated clean output path', async () => {
    const runner = vi.fn().mockResolvedValue({ output: 'D:\\exports\\clip-clean.mp4', input: 'F:/in/clip.mp4', kind: 'video' });
    const queue = new ProcessingQueue({ runner, exists: () => false });
    const statuses: string[] = [];
    queue.on('task-updated', (task) => statuses.push(task.status));

    const tasks = await queue.enqueue(['F:/in/clip.mp4'], {
      outputDirectory: 'D:/exports',
      videoPage: 'https://geminiwatermarkremover.io/video',
      timeoutMs: 900000,
      allowLowConfidence: true
    });

    expect(tasks[0]).toMatchObject({
      inputPath: 'F:/in/clip.mp4',
      outputPath: 'D:\\exports\\clip-clean.mp4'
    });
    expect(runner).toHaveBeenCalledWith({
      inputPath: 'F:/in/clip.mp4',
      outputPath: 'D:\\exports\\clip-clean.mp4',
      videoPage: 'https://geminiwatermarkremover.io/video',
      timeoutMs: 900000,
      allowLowConfidence: true
    });
    expect(statuses).toEqual(['queued', 'processing', 'done']);
  });

  it('retries transient runner failures before marking a supported video done', async () => {
    const runner = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary page failure'))
      .mockRejectedValueOnce(new Error('download was not ready'))
      .mockResolvedValue({ output: 'D:\\exports\\clip-clean.mp4', input: 'F:/in/clip.mp4', kind: 'video' });
    const queue = new ProcessingQueue({ runner, exists: () => false });

    const tasks = await queue.enqueue(['F:/in/clip.mp4'], {
      outputDirectory: 'D:/exports',
      videoPage: 'https://geminiwatermarkremover.io/video',
      timeoutMs: 900000,
      allowLowConfidence: false
    });

    expect(runner).toHaveBeenCalledTimes(3);
    expect(tasks[0]).toMatchObject({
      status: 'done',
      error: null,
      result: { output: 'D:\\exports\\clip-clean.mp4' }
    });
  });

  it('does not retry high-quality public page failures when local fallback is disabled', async () => {
    const runner = vi.fn().mockRejectedValue(new Error('High-quality public page cleanup failed. Enable "allow low confidence results" to use the local ffmpeg fallback.'));
    const queue = new ProcessingQueue({ runner, exists: () => false });

    const tasks = await queue.enqueue(['F:/in/clip.mp4'], {
      outputDirectory: 'D:/exports',
      videoPage: 'https://geminiwatermarkremover.io/video',
      timeoutMs: 900000,
      allowLowConfidence: false
    });

    expect(runner).toHaveBeenCalledTimes(1);
    expect(tasks[0]).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('High-quality public page cleanup failed')
    });
  });

  it('fails a task when the runner exceeds the processing timeout budget', async () => {
    const runner = vi.fn().mockImplementation(() => new Promise(() => undefined));
    const queue = new ProcessingQueue({ runner, exists: () => false, timeoutGraceMs: 0 });

    const tasks = await queue.enqueue(['F:/in/clip.mp4'], {
      outputDirectory: 'D:/exports',
      videoPage: 'https://geminiwatermarkremover.io/video',
      timeoutMs: 1,
      allowLowConfidence: false
    });

    expect(runner).toHaveBeenCalledTimes(1);
    expect(tasks[0]).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('Processing timed out')
    });
  });

  it('creates the output directory before processing videos', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'omni-queue-'));
    const outputDirectory = path.join(dir, 'missing-output');
    const runner = vi.fn().mockResolvedValue({ output: path.join(outputDirectory, 'clip-clean.mp4'), input: 'F:/in/clip.mp4', kind: 'video' });
    const queue = new ProcessingQueue({ runner, exists: () => false });

    try {
      await queue.enqueue(['F:/in/clip.mp4'], {
        outputDirectory,
        videoPage: 'https://geminiwatermarkremover.io/video',
        timeoutMs: 900000,
        allowLowConfidence: false
      });

      await expect(stat(outputDirectory)).resolves.toMatchObject({ isDirectory: expect.any(Function) });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('dispatches PNG input to the image runner without video-page settings', async () => {
    const imageRunner = vi.fn().mockResolvedValue({
      input: 'F:/in/photo.png',
      output: 'D:\\exports\\photo-clean.png',
      kind: 'image'
    });
    const videoRunner = vi.fn().mockResolvedValue({
      input: 'F:/in/photo.png',
      output: 'D:\\exports\\photo-clean.png',
      kind: 'video'
    });
    const queue = new ProcessingQueue({ runner: videoRunner, imageRunner, videoRunner, exists: () => false });

    const [task] = await queue.enqueue(['F:/in/photo.png'], {
      outputDirectory: 'D:/exports',
      videoPage: 'https://geminiwatermarkremover.io/video',
      timeoutMs: 900000,
      allowLowConfidence: false
    });

    expect(task).toMatchObject({ mediaKind: 'image', status: 'done' });
    expect(imageRunner).toHaveBeenCalledWith({
      inputPath: 'F:/in/photo.png',
      outputPath: 'D:\\exports\\photo-clean.png'
    });
    expect(videoRunner).not.toHaveBeenCalled();
  });

  it('reports unsupported non-media files without invoking either runner', async () => {
    const imageRunner = vi.fn();
    const videoRunner = vi.fn();
    const queue = new ProcessingQueue({ runner: videoRunner, imageRunner, videoRunner, exists: () => false });

    const [task] = await queue.enqueue(['F:/in/notes.txt'], {
      outputDirectory: 'D:/exports',
      videoPage: 'https://geminiwatermarkremover.io/video',
      timeoutMs: 900000,
      allowLowConfidence: false
    });

    expect(task.error).toContain('Unsupported media file');
    expect(imageRunner).not.toHaveBeenCalled();
    expect(videoRunner).not.toHaveBeenCalled();
  });
});
