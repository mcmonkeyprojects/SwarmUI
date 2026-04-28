import type { BuilderRegionRule } from './types';
import { clamp, normalizeRegionRule, roundTo } from './compile';

export type CharacterLayoutPreset = 'single-center' | 'left-right' | 'left-center-right' | 'four-quadrant' | 'custom';

export interface CharacterRegionBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CharacterLoraSelection {
  name: string;
  weight: number;
}

export interface CharacterRegionDraft extends CharacterRegionBox {
  id: string;
  name: string;
  prompt: string;
  strength: number;
  useInpaint: boolean;
  inpaintStrength: number;
  loras: CharacterLoraSelection[];
  enabled: boolean;
}

export const CHARACTER_LAYOUT_PRESETS: Record<CharacterLayoutPreset, string> = {
  'single-center': 'Single center',
  'left-right': 'Left / right',
  'left-center-right': 'Left / center / right',
  'four-quadrant': 'Four quadrant',
  custom: 'Custom',
};

export function getDefaultCharacterLayoutPreset(count: number): CharacterLayoutPreset {
  if (count <= 1) {
    return 'single-center';
  }
  if (count === 2) {
    return 'left-right';
  }
  if (count === 3) {
    return 'left-center-right';
  }
  return 'four-quadrant';
}

export function getCharacterLayoutBoxes(count: number, preset: CharacterLayoutPreset): CharacterRegionBox[] {
  const normalizedCount = Math.max(1, Math.min(4, Math.round(count)));
  const effectivePreset = preset === 'custom' ? getDefaultCharacterLayoutPreset(normalizedCount) : preset;

  if (effectivePreset === 'single-center') {
    return [{ x: 0.2, y: 0.08, width: 0.6, height: 0.88 }].slice(0, normalizedCount);
  }

  if (effectivePreset === 'left-right') {
    return [
      { x: 0.03, y: 0.08, width: 0.46, height: 0.88 },
      { x: 0.51, y: 0.08, width: 0.46, height: 0.88 },
      { x: 0.27, y: 0.08, width: 0.46, height: 0.88 },
      { x: 0.27, y: 0.08, width: 0.46, height: 0.88 },
    ].slice(0, normalizedCount);
  }

  if (effectivePreset === 'left-center-right') {
    return [
      { x: 0.02, y: 0.08, width: 0.31, height: 0.88 },
      { x: 0.34, y: 0.05, width: 0.32, height: 0.9 },
      { x: 0.67, y: 0.08, width: 0.31, height: 0.88 },
      { x: 0.34, y: 0.08, width: 0.32, height: 0.88 },
    ].slice(0, normalizedCount);
  }

  return [
    { x: 0.03, y: 0.06, width: 0.46, height: 0.42 },
    { x: 0.51, y: 0.06, width: 0.46, height: 0.42 },
    { x: 0.03, y: 0.52, width: 0.46, height: 0.42 },
    { x: 0.51, y: 0.52, width: 0.46, height: 0.42 },
  ].slice(0, normalizedCount);
}

export function clampCharacterRegionBox(box: CharacterRegionBox): CharacterRegionBox {
  const x = roundTo(clamp(box.x, 0, 0.99));
  const y = roundTo(clamp(box.y, 0, 0.99));
  const width = roundTo(clamp(box.width, 0.01, 1 - x));
  const height = roundTo(clamp(box.height, 0.01, 1 - y));
  return { x, y, width, height };
}

export function createCharacterRegionDraft(index: number, box: CharacterRegionBox, partial: Partial<CharacterRegionDraft> = {}): CharacterRegionDraft {
  const normalizedBox = clampCharacterRegionBox(box);
  return {
    id: partial.id ?? `character-region-${index + 1}`,
    name: partial.name ?? `Character ${index + 1}`,
    prompt: partial.prompt ?? '',
    strength: partial.strength ?? 0.5,
    useInpaint: partial.useInpaint ?? false,
    inpaintStrength: partial.inpaintStrength ?? 0.5,
    loras: partial.loras ?? [],
    enabled: partial.enabled ?? true,
    ...normalizedBox,
  };
}

export function createCharacterRegionDrafts(count: number, preset: CharacterLayoutPreset): CharacterRegionDraft[] {
  return getCharacterLayoutBoxes(count, preset).map((box, index) => createCharacterRegionDraft(index, box));
}

export function buildCharacterPrompt(draft: CharacterRegionDraft): string {
  const loraText = draft.loras
    .filter((lora) => lora.name.trim())
    .map((lora) => `<lora:${lora.name.trim()}:${roundTo(clamp(lora.weight, -2, 2)).toFixed(2)}>`)
    .join(' ');
  const promptText = draft.prompt.trim();
  return [loraText, promptText].filter(Boolean).join(' ').trim();
}

export function buildCharacterRegionRules(drafts: CharacterRegionDraft[]): BuilderRegionRule[] {
  return drafts.map((draft, index) => {
    const normalizedBox = clampCharacterRegionBox(draft);
    return normalizeRegionRule({
      id: draft.id || `character-region-${index + 1}`,
      shape: 'rectangle',
      source: 'character',
      label: draft.name.trim() || `Character ${index + 1}`,
      x: normalizedBox.x,
      y: normalizedBox.y,
      width: normalizedBox.width,
      height: normalizedBox.height,
      strength: draft.strength,
      useInpaint: draft.useInpaint,
      inpaintStrength: draft.inpaintStrength,
      prompt: buildCharacterPrompt(draft),
      enabled: draft.enabled,
    });
  });
}
