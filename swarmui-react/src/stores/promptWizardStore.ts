import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import type {
  BuilderStep,
  PromptTag,
  PromptPreset,
  PromptBundle,
  PromptRecipe,
  PromptWizardStateSnapshot,
} from '../features/promptWizard/types';
import { DEFAULT_PROFILE_ID } from '../features/promptWizard/profiles';

interface PromptWizardStore {
  // State
  selectedTagIds: string[];
  tagWeights: Record<string, number>;
  manualNegativeTexts: string[];
  activeProfileId: string;
  activeStep: BuilderStep;
  lastEditedStep: BuilderStep;
  recentSteps: BuilderStep[];
  recentGroupKeys: string[];
  customTags: PromptTag[];
  customPresets: PromptPreset[];
  sessionBundles: PromptBundle[];
  savedRecipes: PromptRecipe[];
  savedStates: PromptWizardStateSnapshot[];
  migrationVersion: number;

  // Tag selection
  toggleTag: (tagId: string) => void;
  selectTag: (tagId: string) => void;
  deselectTag: (tagId: string) => void;
  setTagWeight: (tagId: string, weight: number) => void;
  clearSelections: () => void;
  setSelectedTagIds: (tagIds: string[]) => void;
  toggleManualNegativeText: (text: string) => void;
  removeManualNegativeText: (text: string) => void;

  // Quick-fill presets
  applyPreset: (tagIds: string[]) => void;

  // Navigation
  setActiveStep: (step: BuilderStep) => void;
  setActiveProfile: (profileId: string) => void;
  markStepInteraction: (step: BuilderStep) => void;
  recordGroupFocus: (groupKey: string) => void;

  // Custom tags
  addCustomTag: (tag: { text: string; step: BuilderStep; subcategory?: string }) => void;
  removeCustomTag: (tagId: string) => void;

  // Custom presets
  addCustomPreset: (preset: Omit<PromptPreset, 'id' | 'isDefault'>) => void;
  removeCustomPreset: (presetId: string) => void;

  // Bundles, recipes, and saved states
  saveBundle: (bundle: Omit<PromptBundle, 'id' | 'createdAt' | 'updatedAt'>) => void;
  applyBundle: (bundleId: string, mode?: 'merge' | 'replace') => void;
  removeBundle: (bundleId: string) => void;
  saveRecipe: (recipe: Omit<PromptRecipe, 'id' | 'createdAt' | 'updatedAt'>) => void;
  applyRecipe: (recipeId: string, mode?: 'merge' | 'replace') => void;
  removeRecipe: (recipeId: string) => void;
  saveStateSnapshot: (
    snapshot: Omit<PromptWizardStateSnapshot, 'id' | 'createdAt' | 'updatedAt'>
  ) => void;
  loadStateSnapshot: (snapshotId: string) => void;
  removeStateSnapshot: (snapshotId: string) => void;

  // Migration
  setMigrationVersion: (version: number) => void;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function pushRecent<T>(items: T[], value: T, max = 8): T[] {
  return [value, ...items.filter((item) => item !== value)].slice(0, max);
}

export const usePromptWizardStore = create<PromptWizardStore>()(
  devtools(
    persist(
      (set) => ({
        selectedTagIds: [],
        tagWeights: {},
        manualNegativeTexts: [],
        activeProfileId: DEFAULT_PROFILE_ID,
        activeStep: 'subject',
        lastEditedStep: 'subject',
        recentSteps: ['subject'],
        recentGroupKeys: [],
        customTags: [],
        customPresets: [],
        sessionBundles: [],
        savedRecipes: [],
        savedStates: [],
        migrationVersion: 0,

        toggleTag: (tagId) => {
          set((state) => {
            const isSelected = state.selectedTagIds.includes(tagId);
            const newWeights = { ...state.tagWeights };
            if (isSelected) {
              delete newWeights[tagId];
            }
            return {
              selectedTagIds: isSelected
                ? state.selectedTagIds.filter((id) => id !== tagId)
                : [...state.selectedTagIds, tagId],
              tagWeights: newWeights,
            };
          });
        },

        selectTag: (tagId) => {
          set((state) => ({
            selectedTagIds: state.selectedTagIds.includes(tagId)
              ? state.selectedTagIds
              : [...state.selectedTagIds, tagId],
          }));
        },

        deselectTag: (tagId) => {
          set((state) => {
            const newWeights = { ...state.tagWeights };
            delete newWeights[tagId];
            return {
              selectedTagIds: state.selectedTagIds.filter((id) => id !== tagId),
              tagWeights: newWeights,
            };
          });
        },

        setTagWeight: (tagId, weight) => {
          set((state) => ({
            tagWeights: { ...state.tagWeights, [tagId]: weight },
          }));
        },

        clearSelections: () => {
          set({ selectedTagIds: [], tagWeights: {}, manualNegativeTexts: [] });
        },

        setSelectedTagIds: (tagIds) => {
          set({ selectedTagIds: uniqueStrings(tagIds) });
        },

        toggleManualNegativeText: (text) => {
          const normalized = text.trim();
          if (!normalized) {
            return;
          }
          set((state) => ({
            manualNegativeTexts: state.manualNegativeTexts.includes(normalized)
              ? state.manualNegativeTexts.filter((value) => value !== normalized)
              : [...state.manualNegativeTexts, normalized],
          }));
        },

        removeManualNegativeText: (text) => {
          set((state) => ({
            manualNegativeTexts: state.manualNegativeTexts.filter((value) => value !== text),
          }));
        },

        applyPreset: (tagIds) => {
          set((state) => {
            const existing = new Set(state.selectedTagIds);
            const newIds = tagIds.filter((id) => !existing.has(id));
            return { selectedTagIds: [...state.selectedTagIds, ...newIds] };
          });
        },

        setActiveStep: (step) => {
          set((state) => ({
            activeStep: step,
            recentSteps: pushRecent(state.recentSteps, step),
          }));
        },

        setActiveProfile: (profileId) => {
          set({ activeProfileId: profileId });
        },

        markStepInteraction: (step) => {
          set((state) => ({
            lastEditedStep: step,
            recentSteps: pushRecent(state.recentSteps, step),
          }));
        },

        recordGroupFocus: (groupKey) => {
          set((state) => ({
            recentGroupKeys: pushRecent(state.recentGroupKeys, groupKey, 10),
          }));
        },

        addCustomTag: ({ text, step, subcategory }) => {
          const id = `custom-tag-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          const tag: PromptTag = {
            id,
            text,
            step,
            subcategory,
            profiles: ['illustrious'],
            isCustom: true,
          };
          set((state) => ({ customTags: [...state.customTags, tag] }));
        },

        removeCustomTag: (tagId) => {
          set((state) => ({
            customTags: state.customTags.filter((t) => t.id !== tagId),
            selectedTagIds: state.selectedTagIds.filter((id) => id !== tagId),
          }));
        },

        addCustomPreset: (preset) => {
          const id = `custom-preset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          set((state) => ({
            customPresets: [...state.customPresets, { ...preset, id, isDefault: false }],
          }));
        },

        removeCustomPreset: (presetId) => {
          set((state) => ({
            customPresets: state.customPresets.filter((p) => p.id !== presetId),
          }));
        },

        saveBundle: (bundle) => {
          const now = Date.now();
          set((state) => ({
            sessionBundles: [
              {
                ...bundle,
                id: `bundle-${now}-${Math.random().toString(36).slice(2, 9)}`,
                createdAt: now,
                updatedAt: now,
              },
              ...state.sessionBundles,
            ],
          }));
        },

        applyBundle: (bundleId, mode = 'merge') => {
          set((state) => {
            const bundle = state.sessionBundles.find((item) => item.id === bundleId);
            if (!bundle) {
              return state;
            }
            return {
              selectedTagIds:
                mode === 'replace'
                  ? uniqueStrings(bundle.tagIds)
                  : uniqueStrings([...state.selectedTagIds, ...bundle.tagIds]),
            };
          });
        },

        removeBundle: (bundleId) => {
          set((state) => ({
            sessionBundles: state.sessionBundles.filter((bundle) => bundle.id !== bundleId),
          }));
        },

        saveRecipe: (recipe) => {
          const now = Date.now();
          set((state) => ({
            savedRecipes: [
              {
                ...recipe,
                id: `recipe-${now}-${Math.random().toString(36).slice(2, 9)}`,
                createdAt: now,
                updatedAt: now,
              },
              ...state.savedRecipes,
            ],
          }));
        },

        applyRecipe: (recipeId, mode = 'merge') => {
          set((state) => {
            const recipe = state.savedRecipes.find((item) => item.id === recipeId);
            if (!recipe) {
              return state;
            }
            return {
              selectedTagIds:
                mode === 'replace'
                  ? uniqueStrings(recipe.tagIds)
                  : uniqueStrings([...state.selectedTagIds, ...recipe.tagIds]),
              activeProfileId: recipe.profileId,
            };
          });
        },

        removeRecipe: (recipeId) => {
          set((state) => ({
            savedRecipes: state.savedRecipes.filter((recipe) => recipe.id !== recipeId),
          }));
        },

        saveStateSnapshot: (snapshot) => {
          const now = Date.now();
          set((state) => ({
            savedStates: [
              {
                ...snapshot,
                id: `state-${now}-${Math.random().toString(36).slice(2, 9)}`,
                createdAt: now,
                updatedAt: now,
              },
              ...state.savedStates,
            ],
          }));
        },

        loadStateSnapshot: (snapshotId) => {
          set((state) => {
            const snapshot = state.savedStates.find((item) => item.id === snapshotId);
            if (!snapshot) {
              return state;
            }
            return {
              selectedTagIds: uniqueStrings(snapshot.selectedTagIds),
              manualNegativeTexts: uniqueStrings(snapshot.manualNegativeTexts),
              activeProfileId: snapshot.profileId,
              activeStep: snapshot.activeStep,
              recentSteps: pushRecent(state.recentSteps, snapshot.activeStep),
            };
          });
        },

        removeStateSnapshot: (snapshotId) => {
          set((state) => ({
            savedStates: state.savedStates.filter((snapshot) => snapshot.id !== snapshotId),
          }));
        },

        setMigrationVersion: (version) => {
          set({ migrationVersion: version });
        },
      }),
      {
        name: 'swarmui-prompt-wizard-v1',
        partialize: (state) => ({
          selectedTagIds: state.selectedTagIds,
          tagWeights: state.tagWeights,
          manualNegativeTexts: state.manualNegativeTexts,
          activeProfileId: state.activeProfileId,
          lastEditedStep: state.lastEditedStep,
          recentSteps: state.recentSteps,
          recentGroupKeys: state.recentGroupKeys,
          customTags: state.customTags,
          customPresets: state.customPresets,
          sessionBundles: state.sessionBundles,
          savedRecipes: state.savedRecipes,
          savedStates: state.savedStates,
          migrationVersion: state.migrationVersion,
        }),
      }
    ),
    { name: 'PromptWizardStore' }
  )
);
