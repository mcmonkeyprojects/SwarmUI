import {
  PRESET_PROMPT_SECTION_ORDER,
  type LibraryPreset,
  type PresetCategory,
  type PresetPromptSection,
} from './types';

export interface PresetCartState {
  stagedWords: string[];
  stagedFromPresetIds: string[];
  sections: Partial<Record<PresetCategory, string[]>>;
  wordContributors: Record<string, string[]>;
  displayByKey: Record<string, string>;
  categoryByKey: Record<string, PresetCategory>;
}

export function createEmptyPresetCartState(): PresetCartState {
  return {
    stagedWords: [],
    stagedFromPresetIds: [],
    sections: {},
    wordContributors: {},
    displayByKey: {},
    categoryByKey: {},
  };
}

export function normalizeWord(word: string): string {
  return word.toLowerCase().trim();
}

export function dedupeWords(words: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const word of words) {
    const trimmedWord = word.trim();
    const key = normalizeWord(trimmedWord);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(trimmedWord);
  }

  return deduped;
}

export function parseWordsFromText(text: string): string[] {
  return dedupeWords(text.split(/[\n,]+/));
}

function cloneCartState(state: PresetCartState): PresetCartState {
  return {
    stagedWords: [...state.stagedWords],
    stagedFromPresetIds: [...state.stagedFromPresetIds],
    sections: Object.fromEntries(
      Object.entries(state.sections).map(([category, words]) => [category, [...(words ?? [])]])
    ) as Partial<Record<PresetCategory, string[]>>,
    wordContributors: Object.fromEntries(
      Object.entries(state.wordContributors).map(([key, presetIds]) => [key, [...presetIds]])
    ),
    displayByKey: { ...state.displayByKey },
    categoryByKey: { ...state.categoryByKey },
  };
}

function trimPresetWords(words: string[]): string[] {
  return dedupeWords(words);
}

export function stagePresetInCart(
  state: PresetCartState,
  preset: Pick<LibraryPreset, 'id' | 'category' | 'words'>
): PresetCartState {
  const words = trimPresetWords(preset.words);
  if (words.length === 0) {
    return state;
  }

  const nextState = cloneCartState(state);

  for (const word of words) {
    const key = normalizeWord(word);
    if (!key) {
      continue;
    }

    const contributors = nextState.wordContributors[key] ?? [];
    if (!contributors.includes(preset.id)) {
      nextState.wordContributors[key] = [...contributors, preset.id];
    }

    if (!(key in nextState.displayByKey)) {
      nextState.displayByKey[key] = word;
      nextState.categoryByKey[key] = preset.category;
      nextState.stagedWords.push(word);
      nextState.sections[preset.category] = [...(nextState.sections[preset.category] ?? []), word];
    }
  }

  if (!nextState.stagedFromPresetIds.includes(preset.id)) {
    nextState.stagedFromPresetIds.push(preset.id);
  }

  return nextState;
}

export function unstagePresetFromCart(state: PresetCartState, presetId: string): PresetCartState {
  if (!state.stagedFromPresetIds.includes(presetId)) {
    return state;
  }

  const nextState = cloneCartState(state);

  for (const [key, contributors] of Object.entries(nextState.wordContributors)) {
    if (!contributors.includes(presetId)) {
      continue;
    }

    const remainingContributors = contributors.filter((id) => id !== presetId);
    if (remainingContributors.length === 0) {
      const displayWord = nextState.displayByKey[key];
      const category = nextState.categoryByKey[key];
      nextState.stagedWords = nextState.stagedWords.filter((word) => word !== displayWord);
      if (category) {
        nextState.sections[category] = (nextState.sections[category] ?? []).filter(
          (word) => word !== displayWord
        );
        if (nextState.sections[category]?.length === 0) {
          delete nextState.sections[category];
        }
      }
      delete nextState.wordContributors[key];
      delete nextState.displayByKey[key];
      delete nextState.categoryByKey[key];
    } else {
      nextState.wordContributors[key] = remainingContributors;
    }
  }

  nextState.stagedFromPresetIds = nextState.stagedFromPresetIds.filter((id) => id !== presetId);
  return nextState;
}

function presetStillContributes(state: PresetCartState, presetId: string): boolean {
  for (const contributors of Object.values(state.wordContributors)) {
    if (contributors.includes(presetId)) {
      return true;
    }
  }

  return false;
}

export function unstageWordFromCart(state: PresetCartState, displayWord: string): PresetCartState {
  const key = normalizeWord(displayWord);
  const currentDisplayWord = state.displayByKey[key];
  const contributors = state.wordContributors[key];

  if (!currentDisplayWord || !contributors) {
    return state;
  }

  const nextState = cloneCartState(state);
  const category = nextState.categoryByKey[key];
  delete nextState.wordContributors[key];
  delete nextState.displayByKey[key];
  delete nextState.categoryByKey[key];
  nextState.stagedWords = nextState.stagedWords.filter((word) => word !== currentDisplayWord);
  if (category) {
    nextState.sections[category] = (nextState.sections[category] ?? []).filter(
      (word) => word !== currentDisplayWord
    );
    if (nextState.sections[category]?.length === 0) {
      delete nextState.sections[category];
    }
  }
  nextState.stagedFromPresetIds = nextState.stagedFromPresetIds.filter((presetId) =>
    presetStillContributes(nextState, presetId)
  );

  return nextState;
}

export function commitCartWords(words: string[]): string {
  return words.join(', ');
}

export function commitCartSections(state: PresetCartState): PresetPromptSection[] {
  const sections: PresetPromptSection[] = [];

  for (const category of PRESET_PROMPT_SECTION_ORDER) {
    const words = state.sections[category] ?? [];
    if (words.length === 0) {
      continue;
    }

    sections.push({
      category,
      words: [...words],
      text: commitCartWords(words),
    });
  }

  return sections;
}
