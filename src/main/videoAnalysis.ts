import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';

import type { Browser } from 'playwright';

export type AspectRatioKind = 'landscape' | 'portrait' | 'square' | 'other';

export interface VideoDimensions {
  width: number;
  height: number;
}

export interface VideoMetadata extends VideoDimensions {
  duration: number;
  aspect: AspectRatioKind;
}

export interface WatermarkRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function classifyAspectRatio(dimensions: VideoDimensions): AspectRatioKind {
  const ratio = dimensions.width / dimensions.height;
  if (Math.abs(ratio - 16 / 9) <= 0.08) return 'landscape';
  if (Math.abs(ratio - 9 / 16) <= 0.08) return 'portrait';
  if (Math.abs(ratio - 1) <= 0.08) return 'square';
  return 'other';
}

export function getDefaultWatermarkRegion(metadata: Pick<VideoMetadata, 'width' | 'height' | 'aspect'>): WatermarkRegion {
  if (metadata.aspect === 'portrait') {
    return regionFromFractions(metadata, {
      rightMargin: 0.088,
      bottomMargin: 0.068,
      width: 0.116,
      height: 0.0755
    });
  }

  if (metadata.aspect === 'square') {
    return regionFromFractions(metadata, {
      rightMargin: 0.07,
      bottomMargin: 0.07,
      width: 0.32,
      height: 0.12
    });
  }

  if (metadata.aspect === 'other') {
    return regionFromFractions(metadata, {
      rightMargin: 0.06,
      bottomMargin: 0.06,
      width: 0.24,
      height: 0.11
    });
  }

  return regionFromFractions(metadata, {
    rightMargin: 0.03,
    bottomMargin: 0.06,
    width: 0.17,
    height: 0.12
  });
}

export async function readVideoMetadataWithBrowser(browser: Browser, inputPath: string): Promise<VideoMetadata> {
  const server = await serveVideoFile(inputPath);
  try {
    const page = await browser.newPage();
    try {
      const result = await page.evaluate(async (src) => {
        const video = document.createElement('video');
        video.muted = true;
        video.preload = 'metadata';
        document.body.appendChild(video);
        return await new Promise<{ duration: number; width: number; height: number }>((resolve, reject) => {
          const timeout = window.setTimeout(() => reject(new Error('Timed out while reading video metadata')), 30_000);
          video.onloadedmetadata = () => {
            window.clearTimeout(timeout);
            resolve({
              duration: video.duration,
              width: video.videoWidth,
              height: video.videoHeight
            });
          };
          video.onerror = () => {
            window.clearTimeout(timeout);
            reject(new Error(video.error?.message ?? `Video metadata load failed with code ${video.error?.code ?? 'unknown'}`));
          };
          video.src = src;
        });
      }, server.url);
      return {
        ...result,
        aspect: classifyAspectRatio(result)
      };
    } finally {
      await page.close().catch(() => undefined);
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

function regionFromFractions(
  dimensions: VideoDimensions,
  fractions: { rightMargin: number; bottomMargin: number; width: number; height: number }
): WatermarkRegion {
  const width = Math.round(dimensions.width * fractions.width);
  const height = Math.round(dimensions.height * fractions.height);
  const x = Math.round(dimensions.width * (1 - fractions.rightMargin) - width);
  const y = Math.round(dimensions.height * (1 - fractions.bottomMargin) - height);
  return { x, y, width, height };
}

async function serveVideoFile(inputPath: string): Promise<http.Server & { url: string }> {
  const server = http.createServer((request, response) => {
    if (request.url !== '/video') {
      response.writeHead(404);
      response.end('not found');
      return;
    }

    const size = statSync(inputPath).size;
    response.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Content-Length': size,
      'Accept-Ranges': 'bytes'
    });
    createReadStream(inputPath).pipe(response);
  }) as http.Server & { url: string };

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (typeof address !== 'object' || address === null) {
    throw new Error('Unable to start local metadata server');
  }
  server.url = `http://127.0.0.1:${address.port}/video`;
  return server;
}
