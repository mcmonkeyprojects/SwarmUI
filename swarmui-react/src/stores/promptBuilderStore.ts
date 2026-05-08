import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import { createIndexedDbStorage } from '../lib/indexedDbStorage';
import type {
  BuilderRegionRule,
  BuilderSegmentRule,
  CanvasApplyPayload,
  PromptBuilderSourceContext,
  PromptBuilderSyncState,
} from '../features/promptBuilder';

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createDefaultRegion(partial?: Partial<BuilderRegionRule>): BuilderRegionRule {
  return {
    id: partial?.id ?? createId('region'),
    shape: partial?.shape ?? 'rectangle',
    source: partial?.source,
    label: partial?.label ?? '',
    x: partial?.x ?? 0.25,
    y: partial?.y ?? 0.25,
    width: partial?.width ?? 0.5,
    height: partial?.height ?? 0.5,
    strength: partial?.strength ?? 0.5,
    useInpaint: partial?.useInpaint ?? false,
    inpaintStrength: partial?.inpaintStrength ?? 0.5,
    prompt: partial?.prompt ?? '',
    enabled: partial?.enabled ?? true,
  };
}

function createDefaultSegment(partial?: Partial<BuilderSegmentRule>): BuilderSegmentRule {
  return {
    id: partial?.id ?? createId('segment'),
    modelType: partial?.modelType ?? 'clip-seg',
    textMatch: partial?.textMatch ?? 'face',
    yoloModel: partial?.yoloModel ?? '',
    yoloId: partial?.yoloId ?? 0,
    yoloClassIds: partial?.yoloClassIds ?? '',
    creativity: partial?.creativity ?? 0.6,
    threshold: partial?.threshold ?? 0.5,
    invertMask: partial?.invertMask ?? false,
    prompt: partial?.prompt ?? '',
    sampler: partial?.sampler ?? '',
    scheduler: partial?.scheduler ?? '',
    enabled: partial?.enabled ?? true,
  };
}

function moveItem<T>(list: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) {
    return list;
  }
  if (fromIndex < 0 || fromIndex >= list.length || toIndex < 0 || toIndex >= list.length) {
    return list;
  }
  const next = [...list];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

interface PromptBuilderStoreState {
  regions: BuilderRegionRule[];
  segments: BuilderSegmentRule[];
  source: PromptBuilderSourceContext;
  syncState: PromptBuilderSyncState;
  lastCompiledBlock: string;
  lastCompiledBlockHash: string;
}

interface PromptBuilderStoreActions {
  setSourceContext: (source: Partial<PromptBuilderSourceContext>) => void;
  setSyncState: (state: PromptBuilderSyncState) => void;

  addRegion: (region?: Partial<BuilderRegionRule>) => string;
  updateRegion: (id: string, updates: Partial<BuilderRegionRule>) => void;
  removeRegion: (id: string) => void;
  reorderRegions: (fromIndex: number, toIndex: number) => void;
  setRegions: (regions: BuilderRegionRule[]) => void;

  addSegment: (segment?: Partial<BuilderSegmentRule>) => string;
  updateSegment: (id: string, updates: Partial<BuilderSegmentRule>) => void;
  removeSegment: (id: string) => void;
  reorderSegments: (fromIndex: number, toIndex: number) => void;
  setSegments: (segments: BuilderSegmentRule[]) => void;

  applyFromCanvas: (payload: CanvasApplyPayload) => void;
  markManualOverride: () => void;
  markOutOfSync: () => void;
  markSynced: (managedBlock: string, managedBlockHash: string) => void;
  clearManagedBlock: () => void;
  clearAllRules: () => void;
  reset: () => void;
}

type PromptBuilderStore = PromptBuilderStoreState & PromptBuilderStoreActions;

const initialState: PromptBuilderStoreState = {
  regions: [],
  segments: [],
  source: {
    imageUrl: null,
    imageWidth: null,
    imageHeight: null,
  },
  syncState: 'out_of_sync',
  lastCompiledBlock: '',
  lastCompiledBlockHash: '',
};

export const usePromptBuilderStore = create<PromptBuilderStore>()(
  devtools(
    persist(
      (set) => ({
        ...initialState,

        setSourceContext: (source) => set((state) => ({
          source: {
            imageUrl: source.imageUrl ?? state.source.imageUrl,
            imageWidth: source.imageWidth ?? state.source.imageWidth,
            imageHeight: source.imageHeight ?? state.source.imageHeight,
          },
        })),

        setSyncState: (syncState) => set({ syncState }),

        addRegion: (region) => {
          const normalized = createDefaultRegion(region);
          set((state) => ({
            regions: [...state.regions, normalized],
            syncState: 'out_of_sync',
          }));
          return normalized.id;
        },

        updateRegion: (id, updates) => set((state) => ({
          regions: state.regions.map((region) => {
            if (region.id !== id) {
              return region;
            }
            return {
              ...region,
              ...updates,
              x: updates.x === undefined ? region.x : clamp(updates.x, 0, 1),
              y: updates.y === undefined ? region.y : clamp(updates.y, 0, 1),
              width: updates.width === undefined ? region.width : clamp(updates.width, 0, 1),
              height: updates.height === undefined ? region.height : clamp(updates.height, 0, 1),
              strength: updates.strength === undefined ? region.strength : clamp(updates.strength, -1, 1),
              inpaintStrength: updates.inpaintStrength === undefined
                ? region.inpaintStrength
                : clamp(updates.inpaintStrength, 0, 1),
            };
          }),
          syncState: 'out_of_sync',
        })),

        removeRegion: (id) => set((state) => ({
          regions: state.regions.filter((region) => region.id !== id),
          syncState: 'out_of_sync',
        })),

        reorderRegions: (fromIndex, toIndex) => set((state) => ({
          regions: moveItem(state.regions, fromIndex, toIndex),
          syncState: 'out_of_sync',
        })),

        setRegions: (regions) => set({
          regions: regions.map((region) => createDefaultRegion(region)),
          syncState: 'out_of_sync',
        }),

        addSegment: (segment) => {
          const normalized = createDefaultSegment(segment);
          set((state) => ({
            segments: [...state.segments, normalized],
            syncState: 'out_of_sync',
          }));
          return normalized.id;
        },

        updateSegment: (id, updates) => set((state) => ({
          segments: state.segments.map((segment) => {
            if (segment.id !== id) {
              return segment;
            }
            return {
              ...segment,
              ...updates,
              yoloId: updates.yoloId === undefined ? segment.yoloId : Math.max(0, updates.yoloId),
              creativity: updates.creativity === undefined ? segment.creativity : clamp(updates.creativity, 0, 1),
              threshold: updates.threshold === undefined ? segment.threshold : clamp(updates.threshold, 0, 1),
            };
          }),
          syncState: 'out_of_sync',
        })),

        removeSegment: (id) => set((state) => ({
          segments: state.segments.filter((segment) => segment.id !== id),
          syncState: 'out_of_sync',
        })),

        reorderSegments: (fromIndex, toIndex) => set((state) => ({
          segments: moveItem(state.segments, fromIndex, toIndex),
          syncState: 'out_of_sync',
        })),

        setSegments: (segments) => set({
          segments: segments.map((segment) => createDefaultSegment(segment)),
          syncState: 'out_of_sync',
        }),

        applyFromCanvas: (payload) => set({
          regions: payload.regions.map((region) => createDefaultRegion(region)),
          segments: payload.segments.map((segment) => createDefaultSegment(segment)),
          source: {
            imageUrl: payload.sourceImageUrl,
            imageWidth: payload.sourceImageWidth,
            imageHeight: payload.sourceImageHeight,
          },
          syncState: payload.syncState,
          lastCompiledBlock: payload.managedBlock,
          lastCompiledBlockHash: payload.managedBlockHash,
        }),

        markManualOverride: () => set({ syncState: 'manual_override' }),

        markOutOfSync: () => set((state) => ({
          syncState: state.syncState === 'manual_override' ? state.syncState : 'out_of_sync',
        })),

        markSynced: (managedBlock, managedBlockHash) => set({
          syncState: 'synced',
          lastCompiledBlock: managedBlock,
          lastCompiledBlockHash: managedBlockHash,
        }),

        clearManagedBlock: () => set({
          syncState: 'out_of_sync',
          lastCompiledBlock: '',
          lastCompiledBlockHash: '',
        }),

        clearAllRules: () => set({
          regions: [],
          segments: [],
          syncState: 'out_of_sync',
          lastCompiledBlock: '',
          lastCompiledBlockHash: '',
        }),

        reset: () => set(initialState),
      }),
      {
        name: 'swarmui-prompt-builder-storage',
        storage: createJSONStorage(() => createIndexedDbStorage('swarmui-prompt-builder')),
        partialize: (state) => ({
          regions: state.regions,
          segments: state.segments,
          source: state.source,
          syncState: state.syncState,
          lastCompiledBlock: state.lastCompiledBlock,
          lastCompiledBlockHash: state.lastCompiledBlockHash,
        }),
      },
    ),
    { name: 'PromptBuilderStore' },
  ),
);

export const selectPromptBuilderHasRules = (state: PromptBuilderStoreState): boolean =>
  state.regions.length > 0 || state.segments.length > 0;
