import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type {
    PipelineStageConfig,
    PipelineRun,
    PipelineStageResult,
    PipelinePreset,
    PipelineStageKind,
} from '../types/pipeline';
import { createStageConfig, createPipelineId, createPipelineRunId } from '../types/pipeline';

interface PipelineStoreState {
    pipelineId: string;
    pipelineName: string;
    stages: PipelineStageConfig[];
    activePresetId: string | null;
    userPresets: PipelinePreset[];
    currentRun: PipelineRun | null;
    currentStageIndex: number;
    stageResults: Record<string, PipelineStageResult>;
    isRunning: boolean;
    autoSync: boolean;
}

interface PipelineStoreActions {
    setPipelineName: (name: string) => void;
    addStage: (kind: PipelineStageKind) => void;
    removeStage: (stageId: string) => void;
    toggleStage: (stageId: string) => void;
    reorderStages: (fromIndex: number, toIndex: number) => void;
    updateStageSettings: (stageId: string, settings: Record<string, unknown>) => void;
    updateStageInheritance: (stageId: string, inherits: Partial<PipelineStageConfig['inherits']>) => void;
    resetPipeline: () => void;
    startPipelineRun: () => void;
    advanceStage: () => void;
    recordStageResult: (result: PipelineStageResult) => void;
    completePipeline: () => void;
    cancelPipeline: () => void;
    failPipeline: (error: string) => void;
    savePreset: (name: string, description: string) => PipelinePreset;
    loadPreset: (presetId: string) => void;
    deletePreset: (presetId: string) => void;
    setAutoSync: (value: boolean) => void;
}

export type PipelineStore = PipelineStoreState & PipelineStoreActions;

const initialPipelineState: PipelineStoreState = {
    pipelineId: createPipelineId(),
    pipelineName: 'New Pipeline',
    stages: [createStageConfig('generate')],
    activePresetId: null,
    userPresets: [],
    currentRun: null,
    currentStageIndex: 0,
    stageResults: {},
    isRunning: false,
    autoSync: true,
};

export const usePipelineStore = create<PipelineStore>()(
    devtools(
        persist<PipelineStore>(
            (set, get) => ({
                ...initialPipelineState,

                setPipelineName: (name) => {
                    set({ pipelineName: name });
                },

                addStage: (kind) => {
                    set((state) => ({
                        stages: [...state.stages, createStageConfig(kind)],
                    }));
                },

                removeStage: (stageId) => {
                    set((state) => ({
                        stages: state.stages.filter((s) => s.id !== stageId),
                    }));
                },

                toggleStage: (stageId) => {
                    set((state) => ({
                        stages: state.stages.map((s) =>
                            s.id === stageId ? { ...s, enabled: !s.enabled } : s
                        ),
                    }));
                },

                reorderStages: (fromIndex, toIndex) => {
                    set((state) => {
                        const next = [...state.stages];
                        const clampedTo = Math.max(0, Math.min(toIndex, next.length - 1));
                        const [moved] = next.splice(fromIndex, 1);
                        next.splice(clampedTo, 0, moved);
                        return { stages: next };
                    });
                },

                updateStageSettings: (stageId, settings) => {
                    set((state) => ({
                        stages: state.stages.map((s) =>
                            s.id === stageId
                                ? { ...s, settings: { ...s.settings, ...settings } }
                                : s
                        ),
                    }));
                },

                updateStageInheritance: (stageId, inherits) => {
                    set((state) => ({
                        stages: state.stages.map((s) =>
                            s.id === stageId
                                ? { ...s, inherits: { ...s.inherits, ...inherits } }
                                : s
                        ),
                    }));
                },

                resetPipeline: () => {
                    set({
                        pipelineId: createPipelineId(),
                        pipelineName: 'New Pipeline',
                        stages: [createStageConfig('generate')],
                        activePresetId: null,
                    });
                },

                startPipelineRun: () => {
                    const state = get();
                    const enabledStages = state.stages.filter((s) => s.enabled);
                    if (enabledStages.length === 0) {
                        return;
                    }
                    const run: PipelineRun = {
                        id: createPipelineRunId(),
                        pipelineId: state.pipelineId,
                        pipelineName: state.pipelineName,
                        stages: state.stages,
                        startedAt: Date.now(),
                        stagesCompleted: 0,
                        stagesTotal: enabledStages.length,
                        status: 'running',
                    };
                    set({
                        currentRun: run,
                        currentStageIndex: 0,
                        stageResults: {},
                        isRunning: true,
                    });
                },

                advanceStage: () => {
                    set((state) => {
                        const nextIndex = state.currentStageIndex + 1;
                        const enabledStages = state.stages.filter((s) => s.enabled);
                        const run = state.currentRun;
                        return {
                            currentStageIndex: nextIndex,
                            currentRun: run
                                ? {
                                      ...run,
                                      stagesCompleted: Math.min(nextIndex, enabledStages.length),
                                  }
                                : null,
                        };
                    });
                },

                recordStageResult: (result) => {
                    set((state) => ({
                        stageResults: { ...state.stageResults, [result.stageId]: result },
                    }));
                },

                completePipeline: () => {
                    set((state) => {
                        return {
                            isRunning: false,
                            currentRun: state.currentRun
                                ? {
                                      ...state.currentRun,
                                      status: 'completed' as const,
                                      completedAt: Date.now(),
                                      stagesCompleted: state.stages.filter((s) => s.enabled).length,
                                  }
                                : null,
                        };
                    });
                },

                cancelPipeline: () => {
                    set((state) => ({
                        isRunning: false,
                        currentRun: state.currentRun
                            ? {
                                  ...state.currentRun,
                                  status: 'cancelled' as const,
                                  completedAt: Date.now(),
                              }
                            : null,
                    }));
                },

                failPipeline: (error) => {
                    set((state) => ({
                        isRunning: false,
                        currentRun: state.currentRun
                            ? {
                                  ...state.currentRun,
                                  status: 'error' as const,
                                  completedAt: Date.now(),
                                  error,
                              }
                            : null,
                    }));
                },

                savePreset: (name, description) => {
                    const state = get();
                    const preset: PipelinePreset = {
                        id: `preset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                        name,
                        description,
                        stages: state.stages.map((s) => ({ ...s })),
                        isBuiltIn: false,
                    };
                    set((state) => ({
                        userPresets: [...state.userPresets, preset],
                        activePresetId: preset.id,
                    }));
                    return preset;
                },

                loadPreset: (presetId) => {
                    const state = get();
                    const preset = state.userPresets.find((p) => p.id === presetId);
                    if (!preset) {
                        return;
                    }
                    const nextStages = preset.stages.map((s) => ({
                        ...s,
                        id: `stage_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                    }));
                    set({
                        stages: nextStages,
                        activePresetId: presetId,
                    });
                },

                deletePreset: (presetId) => {
                    set((state) => ({
                        userPresets: state.userPresets.filter((p) => p.id !== presetId),
                        activePresetId: state.activePresetId === presetId ? null : state.activePresetId,
                    }));
                },

                setAutoSync: (value) => set({ autoSync: value }),
            }),
            {
                name: 'swarmui-pipeline-storage',
                partialize: (state) => ({
                    pipelineId: state.pipelineId,
                    pipelineName: state.pipelineName,
                    stages: state.stages,
                    activePresetId: state.activePresetId,
                    userPresets: state.userPresets,
                }) as unknown as PipelineStore,
                version: 1,
            }
        ),
        { name: 'PipelineStore' }
    )
);
