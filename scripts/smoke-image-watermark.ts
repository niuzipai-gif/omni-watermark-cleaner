import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

import { runImageWatermarkRemoval } from '../src/main/imageWatermarkRemoval';

const outputDirectory = path.resolve('F:\\omni\\test-results\\image-watermark-final');
const expectedOutputDirectory = path.resolve('F:\\omni\\test-results\\image-watermark-final');
const samples = [
  'C:\\Users\\Administrator\\Downloads\\Gemini_Generated_Image_8peke8peke8peke8.png',
  'C:\\Users\\Administrator\\Downloads\\Gemini_Generated_Image_8peke8peke8peke8 (1).png',
  'C:\\Users\\Administrator\\Downloads\\Gemini_Generated_Image_vxvyl1vxvyl1vxvy.png',
  'C:\\Users\\Administrator\\Downloads\\Gemini_Generated_Image_8peke8peke8peke8 (3).png',
  'C:\\Users\\Administrator\\Downloads\\Gemini_Generated_Image_8peke8peke8peke8 (2).png'
];

interface ReportItem {
  source: string;
  output: string | null;
  width: number | null;
  height: number | null;
  hasAlpha: boolean | null;
  decisionTier: string | null;
  detectionSource: string | null;
  elapsedMs: number;
  error: string | null;
}

async function main(): Promise<void> {
  const manifest = { samples, outputDirectory, sourcesExist: samples.map((source) => ({ source, exists: existsSync(source) })) };
  if (process.argv.includes('--dry-run')) {
    console.log(JSON.stringify(manifest, null, 2));
    if (manifest.sourcesExist.some((item) => !item.exists)) process.exitCode = 1;
    return;
  }

  if (outputDirectory !== expectedOutputDirectory) {
    throw new Error(`Refusing to clean an unexpected output directory: ${outputDirectory}`);
  }
  if (manifest.sourcesExist.some((item) => !item.exists)) {
    throw new Error('One or more approved image samples are missing. Run with --dry-run for details.');
  }

  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });

  const report: ReportItem[] = [];
  for (const source of samples) {
    const output = path.join(outputDirectory, `${path.parse(source).name}-clean.png`);
    const startedAt = Date.now();

    try {
      const sourceMetadata = await sharp(source).metadata();
      const result = await runImageWatermarkRemoval({ inputPath: source, outputPath: output });
      const outputMetadata = await sharp(output).metadata();

      if (!result.meta?.applied) throw new Error('The Gemini engine did not report an applied cleanup.');
      if (sourceMetadata.width !== outputMetadata.width || sourceMetadata.height !== outputMetadata.height) {
        throw new Error(`Dimension mismatch: ${sourceMetadata.width}x${sourceMetadata.height} -> ${outputMetadata.width}x${outputMetadata.height}`);
      }
      if (sourceMetadata.hasAlpha !== outputMetadata.hasAlpha) {
        throw new Error(`Alpha mismatch: ${String(sourceMetadata.hasAlpha)} -> ${String(outputMetadata.hasAlpha)}`);
      }

      report.push({
        source,
        output,
        width: outputMetadata.width ?? null,
        height: outputMetadata.height ?? null,
        hasAlpha: outputMetadata.hasAlpha ?? null,
        decisionTier: typeof result.meta.decisionTier === 'string' ? result.meta.decisionTier : null,
        detectionSource: typeof result.meta.source === 'string' ? result.meta.source : null,
        elapsedMs: Date.now() - startedAt,
        error: null
      });
    } catch (error) {
      await rm(output, { force: true });
      report.push({
        source,
        output: null,
        width: null,
        height: null,
        hasAlpha: null,
        decisionTier: null,
        detectionSource: null,
        elapsedMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  await writeFile(path.join(outputDirectory, 'report.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), report }, null, 2)}\n`, 'utf8');

  const failures = report.filter((item) => item.error);
  if (failures.length > 0) {
    process.exitCode = 1;
    return;
  }

  await createComparisonSheet(report);
  console.log(JSON.stringify({ outputDirectory, processed: report.length }, null, 2));
}

async function createComparisonSheet(report: ReportItem[]): Promise<void> {
  const tileSize = 220;
  const rows = report.length;
  const canvas = sharp({
    create: {
      width: tileSize * 2,
      height: tileSize * rows,
      channels: 4,
      background: '#f7f8fb'
    }
  });
  const composites: sharp.OverlayOptions[] = [];

  for (let index = 0; index < report.length; index += 1) {
    const item = report[index];
    if (!item.output) continue;
    const before = await createWatermarkCrop(item.source, tileSize);
    const after = await createWatermarkCrop(item.output, tileSize);
    composites.push({ input: before, left: 0, top: index * tileSize });
    composites.push({ input: after, left: tileSize, top: index * tileSize });
  }

  await canvas.composite(composites).png().toFile(path.join(outputDirectory, 'watermark-comparison.png'));
}

async function createWatermarkCrop(input: string, tileSize: number): Promise<Buffer> {
  const metadata = await sharp(input).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const cropWidth = Math.min(width, 420);
  const cropHeight = Math.min(height, 420);
  return sharp(input)
    .extract({ left: width - cropWidth, top: height - cropHeight, width: cropWidth, height: cropHeight })
    .resize({ width: tileSize, height: tileSize, fit: 'contain', background: '#f7f8fb' })
    .png()
    .toBuffer();
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
