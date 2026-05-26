import type { GenerateParams } from '../../api/types';
import { upsertManagedBlock } from '../promptBuilder';
import type { CanvasApplyPayload } from '../promptBuilder';

export const CANVAS_SAFE_GENERATE_KEYS = [
  'prompt',
  'negativeprompt',
  'images',
  'initimage',
  'initimagecreativity',
  'initimageresettonorm',
  'maskimage',
  'maskblur',
  'invertmask',
  'width',
  'height',
  'resizemode',
  'refinercontrol',
  'refinercontrolpercentage',
  'refinermethod',
  'refinerupscale',
  'refinerupscalemethod',
] as const;

export type CanvasSafeGenerateKey = (typeof CANVAS_SAFE_GENERATE_KEYS)[number];

export type CanvasSafeGeneratePatch = Partial<Pick<GenerateParams, CanvasSafeGenerateKey>>;

export function isCanvasSafeGenerateKey(key: string): key is CanvasSafeGenerateKey {
  return CANVAS_SAFE_GENERATE_KEYS.includes(key as CanvasSafeGenerateKey);
}

export function buildCanvasApplyPatch(payload: CanvasApplyPayload): CanvasSafeGeneratePatch {
  const patch: CanvasSafeGeneratePatch = {
    initimage: payload.initImageDataUrl || payload.sourceImageUrl,
    width: payload.sourceImageWidth,
    height: payload.sourceImageHeight,
  };

  if (payload.maskDataUrl) {
    patch.maskimage = payload.maskDataUrl;
  }

  if (payload.hasOutpaintCanvas) {
    patch.maskblur = 0;
  }

  return patch;
}

export function buildCanvasPrompt(basePrompt: string, payload: CanvasApplyPayload): string {
  const editPrompt = payload.editPrompt?.trim() ?? '';
  let nextPrompt = basePrompt;
  if (editPrompt && !basePrompt.toLowerCase().includes(editPrompt.toLowerCase())) {
    nextPrompt = basePrompt.trim() ? `${basePrompt.trim()}\n\n${editPrompt}` : editPrompt;
  }
  if (payload.mode !== 'regional' && !payload.managedBlock.trim()) {
    return nextPrompt;
  }
  return upsertManagedBlock(nextPrompt, payload.managedBlock);
}

export function buildCanvasRefinePatch(options: {
  initimage: string;
  initimagecreativity?: number;
  refinerupscale?: number;
  refinerupscalemethod?: string;
  refinermethod?: string;
}): CanvasSafeGeneratePatch {
  return {
    initimage: options.initimage,
    initimagecreativity: options.initimagecreativity ?? 0.1,
    refinerupscale: options.refinerupscale ?? 2,
    refinerupscalemethod: options.refinerupscalemethod ?? 'pixel-lanczos',
    refinermethod: options.refinermethod ?? 'PostApply',
    refinercontrol: 0,
    refinercontrolpercentage: 0,
    images: 1,
  };
}
