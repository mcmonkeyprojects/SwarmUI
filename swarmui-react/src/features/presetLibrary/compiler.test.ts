import { describe, expect, it } from 'vitest';
import { compileStagedPrompt, compileStagedPromptWithTrace } from './compiler';
import { createEmptyPresetCartState, stagePresetInCart } from './staging';
import type { PresetCategory } from './types';

function stageWords(category: PresetCategory, words: string[]) {
  return stagePresetInCart(createEmptyPresetCartState(), {
    id: `pl-${category}`,
    category,
    words,
  });
}

function stageMoreWords(
  state: ReturnType<typeof createEmptyPresetCartState>,
  category: PresetCategory,
  words: string[]
) {
  return stagePresetInCart(state, {
    id: `pl-${category}-${Object.keys(state.wordContributors).length}`,
    category,
    words,
  });
}

describe('presetLibrary prompt compiler', () => {
  it('can compile without auto-appending segment prompts', () => {
    const state = stageWords('characters', ['1girl', 'blushing face', 'perfect fingers']);
    const sections = compileStagedPrompt(state, {}, true, { autoSegments: false });

    expect(sections[0].text).not.toContain('<segment:');
    expect(sections[0].text).toContain('blushing face');
    expect(sections[0].text).toContain('perfect fingers');
  });

  it('reports auto-segment reasons in the trace', () => {
    const state = stageWords('characters', ['1girl', 'blushing face', 'perfect fingers']);
    const result = compileStagedPromptWithTrace(state, {}, true);

    expect(result.trace.segments).toEqual([
      expect.objectContaining({
        part: 'face',
        reasonWords: ['blushing face'],
      }),
      expect.objectContaining({
        part: 'hands',
        reasonWords: ['perfect fingers'],
      }),
    ]);
  });

  it('does not match body-part keywords by arbitrary word prefix', () => {
    const state = stageWords('characters', ['1girl', 'wooden handrail']);
    const result = compileStagedPromptWithTrace(state, {}, true);

    expect(result.sections[0].text).not.toContain('<segment:hands');
    expect(result.trace.segments.map((segment) => segment.part)).not.toContain('hands');
  });

  it('does not render nudity state as clothing', () => {
    const state = stageWords('characters', ['1girl', 'nude', 'red dress']);
    const sections = compileStagedPrompt(state, {}, true);

    expect(sections[0].text).toContain('red dress');
    expect(sections[0].text).toContain(', nude');
    expect(sections[0].text).not.toContain('wearing nude');
  });

  it('groups scene and lighting clauses instead of repeating prepositions', () => {
    let state = stageWords('characters', ['1girl']);
    state = stageMoreWords(state, 'scenes', ['red light district', 'neon signs', 'wet pavement']);
    state = stageMoreWords(state, 'lighting', ['bright lighting', 'high key lighting', 'clean highlights']);

    const sections = compileStagedPrompt(state, {}, true);

    expect(sections[0].text).toContain('red light district, neon signs, wet pavement');
    expect(sections[0].text).toContain('bright lighting, high key lighting, clean highlights');
    expect(sections[0].text).not.toContain('and in neon signs');
    expect(sections[0].text).not.toContain('and under high key lighting');
  });

  it('preserves baseline noun emphasis when compacting modifier phrases', () => {
    const state = stageWords('characters', ['1girl', '(eyes:1.3)', 'blue eyes']);
    const sections = compileStagedPrompt(state, {}, true);

    expect(sections[0].text).toContain('(blue eyes:1.29)');
  });

  it('strips explicit and nudity tags when sfwMode is enabled', () => {
    const state = stageWords('characters', [
      '1girl',
      'succubus',
      '(large breasts:1.1)',
      'bare vulva',
      'pink nipples',
      'nude',
      'smooth skin',
    ]);
    const sections = compileStagedPrompt(state, {}, true, { sfwMode: true });

    expect(sections[0].text).toContain('succubus');
    expect(sections[0].text).toContain('smooth skin');
    expect(sections[0].text).not.toContain('bare vulva');
    expect(sections[0].text).not.toContain('nipples');
    expect(sections[0].text).not.toContain('nude');
  });

  it('formats stacked presets as Illustrious-style tags and trims common duplicate boosters', () => {
    let state = stageWords('quality', [
      'masterpiece',
      'best quality',
      '8k quality',
      'high definition',
      'absurdres',
      'highly detailed',
      'ultra detailed',
      'highres',
      'detailed face',
      'detailed hands',
    ]);
    state = stageMoreWords(state, 'characters', [
      'camgirl',
      '(average body type:1.1)',
      '(natural breasts:1.1)',
      'natural butt',
      'lingerie',
    ]);
    state = stageMoreWords(state, 'perspectives', [
      'full body',
      'head to toe',
      'entire figure visible',
      'standing pose',
      'wide shot',
      'feet visible',
      'full silhouette',
    ]);
    state = stageMoreWords(state, 'styles', ['anime aesthetic', 'anime artwork']);

    const result = compileStagedPromptWithTrace(state, {}, true);
    const text = result.sections[0].text;

    expect(text).toContain('masterpiece, best quality, absurdres, highly detailed, highres');
    expect(text).toContain('camgirl, (average body type:1.1), (natural breasts:1.1), natural butt, lingerie');
    expect(text).toContain('full body, standing pose, wide shot, feet visible');
    expect(text).toContain('<segment:breasts,0.65,0.3> camgirl, (natural breasts:1.1), high detail, anime artwork');
    expect(text).not.toContain('A masterpiece');
    expect(text).not.toContain('8k quality');
    expect(text).not.toContain('high definition');
    expect(text).not.toContain('ultra detailed');
    expect(text).not.toContain('head to toe');
    expect(text).not.toContain('entire figure visible');
    expect(text).not.toContain('full silhouette');
    expect(text).not.toContain('anime aesthetic');
    expect(result.trace.removedTokens.map((token) => token.reason)).toEqual(
      expect.arrayContaining([
        'illustrious-resolution-overlap',
        'detail-fidelity-overlap',
        'full-body-framing-overlap',
        'anime-style-overlap',
      ])
    );
  });
});
