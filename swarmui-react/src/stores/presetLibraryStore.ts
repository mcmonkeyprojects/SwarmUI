import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  commitCartSections,
  commitCartWithTrace,
  createEmptyPresetCartState,
  parseWordsFromText,
  stagePresetInCart,
  unstagePresetFromCart,
  unstageWordFromCart,
  normalizeWord,
} from '../features/presetLibrary/staging';
import {
  parseWeightedWord,
  type LibraryPreset,
  type PresetCategory,
  type PresetPromptSection,
} from '../features/presetLibrary/types';
import type {
  PresetAutoSegmentPart,
  PresetAutoSegmentSelections,
  PresetCompilerTraceSegment,
} from '../features/presetLibrary/compiler';

export const PRESET_LIBRARY_STORAGE_KEY = 'swarmui:presetLibrary:v1';
export const PRESET_LIBRARY_MIGRATION_FLAG_KEY = 'swarmui:presetLibrary:migratedFromWizard:v1';
export const WIZARD_PRESET_STORAGE_KEY = 'swarmui-prompt-wizard-v1';

interface PresetLibraryState {
  userPresets: LibraryPreset[];
  activeCategory: PresetCategory;
  showExplicit: boolean;
  sfwMode: boolean;
  deduplicatePrompts: boolean;
  stagedWords: string[];
  stagedFromPresetIds: string[];
  stagedSections: PresetPromptSection[];
  stagedSegments: PresetCompilerTraceSegment[];
  segmentSelections: PresetAutoSegmentSelections;
  presetMultipliers: Record<string, number>;
  stagedVariations: Record<string, string>;
  stagedVariables: Record<string, Record<string, string>>;
  searchQuery: string;

  stagePreset: (preset: LibraryPreset) => void;
  unstagePreset: (presetId: string) => void;
  unstageWord: (displayWord: string) => void;
  clearStaged: () => void;
  commitStaged: () => string;
  commitStagedSections: () => PresetPromptSection[];
  migrateFromWizardStore: () => Promise<void>;
  addUserPreset: (
    preset: Omit<LibraryPreset, 'id' | 'isDefault' | 'createdAt' | 'updatedAt'>
  ) => void;
  updateUserPreset: (
    id: string,
    updates: Partial<Omit<LibraryPreset, 'id' | 'isDefault' | 'createdAt'>>
  ) => void;
  removeUserPreset: (id: string) => void;
  setActiveCategory: (category: PresetCategory) => void;
  setShowExplicit: (show: boolean) => void;
  setSfwMode: (enabled: boolean) => void;
  setDeduplicatePrompts: (enabled: boolean) => void;
  setSearchQuery: (query: string) => void;
  setSegmentEnabled: (part: PresetAutoSegmentPart, enabled: boolean) => void;
  adjustWordWeight: (baseWord: string, weight: number) => void;
  adjustPresetMultiplier: (presetId: string, multiplier: number) => void;
  setStagedVariable: (presetId: string, varName: string, value: string) => void;
  resetEphemeral: () => void;
}

let privateCartState = createEmptyPresetCartState();

function syncCartState(
  cartState: ReturnType<typeof createEmptyPresetCartState>,
  sfwMode: boolean = false,
  segmentSelections?: PresetAutoSegmentSelections
): Pick<
  PresetLibraryState,
  'stagedWords' | 'stagedFromPresetIds' | 'stagedSections' | 'stagedSegments' | 'presetMultipliers'
> {
  privateCartState = cartState;
  let stagedVariables: Record<string, Record<string, string>> = {};
  let deduplicatePrompts = true;
  let activeSegmentSelections = segmentSelections ?? {};
  try {
    const storeState = usePresetLibraryStore.getState();
    if (storeState) {
      stagedVariables = storeState.stagedVariables ?? {};
      deduplicatePrompts = storeState.deduplicatePrompts ?? true;
      activeSegmentSelections = segmentSelections ?? storeState.segmentSelections ?? {};
    }
  } catch {
    // Store access can be unavailable during module initialization.
  }

  const compiled = commitCartWithTrace(cartState, stagedVariables, deduplicatePrompts, {
    sfwMode,
    segmentSelections: activeSegmentSelections,
  });

  let stagedWords = cartState.stagedWords;
  if (sfwMode) {
    const nsfwKeywords = [
      'vulva', 'pussy', 'vagina', 'cunt', 'clitoris', 'clit', 'labia', 'innie', 'outtie',
      'puckered', 'cloaca', 'pubic', 'areola', 'nipple', 'nipples', 'asshole', 'anus',
      'penis', 'cock', 'dick', 'nude', 'naked', 'topless', 'bare breasts', 'bare vulva',
      'bare slit', 'bare pussy', 'shaved pussy', 'nude body', 'naked body'
    ];
    stagedWords = stagedWords.filter((word) => {
      const key = normalizeWord(word);
      const category = cartState.categoryByKey[key] ?? 'characters';
      if (category === 'explicit') {
        return false;
      }
      const { baseWord } = parseWeightedWord(word);
      const baseWordLower = baseWord.toLowerCase();
      if (nsfwKeywords.some((kw) => baseWordLower.includes(kw))) {
        return false;
      }
      return true;
    });
  }

  return {
    stagedWords,
    stagedFromPresetIds: cartState.stagedFromPresetIds,
    stagedSections: compiled.sections,
    stagedSegments: compiled.trace.segments,
    presetMultipliers: cartState.presetMultipliers,
  };
}

function clearPrivateCartState(sfwMode: boolean = false): Pick<
  PresetLibraryState,
  'stagedWords' | 'stagedFromPresetIds' | 'stagedSections' | 'stagedSegments' | 'presetMultipliers'
> {
  return syncCartState(createEmptyPresetCartState(), sfwMode);
}

function sanitizePresetWords(words: string[]): string[] {
  return parseWordsFromText(words.join('\n'));
}

function fallbackWordFromLegacyTagId(tagId: string): string {
  return tagId
    .replace(/^tag-[^-]+-/, '')
    .replace(/-/g, ' ')
    .trim();
}

function mergeUniquePresets(
  currentPresets: LibraryPreset[],
  incomingPresets: LibraryPreset[]
): LibraryPreset[] {
  const presetsById = new Map<string, LibraryPreset>();

  for (const preset of currentPresets) {
    presetsById.set(preset.id, preset);
  }

  for (const preset of incomingPresets) {
    if (!presetsById.has(preset.id)) {
      presetsById.set(preset.id, preset);
    }
  }

  return Array.from(presetsById.values());
}

export const usePresetLibraryStore = create<PresetLibraryState>()(
  persist(
    (set, get) => ({
      userPresets: [],
      activeCategory: 'characters',
      showExplicit: false,
      sfwMode: false,
      deduplicatePrompts: true,
      stagedWords: [],
      stagedFromPresetIds: [],
      stagedSections: [],
      stagedSegments: [],
      segmentSelections: {},
      presetMultipliers: {},
      stagedVariations: {},
      stagedVariables: {},
      searchQuery: '',

      stagePreset: (preset) => {
        const nextCartState = stagePresetInCart(privateCartState, {
          ...preset,
          words: sanitizePresetWords(preset.words),
        });
        set(syncCartState(nextCartState, get().sfwMode));
      },

      unstagePreset: (presetId) => {
        const nextCartState = unstagePresetFromCart(privateCartState, presetId);
        set(syncCartState(nextCartState, get().sfwMode));
      },

      unstageWord: (displayWord) => {
        const nextCartState = unstageWordFromCart(privateCartState, displayWord);
        set(syncCartState(nextCartState, get().sfwMode));
      },

      clearStaged: () => {
        set({
          ...clearPrivateCartState(get().sfwMode),
          segmentSelections: {},
        });
      },

      commitStaged: () => {
        const state = get();
        const committedText = commitCartSections(privateCartState, state.stagedVariables, state.deduplicatePrompts, {
          sfwMode: state.sfwMode,
          segmentSelections: state.segmentSelections,
        })
          .map((section) => section.text)
          .join('\n');
        set({
          ...clearPrivateCartState(state.sfwMode),
          segmentSelections: {},
        });
        return committedText;
      },

      commitStagedSections: () => {
        const state = get();
        const committedSections = commitCartSections(privateCartState, state.stagedVariables, state.deduplicatePrompts, {
          sfwMode: state.sfwMode,
          segmentSelections: state.segmentSelections,
        });
        set({
          ...clearPrivateCartState(state.sfwMode),
          segmentSelections: {},
        });
        return committedSections;
      },

      migrateFromWizardStore: async () => {
        if (localStorage.getItem(PRESET_LIBRARY_MIGRATION_FLAG_KEY) === 'done') {
          return;
        }

        try {
          const rawWizardStore = localStorage.getItem(WIZARD_PRESET_STORAGE_KEY);
          if (!rawWizardStore) {
            localStorage.setItem(PRESET_LIBRARY_MIGRATION_FLAG_KEY, 'done');
            return;
          }

          const parsedWizardStore = JSON.parse(rawWizardStore);
          const oldUserPresets: Array<{
            id: string;
            name: string;
            category: PresetCategory;
            tagIds: string[];
            description?: string;
            thumbnail?: string;
          }> = parsedWizardStore?.state?.userBrowserPresets ?? [];

          if (oldUserPresets.length === 0) {
            localStorage.setItem(PRESET_LIBRARY_MIGRATION_FLAG_KEY, 'done');
            return;
          }

          const tagModule = await import('../data/promptTags.json');
          const promptTags = tagModule.default as Array<{ id: string; text: string }>;
          const tagById = new Map(promptTags.map((tag) => [tag.id, tag.text]));
          const timestamp = Date.now();

          const migratedPresets = oldUserPresets
            .map((preset) => ({
              id: preset.id,
              name: preset.name,
              category: preset.category,
              words: sanitizePresetWords(
                preset.tagIds
                  .map((tagId) => tagById.get(tagId) ?? fallbackWordFromLegacyTagId(tagId))
                  .filter((word): word is string => Boolean(word))
              ),
              description: preset.description,
              thumbnail: preset.thumbnail,
              isDefault: false as const,
              createdAt: timestamp,
              updatedAt: timestamp,
            }))
            .filter((preset) => preset.words.length > 0);

          if (parsedWizardStore?.state && 'userBrowserPresets' in parsedWizardStore.state) {
            delete parsedWizardStore.state.userBrowserPresets;
            localStorage.setItem(WIZARD_PRESET_STORAGE_KEY, JSON.stringify(parsedWizardStore));
          }

          set((state) => ({
            userPresets: mergeUniquePresets(state.userPresets, migratedPresets),
          }));

          localStorage.setItem(PRESET_LIBRARY_MIGRATION_FLAG_KEY, 'done');

          if (migratedPresets.length > 0) {
            console.info(
              `[presetLibrary] Migrated ${migratedPresets.length} user presets from wizard store`
            );
          }
        } catch (error) {
          console.warn(
            '[presetLibrary] Migration failed, starting with empty user presets:',
            error
          );
          localStorage.setItem(PRESET_LIBRARY_MIGRATION_FLAG_KEY, 'done');
        }
      },

      addUserPreset: (preset) => {
        const now = Date.now();
        const newPreset: LibraryPreset = {
          ...preset,
          words: sanitizePresetWords(preset.words),
          id: `pl-user-${now}-${Math.random().toString(36).slice(2, 9)}`,
          isDefault: false,
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({
          userPresets: [...state.userPresets, newPreset],
        }));
      },

      updateUserPreset: (id, updates) => {
        const currentPreset = get().userPresets.find((preset) => preset.id === id);
        if (!currentPreset) {
          return;
        }

        const updatedPreset: LibraryPreset = {
          ...currentPreset,
          ...updates,
          words: updates.words ? sanitizePresetWords(updates.words) : currentPreset.words,
          updatedAt: Date.now(),
        };

        set((state) => ({
          userPresets: state.userPresets.map((preset) =>
            preset.id === id ? updatedPreset : preset
          ),
        }));

        if (get().stagedFromPresetIds.includes(id)) {
          const clearedCart = unstagePresetFromCart(privateCartState, id);
          const restagedCart = stagePresetInCart(clearedCart, updatedPreset);
          set(syncCartState(restagedCart, get().sfwMode));
        }
      },

      removeUserPreset: (id) => {
        if (get().stagedFromPresetIds.includes(id)) {
          const nextCartState = unstagePresetFromCart(privateCartState, id);
          set(syncCartState(nextCartState, get().sfwMode));
        }

        set((state) => ({
          userPresets: state.userPresets.filter((preset) => preset.id !== id),
        }));
      },

      setActiveCategory: (category) => {
        set({ activeCategory: category });
      },

      setShowExplicit: (show) => {
        set({ showExplicit: show });
      },

      setSfwMode: (enabled) => {
        set({ sfwMode: enabled });
        set(syncCartState(privateCartState, enabled));
      },

      setDeduplicatePrompts: (enabled) => {
        set({ deduplicatePrompts: enabled });
        set(syncCartState(privateCartState, get().sfwMode));
      },

      setSearchQuery: (query) => {
        set({ searchQuery: query });
      },

      setSegmentEnabled: (part, enabled) => {
        const nextSegmentSelections = {
          ...get().segmentSelections,
          [part]: enabled,
        };
        set({
          segmentSelections: nextSegmentSelections,
          ...syncCartState(privateCartState, get().sfwMode, nextSegmentSelections),
        });
      },

      adjustWordWeight: (baseWord, weight) => {
        const key = normalizeWord(baseWord);
        const nextCartState = {
          ...privateCartState,
          wordWeights: {
            ...privateCartState.wordWeights,
            [key]: Math.max(0.1, Math.min(3.0, weight)),
          },
        };
        set(syncCartState(nextCartState, get().sfwMode));
      },

      adjustPresetMultiplier: (presetId, multiplier) => {
        const nextCartState = {
          ...privateCartState,
          presetMultipliers: {
            ...privateCartState.presetMultipliers,
            [presetId]: Math.max(0.2, Math.min(2.0, multiplier)),
          },
        };
        set(syncCartState(nextCartState, get().sfwMode));
      },

      setStagedVariable: (presetId, varName, value) => {
        const nextStagedVars = {
          ...get().stagedVariables,
          [presetId]: {
            ...(get().stagedVariables[presetId] ?? {}),
            [varName]: value,
          },
        };
        set({ stagedVariables: nextStagedVars });
        set(syncCartState(privateCartState, get().sfwMode));
      },

      resetEphemeral: () => {
        set({
          ...clearPrivateCartState(get().sfwMode),
          stagedVariations: {},
          stagedVariables: {},
          segmentSelections: {},
          searchQuery: '',
        });
      },
    }),
    {
      name: PRESET_LIBRARY_STORAGE_KEY,
      partialize: (state) => ({
        userPresets: state.userPresets,
        activeCategory: state.activeCategory,
        showExplicit: state.showExplicit,
        sfwMode: state.sfwMode,
        deduplicatePrompts: state.deduplicatePrompts,
        stagedVariables: state.stagedVariables,
        stagedVariations: state.stagedVariations,
      }),
    }
  )
);
