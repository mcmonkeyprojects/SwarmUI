import { describe, expect, it } from 'vitest';
import {
  PROMPT_BUILDER_BLOCK_END,
  PROMPT_BUILDER_BLOCK_START,
  type BuilderRegionRule,
  type BuilderSegmentRule,
} from './types';
import {
  buildRegionTag,
  buildSegmentTag,
  extractManagedBlocks,
  extractPrimaryManagedBlock,
  hasManagedBlock,
  normalizeRegionFromPixels,
  normalizeRegionRule,
  resizeNormalizedRegion,
  renderManagedBlock,
  stripManagedBlocks,
  translateNormalizedRegion,
  upsertManagedBlock,
} from './compile';

function makeRegion(overrides: Partial<BuilderRegionRule> = {}): BuilderRegionRule {
  return {
    id: 'region-1',
    shape: 'rectangle',
    x: 0.1,
    y: 0.2,
    width: 0.3,
    height: 0.4,
    strength: 0.5,
    useInpaint: false,
    inpaintStrength: 0.5,
    prompt: 'tree',
    enabled: true,
    ...overrides,
  };
}

function makeSegment(overrides: Partial<BuilderSegmentRule> = {}): BuilderSegmentRule {
  return {
    id: 'segment-1',
    modelType: 'clip-seg',
    textMatch: 'face',
    yoloModel: '',
    yoloId: 0,
    yoloClassIds: '',
    creativity: 0.6,
    threshold: 0.4,
    invertMask: false,
    prompt: 'sharp skin details',
    sampler: '',
    scheduler: '',
    enabled: true,
    ...overrides,
  };
}

describe('promptBuilder compile utilities', () => {
  it('normalizes and clamps region coordinates and strengths', () => {
    const normalized = normalizeRegionRule(
      makeRegion({
        x: -0.2,
        y: 1.4,
        width: 2.3,
        height: 5.5,
        strength: 2,
        inpaintStrength: -1,
      }),
    );

    expect(normalized.x).toBe(0);
    expect(normalized.y).toBe(1);
    expect(normalized.width).toBe(1);
    expect(normalized.height).toBe(0);
    expect(normalized.strength).toBe(1);
    expect(normalized.inpaintStrength).toBe(0);
  });

  it('converts pixel bounds to normalized coordinates', () => {
    const normalized = normalizeRegionFromPixels(20, 40, 120, 140, 200, 200);
    expect(normalized).toEqual({
      x: 0.1,
      y: 0.2,
      width: 0.5,
      height: 0.5,
    });
  });

  it('builds <region:...> and <object:...> lines correctly', () => {
    const region = buildRegionTag(makeRegion({ useInpaint: false, prompt: 'castle' }));
    const object = buildRegionTag(
      makeRegion({
        useInpaint: true,
        inpaintStrength: 0.77,
        prompt: 'replace face',
      }),
    );

    expect(region).toBe('<region:0.10,0.20,0.30,0.40,0.50> castle');
    expect(object).toBe('<object:0.10,0.20,0.30,0.40,0.50,0.77> replace face');
  });

  it('builds the backend-supported background region syntax', () => {
    const background = buildRegionTag(makeRegion({
      shape: 'background',
      label: 'Background',
      prompt: 'misty forest behind the characters',
    }));

    expect(background).toBe('<region:background> misty forest behind the characters');
  });

  it('moves and resizes normalized regions while staying within bounds', () => {
    expect(translateNormalizedRegion(makeRegion(), 0.2, -0.1)).toEqual({
      x: 0.3,
      y: 0.1,
      width: 0.3,
      height: 0.4,
    });

    expect(resizeNormalizedRegion(makeRegion(), 'south-east', 0.4, 0.5)).toEqual({
      x: 0.1,
      y: 0.2,
      width: 0.7,
      height: 0.8,
    });

    expect(resizeNormalizedRegion(makeRegion(), 'north-west', -0.5, -0.5)).toEqual({
      x: 0,
      y: 0,
      width: 0.4,
      height: 0.6,
    });
  });

  it('builds text-detector and YOLO segment syntax lines correctly', () => {
    const auto = buildSegmentTag(
      makeSegment({
        modelType: 'auto',
        textMatch: 'hands',
        creativity: 0.65,
        threshold: 0.35,
      }),
    );
    const grounded = buildSegmentTag(
      makeSegment({
        modelType: 'grounded-sam2',
        textMatch: 'breasts',
        creativity: 0.65,
        threshold: 0.3,
      }),
    );
    const anatomyAuto = buildSegmentTag(
      makeSegment({
        modelType: 'anatomy-auto',
        textMatch: 'vulva',
        creativity: 0.65,
        threshold: 0.3,
      }),
    );
    const clip = buildSegmentTag(
      makeSegment({
        modelType: 'clip-seg',
        textMatch: 'face',
        creativity: 0.65,
        threshold: 0.4,
        prompt: 'more detail',
      }),
    );
    const yolo = buildSegmentTag(
      makeSegment({
        modelType: 'yolo',
        yoloModel: 'yolov8n',
        yoloId: 2,
        yoloClassIds: '0,1',
        creativity: 0.7,
        threshold: 0.5,
        invertMask: true,
        sampler: 'euler',
        scheduler: 'karras',
        prompt: 'restore',
      }),
    );

    expect(auto).toBe('<segment:hands,0.65,0.35>');
    expect(grounded).toBe('<segment:breasts,0.65,0.30>');
    expect(anatomyAuto).toBe('<segment:vulva,0.65,0.30>');
    expect(clip).toBe('<segment:face,0.65,0.40> more detail');
    expect(yolo).toBe('<segment:yolov8n-2:0,1:,0.70,-0.50><param[sampler]:euler><param[scheduler]:karras> restore');
  });

  it('inserts or replaces managed block without mutating other prompt text', () => {
    const blockA = renderManagedBlock(['<region:0.10,0.10,0.30,0.30,0.50> cat']);
    const blockB = renderManagedBlock(['<region:0.20,0.20,0.40,0.40,0.60> dog']);

    const withBlock = upsertManagedBlock('user prompt text', blockA);
    expect(withBlock).toBe(`user prompt text\n\n${blockA}`);

    const replaced = upsertManagedBlock(withBlock, blockB);
    expect(replaced).toBe(`user prompt text\n\n${blockB}`);
  });

  it('ignores region labels when compiling managed syntax', () => {
    const block = renderManagedBlock([
      buildRegionTag(makeRegion({ label: 'Character A', prompt: 'red shirt' })),
    ]);

    expect(block).toContain('<region:0.10,0.20,0.30,0.40,0.50> red shirt');
    expect(block).not.toContain('Character A');
  });

  it('extracts managed blocks and chooses the latest as primary', () => {
    const blockA = renderManagedBlock(['<region:0.10,0.10,0.30,0.30,0.50> a']);
    const blockB = renderManagedBlock(['<region:0.20,0.20,0.40,0.40,0.60> b']);
    const prompt = `base text\n\n${blockA}\n\nmiddle text\n\n${blockB}`;

    const blocks = extractManagedBlocks(prompt);
    expect(blocks).toHaveLength(2);
    expect(extractPrimaryManagedBlock(prompt)?.raw).toBe(blockB);
    expect(hasManagedBlock(prompt)).toBe(true);
  });

  it('strips duplicate managed blocks and keeps only user text', () => {
    const duplicatePrompt = [
      'user start',
      `${PROMPT_BUILDER_BLOCK_START}\n<region:0.10,0.10,0.20,0.20,0.50> one\n${PROMPT_BUILDER_BLOCK_END}`,
      'middle',
      `${PROMPT_BUILDER_BLOCK_START}\n<region:0.20,0.20,0.30,0.30,0.50> two\n${PROMPT_BUILDER_BLOCK_END}`,
      'user end',
    ].join('\n\n');

    expect(stripManagedBlocks(duplicatePrompt)).toBe('user start\n\nmiddle\n\nuser end');
  });
});
