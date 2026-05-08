import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  commitCartSections,
  createEmptyPresetCartState,
  parseWordsFromText,
  stagePresetInCart,
  unstagePresetFromCart,
  unstageWordFromCart,
} from '../features/presetLibrary/staging';
import type {
  LibraryPreset,
  PresetCategory,
  PresetPromptSection,
} from '../features/presetLibrary/types';

export const PRESET_LIBRARY_STORAGE_KEY = 'swarmui:presetLibrary:v1';
export const PRESET_LIBRARY_MIGRATION_FLAG_KEY = 'swarmui:presetLibrary:migratedFromWizard:v1';
export const WIZARD_PRESET_STORAGE_KEY = 'swarmui-prompt-wizard-v1';

interface PresetLibraryState {
  userPresets: LibraryPreset[];
  activeCategory: PresetCategory;
  showExplicit: boolean;
  stagedWords: string[];
  stagedFromPresetIds: string[];
  stagedSections: PresetPromptSection[];
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
  setSearchQuery: (query: string) => void;
  resetEphemeral: () => void;
}

let privateCartState = createEmptyPresetCartState();

function syncCartState(
  cartState: ReturnType<typeof createEmptyPresetCartState>
): Pick<PresetLibraryState, 'stagedWords' | 'stagedFromPresetIds' | 'stagedSections'> {
  privateCartState = cartState;
  return {
    stagedWords: cartState.stagedWords,
    stagedFromPresetIds: cartState.stagedFromPresetIds,
    stagedSections: commitCartSections(cartState),
  };
}

function clearPrivateCartState(): Pick<
  PresetLibraryState,
  'stagedWords' | 'stagedFromPresetIds' | 'stagedSections'
> {
  return syncCartState(createEmptyPresetCartState());
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
      stagedWords: [],
      stagedFromPresetIds: [],
      stagedSections: [],
      searchQuery: '',

      stagePreset: (preset) => {
        const nextCartState = stagePresetInCart(privateCartState, {
          ...preset,
          words: sanitizePresetWords(preset.words),
        });
        set(syncCartState(nextCartState));
      },

      unstagePreset: (presetId) => {
        const nextCartState = unstagePresetFromCart(privateCartState, presetId);
        set(syncCartState(nextCartState));
      },

      unstageWord: (displayWord) => {
        const nextCartState = unstageWordFromCart(privateCartState, displayWord);
        set(syncCartState(nextCartState));
      },

      clearStaged: () => {
        set(clearPrivateCartState());
      },

      commitStaged: () => {
        const committedText = commitCartSections(privateCartState)
          .map((section) => section.text)
          .join('\n');
        set(clearPrivateCartState());
        return committedText;
      },

      commitStagedSections: () => {
        const committedSections = commitCartSections(privateCartState);
        set(clearPrivateCartState());
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
          set(syncCartState(restagedCart));
        }
      },

      removeUserPreset: (id) => {
        if (get().stagedFromPresetIds.includes(id)) {
          const nextCartState = unstagePresetFromCart(privateCartState, id);
          set(syncCartState(nextCartState));
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

      setSearchQuery: (query) => {
        set({ searchQuery: query });
      },

      resetEphemeral: () => {
        set({
          ...clearPrivateCartState(),
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
      }),
    }
  )
);
