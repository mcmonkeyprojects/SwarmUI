/**
 * Presets Store
 *
 * Syncs generation presets with the SwarmUI backend.
 * Backend uses preset `title` as the unique identifier.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { swarmClient } from '../api/client';
import { queryClient, queryKeys } from '../api/queryClient';
import type { BackendPreset } from '../api/types';
import type { GenerateParams } from '../api/types';
import { logger } from '../utils/logger';

// Public interface used by the rest of the UI
export interface Preset {
  id: string;       // Maps to backend `title`
  name: string;     // Same as `title`
  description?: string;
  params: Partial<GenerateParams>;
  previewImage?: string;
  isStarred?: boolean;
  author?: string;
  createdAt: number;
}

interface PresetsState {
  presets: Preset[];
  isLoading: boolean;
  isLoaded: boolean;
}

interface PresetsActions {
  loadFromBackend: () => Promise<void>;
  addPreset: (preset: { name: string; description?: string; params: Partial<GenerateParams> }) => Promise<boolean>;
  deletePreset: (id: string) => Promise<boolean>;
  duplicatePreset: (id: string) => Promise<boolean>;
  updatePreset: (id: string, updates: { name?: string; description?: string; params?: Partial<GenerateParams>; isStarred?: boolean }) => Promise<boolean>;
  getPreset: (id: string) => Preset | undefined;
}

/**
 * Convert backend param_map (all string values) to typed GenerateParams.
 */
function paramMapToGenerateParams(paramMap: Record<string, string>): Partial<GenerateParams> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(paramMap)) {
    // Try to parse numbers and booleans
    if (value === 'true') {
      result[key] = true;
    } else if (value === 'false') {
      result[key] = false;
    } else if (value !== '' && !isNaN(Number(value))) {
      result[key] = Number(value);
    } else {
      result[key] = value;
    }
  }
  return result as Partial<GenerateParams>;
}

/**
 * Convert GenerateParams to backend param_map (all string values).
 */
function generateParamsToParamMap(params: Partial<GenerateParams>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      result[key] = String(value);
    }
  }
  return result;
}

/**
 * Convert a BackendPreset to our UI Preset format.
 */
function fromBackendPreset(bp: BackendPreset): Preset {
  return {
    id: bp.title,
    name: bp.title,
    description: bp.description || '',
    params: paramMapToGenerateParams(bp.param_map),
    previewImage: bp.preview_image,
    isStarred: bp.is_starred,
    author: bp.author,
    createdAt: Date.now(),
  };
}

export const usePresetsStore = create<PresetsState & PresetsActions>()(
  devtools(
    (set, get) => ({
      presets: [],
      isLoading: false,
      isLoaded: false,

      loadFromBackend: async () => {
        if (get().isLoading) return;
        set({ isLoading: true });
        try {
          const backendPresets = await queryClient.fetchQuery({
            queryKey: queryKeys.presets.list(),
            queryFn: () => swarmClient.getUserPresets(),
          });
          const presets = backendPresets.map(fromBackendPreset);
          set({ presets, isLoaded: true });
        } catch (error) {
          logger.error('Failed to load presets from backend:', error);
        } finally {
          set({ isLoading: false });
        }
      },

      addPreset: async (preset) => {
        const paramMap = generateParamsToParamMap(preset.params);
        try {
          const response = await swarmClient.addNewPreset({
            title: preset.name,
            description: preset.description || '',
            param_map: paramMap,
          });
          if (response.preset_fail) {
            logger.error('Failed to add preset:', response.preset_fail);
            return false;
          }
          await queryClient.invalidateQueries({ queryKey: queryKeys.presets.list() });
          await get().loadFromBackend();
          return true;
        } catch (error) {
          logger.error('Failed to add preset:', error);
          return false;
        }
      },

      deletePreset: async (id) => {
        try {
          const response = await swarmClient.deletePreset(id);
          if (response.success) {
            await queryClient.invalidateQueries({ queryKey: queryKeys.presets.list() });
            await get().loadFromBackend();
            return true;
          }
          return false;
        } catch (error) {
          logger.error('Failed to delete preset:', error);
          return false;
        }
      },

      duplicatePreset: async (id) => {
        try {
          const response = await swarmClient.duplicatePreset(id);
          if (response.preset_fail) {
            logger.error('Failed to duplicate preset:', response.preset_fail);
            return false;
          }
          await queryClient.invalidateQueries({ queryKey: queryKeys.presets.list() });
          await get().loadFromBackend();
          return true;
        } catch (error) {
          logger.error('Failed to duplicate preset:', error);
          return false;
        }
      },

      updatePreset: async (id, updates) => {
        const existing = get().getPreset(id);
        if (!existing) return false;

        const newTitle = updates.name ?? existing.name;
        const newDescription = updates.description ?? existing.description ?? '';
        const newParams = updates.params ?? existing.params;
        const paramMap = generateParamsToParamMap(newParams);

        try {
          const response = await swarmClient.addNewPreset({
            title: newTitle,
            description: newDescription,
            param_map: paramMap,
            is_edit: true,
            editing: id, // original title
            is_starred: updates.isStarred ?? existing.isStarred ?? false,
          });
          if (response.preset_fail) {
            logger.error('Failed to update preset:', response.preset_fail);
            return false;
          }
          await queryClient.invalidateQueries({ queryKey: queryKeys.presets.list() });
          await get().loadFromBackend();
          return true;
        } catch (error) {
          logger.error('Failed to update preset:', error);
          return false;
        }
      },

      getPreset: (id) => {
        return get().presets.find((p) => p.id === id);
      },
    }),
    { name: 'PresetsStore' }
  )
);
