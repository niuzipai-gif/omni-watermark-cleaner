import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { RemovalResult } from './removalRunner';
import type { WatermarkRegion } from './videoAnalysis';

const require = createRequire(import.meta.url);

export interface LocalCleanupRequest {
  inputPath: string;
  outputPath: string;
  region: WatermarkRegion;
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
    'veryfast',
    '-crf',
    '18',
    '-c:a',
    'copy',
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
