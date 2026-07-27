import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { removeWatermarkFromBuffer } from '@pilio/gemini-watermark-remover/node';
import sharp from 'sharp';

import { repairVisibleResidual, type RawImageData, type WatermarkRegion } from './imageResidualRepair';
import type { RemovalResult } from './removalRunner';

export interface ImageRemovalRequest {
  inputPath: string;
  outputPath: string;
}

export interface ImageRemovalMeta {
  applied: boolean;
  skipReason?: string | null;
  position?: WatermarkRegion | null;
  detection?: {
    residualVisibility?: {
      visible?: boolean;
    } | null;
  } | null;
}

export interface ImageEngineResult {
  buffer: Buffer;
  meta: ImageRemovalMeta;
  imageData?: RawImageData;
}

export interface ImageRemovalDependencies {
  readFile: (filePath: string) => Promise<Buffer>;
  writeFile: (filePath: string, data: Buffer) => Promise<void>;
  removeFile: (filePath: string, options: { force: true }) => Promise<void>;
  exists: (filePath: string) => boolean;
  remove: (input: Buffer, request: ImageRemovalRequest) => Promise<ImageEngineResult>;
  repair?: (processed: ImageEngineResult, request: ImageRemovalRequest) => Promise<Buffer | null>;
}

const defaultDependencies: ImageRemovalDependencies = {
  readFile,
  writeFile,
  removeFile: rm,
  exists: existsSync,
  remove: removeGeminiWatermark,
  repair: repairGeminiResidual
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
    let outputBuffer = processed.buffer;
    let meta: ImageRemovalMeta & { repair?: 'residual-repair' } = processed.meta;
    if (processed.meta.detection?.residualVisibility?.visible) {
      const repaired = await (dependencies.repair ?? repairGeminiResidual)(processed, request);
      if (!repaired) {
        throw new Error('Gemini watermark could not be fully removed without visible residuals.');
      }
      outputBuffer = repaired;
      meta = { ...processed.meta, repair: 'residual-repair' };
    }

    await dependencies.writeFile(request.outputPath, outputBuffer);
    if (!dependencies.exists(request.outputPath)) {
      throw new Error('Image cleanup did not create an output file.');
    }

    return {
      input: request.inputPath,
      output: request.outputPath,
      kind: 'image',
      meta: { ...meta }
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
    encodeImageData: (imageData) => encodeImageData(imageData, request.outputPath)
  });

  return {
    buffer: result.buffer,
    meta: result.meta as ImageRemovalMeta,
    imageData: result.imageData
  };
}

async function repairGeminiResidual(processed: ImageEngineResult, request: ImageRemovalRequest): Promise<Buffer | null> {
  const contourRepaired = await repairGeminiOutline(processed.imageData, processed.meta.position);
  const source = contourRepaired ?? processed.imageData;
  const patchRepaired = repairVisibleResidual(source, processed.meta.position);
  if (patchRepaired) return encodeImageData(patchRepaired, request.outputPath);
  if (contourRepaired) return encodeImageData(contourRepaired, request.outputPath);
  return null;
}

interface ContourRepairResult {
  accepted: boolean;
}

interface ContourRepairModule {
  repairDarkOutlineContour: (imageData: RawImageData, position: WatermarkRegion) => ContourRepairResult;
}

let contourRepairModule: Promise<ContourRepairModule | null> | undefined;

async function repairGeminiOutline(
  imageData: RawImageData | undefined,
  position: WatermarkRegion | null | undefined
): Promise<RawImageData | null> {
  if (!imageData || !position || position.width !== 96 || position.height !== 96) return null;

  const module = await loadContourRepairModule();
  if (!module) return null;

  const repaired: RawImageData = { ...imageData, data: Uint8ClampedArray.from(imageData.data) };
  let applied = false;
  for (let pass = 0; pass < 2; pass += 1) {
    const result = module.repairDarkOutlineContour(repaired, position);
    if (!result.accepted) break;
    applied = true;
  }

  return applied ? repaired : null;
}

function loadContourRepairModule(): Promise<ContourRepairModule | null> {
  if (!contourRepairModule) {
    contourRepairModule = (async () => {
      try {
        const nodeSdkPath = fileURLToPath(import.meta.resolve('@pilio/gemini-watermark-remover/node'));
        const repairPath = path.resolve(path.dirname(nodeSdkPath), '..', 'core', 'darkOutlineContourRepair.js');
        return await import(pathToFileURL(repairPath).href) as ContourRepairModule;
      } catch {
        return null;
      }
    })();
  }
  return contourRepairModule;
}

function encodeImageData(imageData: RawImageData, outputPath: string): Promise<Buffer> {
  let encoder = sharp(Buffer.from(imageData.data), {
    raw: {
      width: imageData.width,
      height: imageData.height,
      channels: 4
    }
  });

  switch (getOutputFormat(outputPath)) {
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
