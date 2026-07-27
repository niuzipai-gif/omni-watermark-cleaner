import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { runImageWatermarkRemoval } from './imageWatermarkRemoval';
import type { RemovalResult } from './removalRunner';
import type { WatermarkRegion } from './videoAnalysis';

const require = createRequire(import.meta.url);

export interface LocalCleanupRequest {
  inputPath: string;
  outputPath: string;
  region: WatermarkRegion;
  durationSeconds?: number;
}

export interface FrameAccurateCleanupRequest extends LocalCleanupRequest {
  durationSeconds: number;
}

export function buildLocalCleanupFfmpegArgs(request: LocalCleanupRequest): string[] {
  const { x, y, width, height } = request.region;
  return [
    '-y',
    '-i',
    request.inputPath,
    '-filter_complex',
    `[0:v]delogo=x=${x}:y=${y}:w=${width}:h=${height}:show=0[v]`,
    '-map',
    '[v]',
    '-map',
    '0:a?',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '15',
    '-c:a',
    'copy',
    request.outputPath
  ];
}

export function buildFrameEncodeFfmpegArgs(request: { framesDirectory: string; inputPath: string; outputPath: string; frameRate: number }): string[] {
  return [
    '-y',
    '-framerate',
    String(request.frameRate),
    '-i',
    path.join(request.framesDirectory, 'frame-%08d.png'),
    '-i',
    request.inputPath,
    '-map',
    '0:v:0',
    '-map',
    '1:a?',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '15',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'copy',
    '-shortest',
    request.outputPath
  ];
}

export function resolveFfmpegPath(resourcesPath = process.resourcesPath): string {
  const candidates = [
    resolveFfmpegStaticPath(),
    resourcesPath ? path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe') : null,
    path.join(process.cwd(), 'release', 'win-unpacked', 'resources', 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe')
  ].filter((candidate): candidate is string => Boolean(candidate));
  return resolveFfmpegPathFromCandidates(candidates, existsSync);
}

export function resolveFfmpegPathFromCandidates(candidates: string[], exists: (candidate: string) => boolean): string {
  const sortedCandidates = [...candidates].sort((left, right) => Number(isFfmpegStaticPath(right)) - Number(isFfmpegStaticPath(left)));
  const candidate = sortedCandidates.find((item) => exists(item));
  if (!candidate) {
    throw new Error('Bundled ffmpeg was not found. Rebuild the portable package before processing non-16:9 videos.');
  }
  return candidate;
}

function isFfmpegStaticPath(candidate: string): boolean {
  return candidate.replace(/\\/g, '/').includes('/node_modules/ffmpeg-static/');
}

function resolveFfmpegStaticPath(): string | null {
  try {
    return require('ffmpeg-static') as string;
  } catch {
    return null;
  }
}

export async function runLocalVideoCleanup(request: LocalCleanupRequest): Promise<RemovalResult> {
  const ffmpegPath = resolveFfmpegPath();
  const args = buildLocalCleanupFfmpegArgs(request);
  const result = await runProcess(ffmpegPath, args);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || `Local video cleanup failed with exit code ${result.exitCode}`);
  }
  return {
    input: request.inputPath,
    output: request.outputPath,
    kind: 'video',
    meta: {
      status: 'processed with local aspect-aware delogo',
      region: request.region
    }
  };
}

export async function runFrameAccurateVideoCleanup(request: FrameAccurateCleanupRequest): Promise<RemovalResult> {
  const ffmpegPath = resolveFfmpegPath();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'omni-frame-cleanup-'));
  const sourceFrames = path.join(tempRoot, 'source');
  const cleanedFrames = path.join(tempRoot, 'cleaned');

  try {
    await mkdir(sourceFrames, { recursive: true });
    await mkdir(cleanedFrames, { recursive: true });
    const extraction = await runProcess(ffmpegPath, ['-y', '-i', request.inputPath, '-map', '0:v:0', path.join(sourceFrames, 'frame-%08d.png')]);
    if (extraction.exitCode !== 0) {
      throw new Error(extraction.stderr.trim() || `Video frame decoding failed with exit code ${extraction.exitCode}`);
    }
    const frames = (await readdir(sourceFrames)).filter((name) => name.endsWith('.png')).sort();
    if (frames.length === 0) throw new Error('Could not decode any video frames for Gemini cleanup.');

    const appliedFrames = (await mapWithConcurrency(frames, 4, async (frame) => {
      const sourcePath = path.join(sourceFrames, frame);
      const cleanedPath = path.join(cleanedFrames, frame);
      try {
        await runImageWatermarkRemoval({ inputPath: sourcePath, outputPath: cleanedPath });
        return true;
      } catch {
        await copyFile(sourcePath, cleanedPath);
        return false;
      }
    })).filter(Boolean).length;

    if (appliedFrames === 0) {
      throw new Error('The exact Gemini watermark was not detected in the decoded video frames.');
    }

    const frameRate = Math.max(1, Math.min(120, Number((frames.length / request.durationSeconds).toFixed(3))));
    const result = await runProcess(ffmpegPath, buildFrameEncodeFfmpegArgs({
      framesDirectory: cleanedFrames,
      inputPath: request.inputPath,
      outputPath: request.outputPath,
      frameRate
    }));
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || `Frame-accurate video cleanup failed with exit code ${result.exitCode}`);
    }

    return {
      input: request.inputPath,
      output: request.outputPath,
      kind: 'video',
      meta: {
        status: 'processed with frame-accurate Gemini cleanup',
        frameCount: frames.length,
        appliedFrames,
        frameRate
      }
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function runProcess(command: string, args: string[]): Promise<{ exitCode: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe']
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      resolve({ exitCode: 1, stderr: error.message });
    });
    child.on('close', (exitCode) => {
      resolve({ exitCode: exitCode ?? 1, stderr });
    });
  });
}

async function mapWithConcurrency<T, Result>(items: T[], concurrency: number, worker: (item: T) => Promise<Result>): Promise<Result[]> {
  const results = new Array<Result>(items.length);
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex]);
    }
  });
  await Promise.all(runners);
  return results;
}
