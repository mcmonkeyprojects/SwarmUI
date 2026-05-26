import type { GenerateParams } from '../api/types';

export const DEFAULT_UPSCALE_METHOD = 'pixel-lanczos';

export function isModelUpscaleMethod(value: unknown): value is string {
  return typeof value === 'string' && (value.startsWith('model-') || value.startsWith('latentmodel-'));
}

export function isPixelModelUpscaleMethod(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('model-');
}

export interface LegacyVaeSelection {
  appliedAutomaticVae: boolean;
}

export function applyLegacyVaeSelection<T extends GenerateParams>(params: T): LegacyVaeSelection {
  if (params.vae !== undefined && params.vae !== null && params.vae !== '' && params.vae !== 'Automatic') {
    return { appliedAutomaticVae: false };
  }

  delete params.vae;
  if (params.automaticvae === true) {
    return { appliedAutomaticVae: false };
  }

  params.automaticvae = true;
  return { appliedAutomaticVae: true };
}
