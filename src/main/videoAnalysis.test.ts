import { describe, expect, it } from 'vitest';

import { classifyAspectRatio, getDefaultWatermarkRegion } from './videoAnalysis';

describe('video analysis', () => {
  it('classifies common video aspect ratios', () => {
    expect(classifyAspectRatio({ width: 1920, height: 1080 })).toBe('landscape');
    expect(classifyAspectRatio({ width: 1080, height: 1920 })).toBe('portrait');
    expect(classifyAspectRatio({ width: 1080, height: 1080 })).toBe('square');
    expect(classifyAspectRatio({ width: 1440, height: 1080 })).toBe('other');
  });

  it('uses lower-right watermark regions scaled to the aspect ratio', () => {
    expect(getDefaultWatermarkRegion({ width: 1920, height: 1080, aspect: 'landscape' })).toEqual({
      x: 1536,
      y: 885,
      width: 326,
      height: 130
    });
    expect(getDefaultWatermarkRegion({ width: 1080, height: 1920, aspect: 'portrait' })).toEqual({
      x: 860,
      y: 1644,
      width: 125,
      height: 145
    });
  });
});
