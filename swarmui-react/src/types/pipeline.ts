import type { GenerateParams } from '../api/types';

export type PipelineStageKind = 'generate' | 'latent_upscale' | 'refine' | 'ai_upscale';

export type PipelineInheritanceKind = 'inherit' | 'override' | 'random' | 'increment';

export interface PipelineInheritanceConfig {
    prompt: 'inherit' | 'override';
    negativePrompt: 'inherit' | 'override';
    seed: 'inherit' | 'random' | 'increment';
    model: 'inherit' | 'override';
    dimensions: 'inherit' | 'override';
}

export interface PipelineStageConfig {
    id: string;
    kind: PipelineStageKind;
    enabled: boolean;
    label: string;
    settings: Partial<GenerateParams>;
    inherits: PipelineInheritanceConfig;
}

export interface PipelineRun {
    id: string;
    pipelineId: string;
    pipelineName: string;
    stages: PipelineStageConfig[];
    startedAt: number;
    completedAt?: number;
    stagesCompleted: number;
    stagesTotal: number;
    status: 'running' | 'completed' | 'cancelled' | 'error';
    error?: string;
}

export interface PipelineStageResult {
    pipelineRunId: string;
    stageId: string;
    kind: PipelineStageKind;
    inputImage: string | null;
    outputImage: string;
    outputMetadata: Record<string, unknown> | null;
    settings: Partial<GenerateParams>;
    startedAt: number;
    completedAt: number;
    error: string | null;
}

export interface PipelinePreset {
    id: string;
    name: string;
    description: string;
    stages: PipelineStageConfig[];
    isBuiltIn: boolean;
}

export const PIPELINE_STAGE_LABELS: Record<PipelineStageKind, string> = {
    generate: 'Generate',
    latent_upscale: 'Latent Upscale',
    refine: 'Refine',
    ai_upscale: 'AI Upscale',
};

export const PIPELINE_STAGE_DESCRIPTIONS: Record<PipelineStageKind, string> = {
    generate: 'Create the initial image from text or init image.',
    latent_upscale: 'Increase resolution while allowing diffusion to add coherent detail.',
    refine: 'Controlled diffusion pass to improve detail, lighting, and texture.',
    ai_upscale: 'Dedicated pixel-space upscaler model such as Remacri, UltraSharp, or ESRGAN.',
};

export function getStageKindInfo(kind: PipelineStageKind): {
    kind: PipelineStageKind;
    label: string;
    description: string;
    defaultSettings: Partial<GenerateParams>;
    defaultInheritance: PipelineInheritanceConfig;
} {
    const defaults: Record<PipelineStageKind, { settings: Partial<GenerateParams>; inherits: PipelineInheritanceConfig }> = {
        generate: {
            settings: {},
            inherits: {
                prompt: 'override',
                negativePrompt: 'override',
                seed: 'random',
                model: 'override',
                dimensions: 'override',
            },
        },
        latent_upscale: {
            settings: {
                refinerupscale: 2,
                refinerupscalemethod: 'latent-bicubic',
                refinercontrolpercentage: 0,
                refinermethod: 'PostApply',
            },
            inherits: {
                prompt: 'inherit',
                negativePrompt: 'inherit',
                seed: 'inherit',
                model: 'inherit',
                dimensions: 'inherit',
            },
        },
        refine: {
            settings: {
                refinercontrolpercentage: 0.3,
                refinerupscale: 1,
                refinermethod: 'PostApply',
            },
            inherits: {
                prompt: 'inherit',
                negativePrompt: 'inherit',
                seed: 'increment',
                model: 'inherit',
                dimensions: 'inherit',
            },
        },
        ai_upscale: {
            settings: {
                refinerupscale: 2,
                refinerupscalemethod: 'pixel-lanczos',
                refinercontrolpercentage: 0,
                refinermethod: 'PostApply',
            },
            inherits: {
                prompt: 'inherit',
                negativePrompt: 'inherit',
                seed: 'inherit',
                model: 'inherit',
                dimensions: 'inherit',
            },
        },
    };

    const info = defaults[kind];
    return {
        kind,
        label: PIPELINE_STAGE_LABELS[kind],
        description: PIPELINE_STAGE_DESCRIPTIONS[kind],
        defaultSettings: { ...info.settings },
        defaultInheritance: { ...info.inherits },
    };
}

export function createStageConfig(kind: PipelineStageKind): PipelineStageConfig {
    const info = getStageKindInfo(kind);
    return {
        id: `stage_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        kind,
        enabled: true,
        label: info.label,
        settings: { ...info.defaultSettings },
        inherits: { ...info.defaultInheritance },
    };
}

export function createPipelineId(): string {
    return `pipeline_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function createPipelineRunId(): string {
    return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
