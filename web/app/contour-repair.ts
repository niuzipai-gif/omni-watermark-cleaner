import type { RawImageData, WatermarkRegion } from "./residual-repair";

interface ContourResult {
  accepted: boolean;
}

interface ContourModule {
  repairDarkOutlineContour: (imageData: RawImageData, position: WatermarkRegion) => ContourResult;
}

export async function repairDarkOutline(
  imageData: RawImageData,
  position: WatermarkRegion | null | undefined,
) {
  if (!position || position.width !== 96 || position.height !== 96) return false;

  const contourModule = await import("../node_modules/@pilio/gemini-watermark-remover/src/core/darkOutlineContourRepair.js") as ContourModule;
  let applied = false;
  for (let pass = 0; pass < 2; pass += 1) {
    const result = contourModule.repairDarkOutlineContour(imageData, position);
    if (!result.accepted) break;
    applied = true;
  }
  return applied;
}
