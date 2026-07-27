import { describe, expect, it, vi } from 'vitest';

import { runImageWatermarkRemoval } from './imageWatermarkRemoval';

describe('image watermark removal', () => {
  it('writes output when the engine applies Gemini cleanup', async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const result = await runImageWatermarkRemoval(
      { inputPath: 'F:/in/photo.png', outputPath: 'D:/out/photo-clean.png' },
      {
        readFile: vi.fn().mockResolvedValue(Buffer.from('input')),
        writeFile,
        exists: vi.fn().mockReturnValue(true),
        removeFile: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue({
          buffer: Buffer.from('clean'),
          meta: { applied: true, position: { x: 10, y: 20 } }
        })
      }
    );

    expect(result).toMatchObject({ kind: 'image', output: 'D:/out/photo-clean.png' });
    expect(writeFile).toHaveBeenCalledWith('D:/out/photo-clean.png', Buffer.from('clean'));
  });

  it('removes a partial output when no known Gemini mark was applied', async () => {
    const removeFile = vi.fn().mockResolvedValue(undefined);

    await expect(
      runImageWatermarkRemoval(
        { inputPath: 'F:/in/photo.png', outputPath: 'D:/out/photo-clean.png' },
        {
          readFile: vi.fn().mockResolvedValue(Buffer.from('input')),
          writeFile: vi.fn().mockResolvedValue(undefined),
          exists: vi.fn().mockReturnValue(true),
          removeFile,
          remove: vi.fn().mockResolvedValue({
            buffer: Buffer.from('unchanged'),
            meta: { applied: false, skipReason: 'watermark-not-found' }
          })
        }
      )
    ).rejects.toThrow('Gemini watermark was not safely detected');

    expect(removeFile).toHaveBeenCalledWith('D:/out/photo-clean.png', { force: true });
  });

  it('removes a partial output when a visible residual cannot be repaired', async () => {
    const removeFile = vi.fn().mockResolvedValue(undefined);

    await expect(
      runImageWatermarkRemoval(
        { inputPath: 'F:/in/photo.png', outputPath: 'D:/out/photo-clean.png' },
        {
          readFile: vi.fn().mockResolvedValue(Buffer.from('input')),
          writeFile: vi.fn().mockResolvedValue(undefined),
          exists: vi.fn().mockReturnValue(true),
          removeFile,
          remove: vi.fn().mockResolvedValue({
            buffer: Buffer.from('partial'),
            meta: {
              applied: true,
              detection: { residualVisibility: { visible: true } }
            }
          }),
          repair: vi.fn().mockResolvedValue(null)
        }
      )
    ).rejects.toThrow('could not be fully removed');

    expect(removeFile).toHaveBeenCalledWith('D:/out/photo-clean.png', { force: true });
  });

  it('writes a residual repair when the engine reports a visible residual', async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const repair = vi.fn().mockResolvedValue(Buffer.from('repaired'));

    const result = await runImageWatermarkRemoval(
      { inputPath: 'F:/in/photo.png', outputPath: 'D:/out/photo-clean.png' },
      {
        readFile: vi.fn().mockResolvedValue(Buffer.from('input')),
        writeFile,
        exists: vi.fn().mockReturnValue(true),
        removeFile: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue({
          buffer: Buffer.from('partial'),
          meta: {
            applied: true,
            position: { x: 10, y: 20, width: 96, height: 96 },
            detection: { residualVisibility: { visible: true } }
          }
        }),
        repair
      }
    );

    expect(repair).toHaveBeenCalledOnce();
    expect(writeFile).toHaveBeenCalledWith('D:/out/photo-clean.png', Buffer.from('repaired'));
    expect(result.meta).toMatchObject({ repair: 'residual-repair' });
  });
});
