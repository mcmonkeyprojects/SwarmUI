import { describe, expect, it } from 'vitest';
import {
  commitCartWords,
  createEmptyPresetCartState,
  dedupeWords,
  normalizeWord,
  parseWordsFromText,
  stagePresetInCart,
  unstagePresetFromCart,
  unstageWordFromCart,
} from './staging';

describe('presetLibrary staging helpers', () => {
  it('normalizes words with trim and lowercase', () => {
    expect(normalizeWord(' Knight ')).toBe('knight');
    expect(normalizeWord('blue   eyes')).toBe('blue eyes');
  });

  it('dedupes words case-insensitively and keeps first casing', () => {
    expect(dedupeWords(['Knight', 'knight', ' armor ', 'Armor'])).toEqual(['Knight', 'armor']);
  });

  it('parses free-text words from commas and newlines', () => {
    expect(parseWordsFromText('knight, armor\nsword,\nshield')).toEqual([
      'knight',
      'armor',
      'sword',
      'shield',
    ]);
  });

  it('stages preset words without duplicates', () => {
    const nextState = stagePresetInCart(createEmptyPresetCartState(), {
      id: 'pl-heroic-knight',
      category: 'characters',
      words: ['Knight', 'Armor', 'Knight'],
    });

    expect(nextState.stagedWords).toEqual(['Knight', 'Armor']);
    expect(nextState.stagedFromPresetIds).toEqual(['pl-heroic-knight']);
    expect(nextState.wordContributors.knight).toEqual(['pl-heroic-knight']);
    expect(nextState.wordContributors.armor).toEqual(['pl-heroic-knight']);
  });

  it('keeps shared words staged until all contributors are removed', () => {
    const firstState = stagePresetInCart(createEmptyPresetCartState(), {
      id: 'pl-heroic-knight',
      category: 'characters',
      words: ['Knight', 'Sword'],
    });
    const stackedState = stagePresetInCart(firstState, {
      id: 'pl-sword-master',
      category: 'styles',
      words: ['Sword', 'Cape'],
    });

    expect(stackedState.stagedWords).toEqual(['Knight', 'Sword', 'Cape']);

    const afterUnstage = unstagePresetFromCart(stackedState, 'pl-heroic-knight');
    expect(afterUnstage.stagedWords).toEqual(['Sword', 'Cape']);
    expect(afterUnstage.wordContributors.sword).toEqual(['pl-sword-master']);
    expect(afterUnstage.stagedFromPresetIds).toEqual(['pl-sword-master']);
  });

  it('removes a word and prunes presets with no remaining contributions', () => {
    const firstState = stagePresetInCart(createEmptyPresetCartState(), {
      id: 'pl-heroic-knight',
      category: 'characters',
      words: ['Knight'],
    });
    const stackedState = stagePresetInCart(firstState, {
      id: 'pl-sword-master',
      category: 'styles',
      words: ['Sword'],
    });

    const afterUnstage = unstageWordFromCart(stackedState, 'knight');
    expect(afterUnstage.stagedWords).toEqual(['Sword']);
    expect(afterUnstage.stagedFromPresetIds).toEqual(['pl-sword-master']);
  });

  it('removes a shared word regardless of input case', () => {
    const stagedState = stagePresetInCart(createEmptyPresetCartState(), {
      id: 'pl-heroic-knight',
      category: 'characters',
      words: ['Knight'],
    });

    const afterUnstage = unstageWordFromCart(stagedState, 'knight');
    expect(afterUnstage.stagedWords).toEqual([]);
    expect(afterUnstage.stagedFromPresetIds).toEqual([]);
  });

  it('commits staged words as a comma-joined string', () => {
    expect(commitCartWords(['Knight', 'Armor', 'Sword'])).toBe('Knight, Armor, Sword');
  });
});
