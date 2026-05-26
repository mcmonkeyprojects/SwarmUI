import { useCallback, useEffect, useRef } from 'react';
import { useWebSocketStore } from '../stores/websocketStore';
import { usePipelineStore } from '../stores/pipelineStore';
import type { GenerateParams } from '../api/types';
import type { PipelineStageConfig, PipelineStageResult } from '../types/pipeline';
import { imageUrlToDataUrl, toRuntimeImageUrl } from '../utils/imageData';
import { applyLegacyVaeSelection } from '../utils/upscalePayload';

const PIPELINE_STAGE_PARAM_KEYS = [
    'refinerupscale',
    'refinerupscalemethod',
    'refinercontrol',
    'refinercontrolpercentage',
    'refinermethod',
    'refinermodel',
    'refinervae',
    'refinersteps',
    'refinercfgscale',
    'refinerdotiling',
    'upscalemodel',
    'chainupscalemethod',
    'chainupscalescale',
];

function readNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function getResultDimensions(result: PipelineStageResult | null): { width: number | null; height: number | null } {
    const metadata = result?.outputMetadata;
    if (!metadata) {
        return { width: null, height: null };
    }

    return {
        width: readNumber(metadata.width),
        height: readNumber(metadata.height),
    };
}

function estimateStageOutputDimensions(params: GenerateParams): { width: number | null; height: number | null } {
    const width = readNumber(params.width);
    const height = readNumber(params.height);
    const scale = readNumber(params.refinerupscale) ?? 1;
    if (width === null || height === null) {
        return { width: null, height: null };
    }

    return {
        width: Math.round(width * scale),
        height: Math.round(height * scale),
    };
}

function buildStageGenerateParams(
    stage: PipelineStageConfig,
    parentResult: PipelineStageResult | null,
    baseParams: Partial<GenerateParams>
): GenerateParams {
    const params: Record<string, unknown> = { ...baseParams };
    for (const key of PIPELINE_STAGE_PARAM_KEYS) {
        delete params[key];
    }

    if (parentResult && parentResult.outputMetadata) {
        const meta = parentResult.outputMetadata;
        const suiParams = (meta.sui_image_params || meta) as Record<string, unknown>;

        if (stage.inherits.prompt === 'inherit' && suiParams.prompt) {
            params.prompt = suiParams.prompt;
        }
        if (stage.inherits.negativePrompt === 'inherit' && suiParams.negativeprompt) {
            params.negativeprompt = suiParams.negativeprompt;
        }
    }

    if (parentResult) {
        if (stage.inherits.seed === 'increment' && typeof params.seed === 'number') {
            params.seed = (params.seed as number) + 1;
        } else if (stage.inherits.seed === 'random') {
            params.seed = -1;
        }
    } else {
        if (stage.inherits.seed === 'random') {
            params.seed = -1;
        }
    }

    for (const [key, value] of Object.entries(stage.settings)) {
        if (value !== undefined && value !== null && value !== '' && value !== false) {
            params[key] = value;
        }
    }

    if (parentResult && parentResult.outputImage) {
        params.initimage = parentResult.outputImage;
        params.initimagecreativity = 0;
        params.images = 1;
        const parentDimensions = getResultDimensions(parentResult);
        if (parentDimensions.width !== null) {
            params.width = parentDimensions.width;
        }
        if (parentDimensions.height !== null) {
            params.height = parentDimensions.height;
        }
    }

    return params as GenerateParams;
}

async function prepareStageGenerateParams(params: GenerateParams): Promise<GenerateParams> {
    const prepared = { ...params } as GenerateParams;
    const normalizeImageField = async (key: 'initimage' | 'maskimage') => {
        const rawValue = typeof prepared[key] === 'string' ? prepared[key].trim() : '';
        if (!rawValue || rawValue.startsWith('data:')) {
            return;
        }
        prepared[key] = await imageUrlToDataUrl(toRuntimeImageUrl(rawValue));
    };

    await normalizeImageField('initimage');
    await normalizeImageField('maskimage');

    if (
        prepared.refinercontrolpercentage === undefined &&
        prepared.refinercontrol !== undefined &&
        prepared.refinercontrol !== null
    ) {
        prepared.refinercontrolpercentage = prepared.refinercontrol as number;
    }
    if (typeof prepared.upscalemodel === 'string' && prepared.upscalemodel) {
        prepared.refinerupscalemethod = prepared.upscalemodel;
    }
    delete prepared.refinercontrol;
    delete prepared.upscalemodel;
    applyLegacyVaeSelection(prepared);
    return prepared;
}

export function usePipelineOrchestrator() {
    const startGeneration = useWebSocketStore((state) => state.startGeneration);
    const stopGeneration = useWebSocketStore((state) => state.stopGeneration);

    const isRunning = usePipelineStore((state) => state.isRunning);
    const currentStageIndex = usePipelineStore((state) => state.currentStageIndex);
    const cancelPipeline = usePipelineStore((state) => state.cancelPipeline);
    const startPipelineRun = usePipelineStore((state) => state.startPipelineRun);

    const baseParamsRef = useRef<Partial<GenerateParams>>({});
    const activeStageParamsRef = useRef<GenerateParams | null>(null);
    const activeStageStartedAtRef = useRef<number | null>(null);
    const isCancellingRef = useRef(false);
    const isRunningRef = useRef(isRunning);

    useEffect(() => {
        isRunningRef.current = isRunning;
    }, [isRunning]);

    const runNextStage = useCallback(async () => {
        if (isCancellingRef.current) {
            return;
        }

        const state = usePipelineStore.getState();
        const enabledStages = state.stages.filter((s) => s.enabled);
        if (state.currentStageIndex >= enabledStages.length) {
            state.completePipeline();
            return;
        }

        const stage = enabledStages[state.currentStageIndex];
        let parentResult: PipelineStageResult | null = null;
        if (state.currentStageIndex > 0) {
            const parentStage = enabledStages[state.currentStageIndex - 1];
            parentResult = state.stageResults[parentStage.id] || null;
        }

        try {
            const params = buildStageGenerateParams(stage, parentResult, baseParamsRef.current);
            const preparedParams = await prepareStageGenerateParams(params);
            if (isCancellingRef.current) {
                return;
            }
            activeStageParamsRef.current = preparedParams;
            activeStageStartedAtRef.current = Date.now();
            startGeneration(preparedParams);
        } catch (error) {
            activeStageParamsRef.current = null;
            activeStageStartedAtRef.current = null;
            state.failPipeline(error instanceof Error ? error.message : 'Pipeline stage preparation failed.');
        }
    }, [startGeneration]);

    const runPipeline = useCallback(
        (baseParams: Partial<GenerateParams>) => {
            baseParamsRef.current = baseParams;
            isCancellingRef.current = false;
            startPipelineRun();
        },
        [startPipelineRun]
    );

    const stopPipeline = useCallback(() => {
        isCancellingRef.current = true;
        activeStageParamsRef.current = null;
        activeStageStartedAtRef.current = null;
        stopGeneration();
        cancelPipeline();
    }, [cancelPipeline, stopGeneration]);

    useEffect(() => {
        if (!isRunning) {
            return undefined;
        }

        const handleCompletion = (wsState: ReturnType<typeof useWebSocketStore.getState>) => {
            if (!isRunningRef.current || isCancellingRef.current) {
                return;
            }

            const pipelineState = usePipelineStore.getState();
            const enabledStages = pipelineState.stages.filter((s) => s.enabled);
            const stageIndex = pipelineState.currentStageIndex;

            if (stageIndex >= enabledStages.length) {
                return;
            }

            const stage = enabledStages[stageIndex];
            const lastImage = wsState.generation.images[wsState.generation.images.length - 1];

            let inputImage: string | null = null;
            if (stageIndex > 0) {
                const parentStage = enabledStages[stageIndex - 1];
                const parentResult = pipelineState.stageResults[parentStage.id];
                if (parentResult) {
                    inputImage = parentResult.outputImage;
                }
            }

            if (wsState.generation.phase === 'complete') {
                if (lastImage) {
                    const submittedParams = activeStageParamsRef.current;
                    const outputDimensions = submittedParams
                        ? estimateStageOutputDimensions(submittedParams)
                        : { width: null, height: null };
                    const result: PipelineStageResult = {
                        pipelineRunId: pipelineState.currentRun?.id ?? '',
                        stageId: stage.id,
                        kind: stage.kind,
                        inputImage,
                        outputImage: lastImage,
                        outputMetadata: {
                            width: outputDimensions.width,
                            height: outputDimensions.height,
                            sui_image_params: submittedParams ?? {},
                        },
                        settings: { ...stage.settings },
                        startedAt: activeStageStartedAtRef.current ?? Date.now(),
                        completedAt: Date.now(),
                        error: null,
                    };
                    pipelineState.recordStageResult(result);
                }
                activeStageParamsRef.current = null;
                activeStageStartedAtRef.current = null;
                pipelineState.advanceStage();
            } else if (wsState.generation.phase === 'error') {
                const result: PipelineStageResult = {
                    pipelineRunId: pipelineState.currentRun?.id ?? '',
                    stageId: stage.id,
                    kind: stage.kind,
                    inputImage,
                    outputImage: lastImage ?? '',
                    outputMetadata: null,
                    settings: { ...stage.settings },
                    startedAt: activeStageStartedAtRef.current ?? Date.now(),
                    completedAt: Date.now(),
                    error: wsState.generation.error ?? 'Unknown error',
                };
                pipelineState.recordStageResult(result);
                activeStageParamsRef.current = null;
                activeStageStartedAtRef.current = null;
                pipelineState.failPipeline(wsState.generation.error ?? 'Unknown error');
            }
        };

        const unsubscribe = useWebSocketStore.subscribe((state, prevState) => {
            if (!isRunningRef.current || isCancellingRef.current) {
                return;
            }
            if (prevState.generation.isGenerating && !state.generation.isGenerating) {
                handleCompletion(state);
            }
        });

        return () => {
            unsubscribe();
        };
    }, [isRunning]);

    const prevRunningRef = useRef(false);
    useEffect(() => {
        if (isRunning && !prevRunningRef.current) {
            const enabledStages = usePipelineStore.getState().stages.filter((s) => s.enabled);
            if (enabledStages.length > 0) {
                void runNextStage();
            }
        }
        prevRunningRef.current = isRunning;
    }, [isRunning, runNextStage]);

    const prevStageIndexRef = useRef(currentStageIndex);
    useEffect(() => {
        if (
            isRunning &&
            currentStageIndex > 0 &&
            currentStageIndex !== prevStageIndexRef.current
        ) {
            void runNextStage();
        }
        prevStageIndexRef.current = currentStageIndex;
    }, [currentStageIndex, isRunning, runNextStage]);

    return { runPipeline, stopPipeline, isRunning };
}
