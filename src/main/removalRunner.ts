import { spawn } from 'node:child_process';
import path from 'node:path';
import type { Browser, Page } from 'playwright';

import { runLocalVideoCleanup } from './localVideoCleanup';
import { getDefaultWatermarkRegion, readVideoMetadataWithBrowser, type VideoMetadata } from './videoAnalysis';

export interface RemovalRequest {
  inputPath: string;
  outputPath: string;
  videoPage: string;
  timeoutMs: number;
  allowLowConfidence: boolean;
}

export interface ExecutorResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type RemovalExecutor = (command: string, args: string[]) => Promise<ExecutorResult>;
export type VideoPageProcessor = (request: RemovalRequest) => Promise<RemovalResult>;

export interface RemovalResult {
  input: string;
  output: string;
  kind: 'video' | 'image';
  meta?: Record<string, unknown> | null;
}

export type ProcessingStrategy = 'public-page' | 'local-region';

export function buildGwrArgs(request: RemovalRequest): string[] {
  const args = [
    'remove',
    request.inputPath,
    '--output',
    request.outputPath,
    '--overwrite',
    '--json',
    '--video-page',
    request.videoPage,
    '--video-timeout-ms',
    String(request.timeoutMs)
  ];

  if (request.allowLowConfidence) {
    args.push('--allow-low-confidence');
  }

  return args;
}

export function resolveGwrCommand(): string {
  const executable = process.platform === 'win32' ? 'gwr.cmd' : 'gwr';
  return path.join(process.cwd(), 'node_modules', '.bin', executable);
}

export async function runWatermarkRemoval(
  request: RemovalRequest,
  executor?: RemovalExecutor,
  videoPageProcessor: VideoPageProcessor = processVideoWithPublicPage
): Promise<RemovalResult> {
  if (!executor) {
    return videoPageProcessor(request);
  }

  const result = await executor(resolveGwrCommand(), buildGwrArgs(request));

  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `Watermark removal failed with exit code ${result.exitCode}`);
  }

  try {
    return JSON.parse(result.stdout) as RemovalResult;
  } catch (error) {
    throw new Error(`Watermark removal returned invalid JSON: ${result.stdout}`, { cause: error });
  }
}

export async function processVideoWithPublicPage(request: RemovalRequest): Promise<RemovalResult> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const startedAt = Date.now();

  try {
    const metadata = await readVideoMetadataWithBrowser(browser, request.inputPath);
    const strategy = selectProcessingStrategy(metadata);
    if (strategy === 'local-region') {
      const region = getDefaultWatermarkRegion(metadata);
      return runLocalCleanupWithMeta(request, metadata, region, strategy, startedAt);
    }

    try {
      return await processWithPublicPage(browser, request, metadata, strategy, startedAt);
    } catch (error) {
      if (!request.allowLowConfidence) {
        throw new Error(
          `High-quality public page cleanup failed. Enable "allow low confidence results" to use the local ffmpeg fallback. ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
      const region = getDefaultWatermarkRegion(metadata);
      return runLocalCleanupWithMeta(request, metadata, region, 'local-region', startedAt, error);
    }
  } finally {
    await closeBrowserQuietly(browser);
  }
}

export function selectProcessingStrategy(metadata: VideoMetadata): ProcessingStrategy {
  return 'public-page';
}

async function processWithPublicPage(
  browser: Browser,
  request: RemovalRequest,
  metadata: VideoMetadata,
  strategy: ProcessingStrategy,
  startedAt: number
): Promise<RemovalResult> {
  const page = await openVideoPageWithRetry(browser, request.videoPage, request.timeoutMs);
  page.setDefaultTimeout(request.timeoutMs);
  await page.locator('input[type="file"]').setInputFiles(request.inputPath);
  await page.getByText('Start local cleanup', { exact: true }).click();

  const downloadLink = page.locator('a[download][href^="blob:"]');
  await downloadLink.waitFor({ state: 'attached', timeout: request.timeoutMs });

  const downloadPromise = page.waitForEvent('download', { timeout: request.timeoutMs });
  await downloadLink.click();
  const download = await downloadPromise;
  await download.saveAs(request.outputPath);

  const downloadedName = await download.suggestedFilename();
  return {
    input: request.inputPath,
    output: request.outputPath,
    kind: 'video',
    meta: {
      status: 'processed with public video page',
      strategy,
      metadata,
      pagePath: request.videoPage,
      downloadedName,
      elapsedMs: Date.now() - startedAt
    }
  };
}

async function runLocalCleanupWithMeta(
  request: RemovalRequest,
  metadata: VideoMetadata,
  region: ReturnType<typeof getDefaultWatermarkRegion>,
  strategy: ProcessingStrategy,
  startedAt: number,
  fallbackCause?: unknown
): Promise<RemovalResult> {
  const result = await runLocalVideoCleanup({
    inputPath: request.inputPath,
    outputPath: request.outputPath,
    region
  });
  return {
    ...result,
    meta: {
      ...result.meta,
      strategy,
      metadata,
      fallbackCause: fallbackCause instanceof Error ? fallbackCause.message : fallbackCause ? String(fallbackCause) : null,
      elapsedMs: Date.now() - startedAt
    }
  };
}

async function openVideoPageWithRetry(
  browser: Browser,
  url: string,
  timeoutMs: number
): Promise<Page> {
  let lastError: unknown = null;
  const attempts = timeoutMs < 60_000 ? 1 : 6;
  const perAttemptTimeoutMs = Math.min(timeoutMs, 120_000);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const page = await browser.newPage({ acceptDownloads: true });
    page.setDefaultTimeout(timeoutMs);
    try {
      await gotoVideoPage(page, url, perAttemptTimeoutMs);
      return page;
    } catch (error) {
      lastError = error;
      await closePageQuietly(page);
      await new Promise((resolve) => setTimeout(resolve, 5000 * attempt));
    }
  }
  throw lastError;
}

async function gotoVideoPage(page: Page, url: string, timeoutMs: number): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  await page.locator('input[type="file"]').waitFor({ state: 'attached', timeout: timeoutMs });
}

async function closeBrowserQuietly(browser: Browser): Promise<void> {
  await Promise.race([browser.close(), delay(5000)]).catch(() => undefined);
}

async function closePageQuietly(page: Page): Promise<void> {
  await Promise.race([page.close(), delay(5000)]).catch(() => undefined);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function spawnExecutor(command: string, args: string[]): Promise<ExecutorResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      resolve({ stdout, stderr: stderr || error.message, exitCode: 1 });
    });
    child.on('close', (exitCode) => {
      resolve({ stdout, stderr, exitCode: exitCode ?? 1 });
    });
  });
}
