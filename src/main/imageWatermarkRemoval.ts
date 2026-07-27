import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { removeWatermarkFromBuffer } from '@pilio/gemini-watermark-remover/node';
import sharp from 'sharp';

import type { RemovalResult } from './removalRunner';

export interface ImageRemovalRequest {
  inputPath: string;
  outputPath: string;
}

export interface ImageRemovalMeta {
  applied: boolean;
  skipReason?: string | null;
  position?: { x: number; y: number } | null;
}

export interface ImageEngineResult {
  buffer: Buffer;
  meta: ImageRemovalMeta;
}

export interface ImageRemovalDependencies {
  readFile: (filePath: string) => Promise<Buffer>;
  writeFile: (filePath: string, data: Buffer) => Promise<void>;
  removeFile: (filePath: string, options: { force: true }) => Promise<void>;
  exists: (filePath: string) => boolean;
  remove: (input: Buffer, request: ImageRemovalRequest) => Promise<ImageEngineResult>;
}

const defaultDependencies: ImageRemovalDependencies = {
  readFile,
  writeFile,
  removeFile: rm,
  exists: existsSync,
  remove: removeGeminiWatermark
};

export async function runImageWatermarkRemoval(
  request: ImageRemovalRequest,
  dependencies: ImageRemovalDependencies = defaultDependencies
): Promise<RemovalResult> {
  try {
    const input = await dependencies.readFile(request.inputPath);
    const processed = await dependencies.remove(input, request);

    if (!processed.meta.applied) {
      throw new Error(`Gemini watermark was not safely detected: ${processed.meta.skipReason ?? 'unknown reason'}`);
    }

    await dependencies.writeFile(request.outputPath, processed.buffer);
    if (!dependencies.exists(request.outputPath)) {
      throw new Error('Image cleanup did not create an output file.');
    }

    return {
      input: request.inputPath,
      output: request.outputPath,
      kind: 'image',
      meta: { ...processed.meta }
    };
  } catch (error) {
    await dependencies.removeFile(request.outputPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function removeGeminiWatermark(input: Buffer, request: ImageRemovalRequest): Promise<ImageEngineResult> {
  const result = await removeWatermarkFromBuffer(input, {
    mimeType: getMimeType(request.outputPath),
    filePath: request.outputPath,
    decodeImageData: async (buffer) => {
      const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      return {
        width: info.width,
        height: info.height,
        data: Uint8ClampedArray.from(data)
      };
    },
    encodeImageData: async (imageData) => {
      let encoder = sharp(Buffer.from(imageData.data), {
        raw: {
          width: imageData.width,
          height: imageData.height,
          channels: 4
        }
      });

      switch (getOutputFormat(request.outputPath)) {
        case 'jpeg':
          encoder = encoder.jpeg({ quality: 95 });
          break;
        case 'webp':
          encoder = encoder.webp({ quality: 95 });
          break;
        default:
          encoder = encoder.png();
      }

      return encoder.toBuffer();
    }
  });

  return {
    buffer: result.buffer,
    meta: result.meta as ImageRemovalMeta
  };
}

function getOutputFormat(filePath: string): 'jpeg' | 'png' | 'webp' {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') return 'jpeg';
  if (extension === '.webp') return 'webp';
  return 'png';
}

function getMimeType(filePath: string): string {
  const format = getOutputFormat(filePath);
  if (format === 'jpeg') return 'image/jpeg';
  if (format === 'webp') return 'image/webp';
  return 'image/png';
}
