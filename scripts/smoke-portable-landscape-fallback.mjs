import { _electron as electron, chromium } from 'playwright';
import { createReadStream } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(scriptsDir);
const executablePath = path.join(root, 'Omni-Watermark-Cleaner-Portable', 'app', 'Omni Watermark Cleaner.exe');
const inputPath = path.join(root, 'test-videos', 'landscape-16x9-fallback-check.mp4');
const outputDirectory = path.join(root, 'smoke-output');
const outputPath = path.join(outputDirectory, 'landscape-16x9-fallback-check-clean.mp4');
const userDataDir = path.join(root, 'smoke-user-data', 'landscape-fallback-smoke');

await rm(outputPath, { force: true });

const app = await electron.launch({
  executablePath,
  env: {
    ...process.env,
    OMNI_USER_DATA_DIR: userDataDir
  }
});

try {
  const win = await app.firstWindow({ timeout: 15000 });
  await win.waitForTimeout(2000);

  await win.evaluate(
    async ({ outputDirectory: nextOutputDirectory }) => {
      const settings = await window.omni.getSettings();
      await window.omni.saveSettings({
        ...settings,
        outputDirectory: nextOutputDirectory,
        videoPage: 'http://127.0.0.1:9/unavailable',
        timeoutMs: 1000,
        allowLowConfidence: true
      });
    },
    { outputDirectory }
  );

  const tasks = await win.evaluate((videoPath) => window.omni.enqueueVideos([videoPath]), inputPath);
  const task = tasks[0];
  const failures = [];

  if (!task) failures.push('No task returned from enqueueVideos');
  if (task?.status !== 'done') failures.push(`Expected done task, got ${task?.status}: ${task?.error ?? 'no error'}`);
  if (task?.outputPath !== outputPath) failures.push(`Unexpected outputPath: ${task?.outputPath}`);
  if (task?.result?.meta?.strategy !== 'local-region') failures.push(`Expected fallback local-region strategy, got ${task?.result?.meta?.strategy}`);
  if (task?.result?.meta?.metadata?.aspect !== 'landscape') failures.push(`Expected landscape aspect, got ${task?.result?.meta?.metadata?.aspect}`);
  if (!task?.result?.meta?.fallbackCause) failures.push('Expected fallbackCause to document public-page failure');

  let outputBytes = 0;
  try {
    outputBytes = (await stat(outputPath)).size;
  } catch (error) {
    failures.push(`Output file missing: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (outputBytes < 100000) failures.push(`Output file too small: ${outputBytes} bytes`);

  const outputMetadata = await readOutputVideoMetadata(outputPath);
  if (outputMetadata.width <= 0 || outputMetadata.height <= 0) {
    failures.push(`Output video has invalid dimensions: ${outputMetadata.width}x${outputMetadata.height}`);
  }
  if (!Number.isFinite(outputMetadata.duration) || outputMetadata.duration <= 0) {
    failures.push(`Output video has invalid duration: ${outputMetadata.duration}`);
  }
  if (outputMetadata.width <= outputMetadata.height) {
    failures.push(`Output video is not landscape: ${outputMetadata.width}x${outputMetadata.height}`);
  }

  if (failures.length > 0) {
    throw new Error(failures.join('\n'));
  }

  console.log(
    JSON.stringify(
      {
        status: 'OK',
        executablePath,
        inputPath,
        outputPath,
        userDataDir,
        outputBytes,
        outputMetadata,
        strategy: task.result.meta.strategy,
        aspect: task.result.meta.metadata.aspect,
        fallbackCause: task.result.meta.fallbackCause
      },
      null,
      2
    )
  );
} finally {
  await app.close().catch(() => undefined);
}

async function readOutputVideoMetadata(videoPath) {
  const server = await serveVideoFile(videoPath);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    try {
      return await page.evaluate(async (src) => {
        const video = document.createElement('video');
        video.muted = true;
        video.preload = 'metadata';
        document.body.appendChild(video);

        return await new Promise((resolve, reject) => {
          const timeout = window.setTimeout(() => reject(new Error('Timed out while reading output video metadata')), 30000);
          video.onloadedmetadata = () => {
            window.clearTimeout(timeout);
            resolve({
              width: video.videoWidth,
              height: video.videoHeight,
              duration: video.duration
            });
          };
          video.onerror = () => {
            window.clearTimeout(timeout);
            reject(new Error(video.error?.message ?? `Output video metadata load failed with code ${video.error?.code ?? 'unknown'}`));
          };
          video.src = src;
        });
      }, server.url);
    } finally {
      await page.close().catch(() => undefined);
    }
  } finally {
    await browser.close().catch(() => undefined);
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

async function serveVideoFile(videoPath) {
  const file = await stat(videoPath);
  const server = http.createServer((request, response) => {
    if (request.url !== '/video') {
      response.writeHead(404);
      response.end('not found');
      return;
    }

    response.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Content-Length': file.size,
      'Accept-Ranges': 'bytes'
    });
    createReadStream(videoPath).pipe(response);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (typeof address !== 'object' || address === null) {
    throw new Error('Unable to start local output video server');
  }
  server.url = `http://127.0.0.1:${address.port}/video`;
  return server;
}
