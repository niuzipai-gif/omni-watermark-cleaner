export interface RawImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface WatermarkRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

const BORDER = 8;
const FEATHER = 10;
const SEARCH_RADIUS = 300;
const SEARCH_STEP = 4;
const MAX_BORDER_MSE = 900;

export function repairVisibleResidual(
  imageData: RawImageData,
  region: WatermarkRegion | null | undefined,
): RawImageData | null {
  if (!region || region.width < 32 || region.height < 32) return null;
  if (region.x < 0 || region.y < 0 || region.x + region.width > imageData.width || region.y + region.height > imageData.height) {
    return null;
  }

  const candidate = findMatchingPatch(imageData, region);
  if (!candidate || candidate.score > MAX_BORDER_MSE) return null;

  const repaired = Uint8ClampedArray.from(imageData.data);
  for (let y = 0; y < region.height; y += 1) {
    for (let x = 0; x < region.width; x += 1) {
      const edgeDistance = Math.min(x, y, region.width - 1 - x, region.height - 1 - y);
      const opacity = Math.min(1, Math.max(0, edgeDistance / FEATHER));
      const target = pixelIndex(imageData.width, region.x + x, region.y + y);
      const source = pixelIndex(imageData.width, candidate.x + x, candidate.y + y);
      for (let channel = 0; channel < 3; channel += 1) {
        repaired[target + channel] = Math.round(
          imageData.data[target + channel] * (1 - opacity) + imageData.data[source + channel] * opacity,
        );
      }
    }
  }

  return { ...imageData, data: repaired };
}

function findMatchingPatch(imageData: RawImageData, region: WatermarkRegion) {
  let best: { x: number; y: number; score: number } | null = null;
  const minX = Math.max(0, region.x - SEARCH_RADIUS);
  const maxX = Math.min(imageData.width - region.width, region.x + SEARCH_RADIUS);
  const minY = Math.max(0, region.y - SEARCH_RADIUS);
  const maxY = Math.min(imageData.height - region.height, region.y + SEARCH_RADIUS);

  for (let y = minY; y <= maxY; y += SEARCH_STEP) {
    for (let x = minX; x <= maxX; x += SEARCH_STEP) {
      if (overlapsWatermark(x, y, region)) continue;
      const score = scorePatchBorder(imageData, region, x, y);
      if (!best || score < best.score) best = { x, y, score };
    }
  }
  return best;
}

function overlapsWatermark(x: number, y: number, region: WatermarkRegion) {
  const padding = 16;
  return x < region.x + region.width + padding && x + region.width + padding > region.x && y < region.y + region.height + padding && y + region.height + padding > region.y;
}

function scorePatchBorder(imageData: RawImageData, region: WatermarkRegion, candidateX: number, candidateY: number) {
  let total = 0;
  let count = 0;
  for (let y = 0; y < region.height; y += 1) {
    for (let x = 0; x < region.width; x += 1) {
      if (x >= BORDER && x < region.width - BORDER && y >= BORDER && y < region.height - BORDER) continue;
      const target = pixelIndex(imageData.width, region.x + x, region.y + y);
      const candidate = pixelIndex(imageData.width, candidateX + x, candidateY + y);
      for (let channel = 0; channel < 3; channel += 1) {
        const delta = imageData.data[target + channel] - imageData.data[candidate + channel];
        total += delta * delta;
        count += 1;
      }
    }
  }
  return total / count;
}

function pixelIndex(width: number, x: number, y: number) {
  return (y * width + x) * 4;
}
