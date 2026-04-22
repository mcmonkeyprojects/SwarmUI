// swarmui-react/src/data/presetLibrary.validation.test.ts
import { describe, expect, it } from 'vitest';
import type { LibraryPreset } from '../features/presetLibrary/types';
import { PRESET_CATEGORIES } from '../features/presetLibrary/types';
import presets from './presetLibrary.json';

const library = presets as LibraryPreset[];

describe('presetLibrary.json', () => {
  it('every preset has required fields', () => {
    for (const p of library) {
      expect(p.id, `${p.name} missing id`).toBeTruthy();
      expect(p.name, `${p.id} missing name`).toBeTruthy();
      expect(PRESET_CATEGORIES).toContain(p.category);
      expect(Array.isArray(p.words), `${p.id} words not array`).toBe(true);
      expect(p.words.length, `${p.id} has no words`).toBeGreaterThan(0);
      expect(p.isDefault, `${p.id} isDefault not true`).toBe(true);
    }
  });

  it('all ids are unique', () => {
    const ids = library.map(p => p.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('all names are unique', () => {
    const names = library.map(p => p.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('ids follow pl-<category>-<slug> convention', () => {
    for (const p of library) {
      expect(p.id, `${p.name} id wrong format`).toMatch(/^pl-(characters|scenes|styles|perspectives|explicit)-[a-z0-9-]+$/);
    }
  });

  it('each preset has 6-20 words', () => {
    for (const p of library) {
      expect(p.words.length, `${p.id} has ${p.words.length} words`).toBeGreaterThanOrEqual(6);
      expect(p.words.length, `${p.id} has ${p.words.length} words`).toBeLessThanOrEqual(20);
    }
  });
});
