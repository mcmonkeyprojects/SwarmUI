import { describe, expect, it } from 'vitest';
import { buildRegionTag } from './compile';
import {
  buildCharacterRegionRules,
  clampCharacterRegionBox,
  createCharacterRegionDraft,
  getCharacterLayoutBoxes,
  type CharacterLayoutPreset,
} from './characterRegions';

const presetCases: Array<[number, CharacterLayoutPreset]> = [
  [1, 'single-center'],
  [2, 'left-right'],
  [3, 'left-center-right'],
  [4, 'four-quadrant'],
];

describe('character region helpers', () => {
  it.each(presetCases)('builds valid normalized boxes for %i character preset %s', (count, preset) => {
    const boxes = getCharacterLayoutBoxes(count, preset);

    expect(boxes).toHaveLength(count);
    for (const box of boxes) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
      expect(box.x + box.width).toBeLessThanOrEqual(1);
      expect(box.y + box.height).toBeLessThanOrEqual(1);
    }
  });

  it('clamps editable boxes inside the image bounds', () => {
    expect(clampCharacterRegionBox({
      x: 0.8,
      y: -0.25,
      width: 0.8,
      height: 2,
    })).toEqual({
      x: 0.8,
      y: 0,
      width: 0.2,
      height: 1,
    });
  });

  it('embeds per-character LoRAs only in the matching region prompt', () => {
    const rules = buildCharacterRegionRules([
      createCharacterRegionDraft(0, { x: 0, y: 0, width: 0.5, height: 1 }, {
        prompt: 'red-haired knight',
        loras: [{ name: 'knight-detail.safetensors', weight: 0.8 }],
      }),
      createCharacterRegionDraft(1, { x: 0.5, y: 0, width: 0.5, height: 1 }, {
        prompt: 'blue mage',
        loras: [{ name: 'mage-style.safetensors', weight: 1.15 }],
      }),
    ]);

    expect(rules[0].prompt).toContain('<lora:knight-detail.safetensors:0.80>');
    expect(rules[0].prompt).not.toContain('mage-style');
    expect(rules[1].prompt).toContain('<lora:mage-style.safetensors:1.15>');
    expect(rules[1].prompt).not.toContain('knight-detail');
  });

  it('compiles region and object modes through the existing region syntax builder', () => {
    const [regionRule, objectRule] = buildCharacterRegionRules([
      createCharacterRegionDraft(0, { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }, {
        prompt: 'archer',
        useInpaint: false,
      }),
      createCharacterRegionDraft(1, { x: 0.5, y: 0.2, width: 0.3, height: 0.4 }, {
        prompt: 'robot',
        useInpaint: true,
        inpaintStrength: 0.7,
      }),
    ]);

    expect(buildRegionTag(regionRule)).toBe('<region:0.10,0.20,0.30,0.40,0.50> archer');
    expect(buildRegionTag(objectRule)).toBe('<object:0.50,0.20,0.30,0.40,0.50,0.70> robot');
  });
});
