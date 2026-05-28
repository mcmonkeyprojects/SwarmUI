import {
  PROMPT_BUILDER_BLOCK_END,
  PROMPT_BUILDER_BLOCK_START,
  type BuilderRegionRule,
  type BuilderSegmentRule,
  type PromptBuilderCompileMeta,
  type PromptBuilderSnapshot,
} from './types';

interface ManagedBlockMatch {
  start: number;
  end: number;
  raw: string;
  inner: string;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function clampUnit(value: number): number {
  return clamp(value, 0, 1);
}

export function roundTo(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function normalizeRegionRule(rule: BuilderRegionRule): BuilderRegionRule {
  if (rule.shape === 'background') {
    return {
      ...rule,
      label: rule.label?.trim() ?? '',
      strength: roundTo(clamp(rule.strength, -1, 1)),
      inpaintStrength: roundTo(clamp(rule.inpaintStrength, 0, 1)),
    };
  }

  const x = clampUnit(rule.x);
  const y = clampUnit(rule.y);
  const width = clamp(rule.width, 0, 1 - x);
  const height = clamp(rule.height, 0, 1 - y);
  return {
    ...rule,
    label: rule.label?.trim() ?? '',
    x: roundTo(x),
    y: roundTo(y),
    width: roundTo(width),
    height: roundTo(height),
    strength: roundTo(clamp(rule.strength, -1, 1)),
    inpaintStrength: roundTo(clamp(rule.inpaintStrength, 0, 1)),
  };
}

export function normalizeRegionFromPixels(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  height: number,
): Pick<BuilderRegionRule, 'x' | 'y' | 'width' | 'height'> {
  if (width <= 0 || height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const right = Math.max(x1, x2);
  const bottom = Math.max(y1, y2);

  const nx = clampUnit(left / width);
  const ny = clampUnit(top / height);
  const nw = clamp(right / width - nx, 0, 1 - nx);
  const nh = clamp(bottom / height - ny, 0, 1 - ny);

  return {
    x: roundTo(nx),
    y: roundTo(ny),
    width: roundTo(nw),
    height: roundTo(nh),
  };
}

export function normalizedRegionToPixels(rule: BuilderRegionRule, width: number, height: number): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const normalized = normalizeRegionRule(rule);
  return {
    x: normalized.x * width,
    y: normalized.y * height,
    width: normalized.width * width,
    height: normalized.height * height,
  };
}

export type RegionResizeHandle =
  | 'move'
  | 'north'
  | 'south'
  | 'east'
  | 'west'
  | 'north-east'
  | 'north-west'
  | 'south-east'
  | 'south-west';

export function translateNormalizedRegion(
  rule: BuilderRegionRule,
  deltaX: number,
  deltaY: number,
): Pick<BuilderRegionRule, 'x' | 'y' | 'width' | 'height'> {
  const normalized = normalizeRegionRule(rule);
  const nextX = clamp(normalized.x + deltaX, 0, 1 - normalized.width);
  const nextY = clamp(normalized.y + deltaY, 0, 1 - normalized.height);
  return {
    x: roundTo(nextX),
    y: roundTo(nextY),
    width: normalized.width,
    height: normalized.height,
  };
}

export function resizeNormalizedRegion(
  rule: BuilderRegionRule,
  handle: RegionResizeHandle,
  deltaX: number,
  deltaY: number,
): Pick<BuilderRegionRule, 'x' | 'y' | 'width' | 'height'> {
  const normalized = normalizeRegionRule(rule);
  let left = normalized.x;
  let top = normalized.y;
  let right = normalized.x + normalized.width;
  let bottom = normalized.y + normalized.height;

  if (handle === 'move') {
    return translateNormalizedRegion(rule, deltaX, deltaY);
  }

  if (handle.includes('west')) {
    left = clamp(left + deltaX, 0, right - 0.01);
  }
  if (handle.includes('east')) {
    right = clamp(right + deltaX, left + 0.01, 1);
  }
  if (handle.includes('north')) {
    top = clamp(top + deltaY, 0, bottom - 0.01);
  }
  if (handle.includes('south')) {
    bottom = clamp(bottom + deltaY, top + 0.01, 1);
  }

  if (handle === 'north') {
    top = clamp(top + deltaY, 0, bottom - 0.01);
  }
  if (handle === 'south') {
    bottom = clamp(bottom + deltaY, top + 0.01, 1);
  }
  if (handle === 'east') {
    right = clamp(right + deltaX, left + 0.01, 1);
  }
  if (handle === 'west') {
    left = clamp(left + deltaX, 0, right - 0.01);
  }

  return {
    x: roundTo(left),
    y: roundTo(top),
    width: roundTo(clamp(right - left, 0.01, 1 - left)),
    height: roundTo(clamp(bottom - top, 0.01, 1 - top)),
  };
}

export function buildRegionTag(rule: BuilderRegionRule): string {
  const normalized = normalizeRegionRule(rule);
  if (normalized.shape === 'background') {
    const promptPart = normalized.prompt.trim() ? ` ${normalized.prompt.trim()}` : '';
    return `<region:background>${promptPart}`;
  }
  const tag = normalized.useInpaint ? 'object' : 'region';
  const inpaintPart = normalized.useInpaint ? `,${normalized.inpaintStrength.toFixed(2)}` : '';
  const promptPart = normalized.prompt.trim() ? ` ${normalized.prompt.trim()}` : '';
  return `<${tag}:${normalized.x.toFixed(2)},${normalized.y.toFixed(2)},${normalized.width.toFixed(2)},${normalized.height.toFixed(2)},${normalized.strength.toFixed(2)}${inpaintPart}>${promptPart}`;
}

export function buildSegmentModelText(rule: BuilderSegmentRule): string {
  if (rule.modelType === 'auto' || rule.modelType === 'anatomy-auto' || rule.modelType === 'grounded-sam2' || rule.modelType === 'clip-seg') {
    return rule.textMatch.trim();
  }

  let modelText = rule.yoloModel.trim();
  if (rule.yoloId > 0) {
    modelText += `-${rule.yoloId}`;
  }
  const classIds = rule.yoloClassIds.trim();
  if (classIds) {
    modelText += `:${classIds}:`;
  }
  return modelText;
}

export function buildSegmentTag(rule: BuilderSegmentRule): string {
  const modelText = buildSegmentModelText(rule);
  const thresholdText = rule.invertMask ? `-${roundTo(clampUnit(rule.threshold)).toFixed(2)}` : roundTo(clampUnit(rule.threshold)).toFixed(2);
  const creativityText = roundTo(clampUnit(rule.creativity)).toFixed(2);
  let line = `<segment:${modelText},${creativityText},${thresholdText}>`;
  if (rule.sampler.trim()) {
    line += `<param[sampler]:${rule.sampler.trim()}>`;
  }
  if (rule.scheduler.trim()) {
    line += `<param[scheduler]:${rule.scheduler.trim()}>`;
  }
  const supportsPrompt = rule.modelType === 'clip-seg' || rule.modelType === 'yolo';
  if (supportsPrompt && rule.prompt.trim()) {
    line += ` ${rule.prompt.trim()}`;
  }
  return line;
}

export function buildManagedSyntaxLines(snapshot: PromptBuilderSnapshot): string[] {
  const regionLines = snapshot.regions
    .filter((rule) => rule.enabled)
    .map((rule) => buildRegionTag(rule));

  const segmentLines = snapshot.segments
    .filter((rule) => rule.enabled)
    .map((rule) => buildSegmentTag(rule));

  return [...regionLines, ...segmentLines];
}

export function renderManagedBlock(lines: string[]): string {
  if (lines.length === 0) {
    return '';
  }

  return `${PROMPT_BUILDER_BLOCK_START}\n${lines.join('\n')}\n${PROMPT_BUILDER_BLOCK_END}`;
}

export function hashString(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function compilePromptBuilder(snapshot: PromptBuilderSnapshot): PromptBuilderCompileMeta {
  const managedLines = buildManagedSyntaxLines(snapshot);
  const managedBlock = renderManagedBlock(managedLines);
  return {
    managedBlock,
    managedLines,
    blockHash: hashString(managedBlock),
    hasContent: managedLines.length > 0,
    regionCount: snapshot.regions.filter((rule) => rule.enabled).length,
    segmentCount: snapshot.segments.filter((rule) => rule.enabled).length,
  };
}

export function extractManagedBlocks(prompt: string): ManagedBlockMatch[] {
  const matches: ManagedBlockMatch[] = [];
  let cursor = 0;
  while (cursor < prompt.length) {
    const start = prompt.indexOf(PROMPT_BUILDER_BLOCK_START, cursor);
    if (start === -1) {
      break;
    }
    const endTokenPos = prompt.indexOf(PROMPT_BUILDER_BLOCK_END, start + PROMPT_BUILDER_BLOCK_START.length);
    if (endTokenPos === -1) {
      break;
    }
    const end = endTokenPos + PROMPT_BUILDER_BLOCK_END.length;
    const raw = prompt.slice(start, end);
    const inner = prompt
      .slice(start + PROMPT_BUILDER_BLOCK_START.length, endTokenPos)
      .trim();
    matches.push({ start, end, raw, inner });
    cursor = end;
  }
  return matches;
}

export function extractPrimaryManagedBlock(prompt: string): ManagedBlockMatch | null {
  const blocks = extractManagedBlocks(prompt);
  if (blocks.length === 0) {
    return null;
  }
  return blocks[blocks.length - 1];
}

function normalizePromptSpacing(prompt: string): string {
  return prompt
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function stripManagedBlocks(prompt: string): string {
  const blocks = extractManagedBlocks(prompt);
  if (blocks.length === 0) {
    return prompt;
  }

  let result = prompt;
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    result = result.slice(0, block.start) + result.slice(block.end);
  }

  return normalizePromptSpacing(result);
}

export function upsertManagedBlock(prompt: string, managedBlock: string): string {
  const promptWithoutManagedBlock = stripManagedBlocks(prompt);
  if (!managedBlock.trim()) {
    return promptWithoutManagedBlock;
  }
  if (!promptWithoutManagedBlock.trim()) {
    return managedBlock;
  }
  return `${promptWithoutManagedBlock}\n\n${managedBlock}`;
}

export function hasManagedBlock(prompt: string): boolean {
  return extractManagedBlocks(prompt).length > 0;
}

export function detectManualOverride(prompt: string, expectedBlockHash: string): boolean {
  if (!expectedBlockHash) {
    return false;
  }
  const block = extractPrimaryManagedBlock(prompt);
  if (!block) {
    return true;
  }
  return hashString(block.raw) !== expectedBlockHash;
}
