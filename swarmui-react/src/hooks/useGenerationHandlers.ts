/**
 * useGenerationHandlers Hook - Migrated to WebSocket Store
 *
 * This hook now uses the centralized WebSocket store for generation state.
 * Local state is only used for session gallery persistence and selection.
 */

import { useCallback, useEffect, useRef, useTransition } from 'react';
import { notifications } from '@mantine/notifications';
import { swarmClient } from '../api/client';
import { logger } from '../utils/logger';
import type { GenerateParams } from '../api/types';
import { useSessionImages, useCanvasNavigationState } from '../store/generationStore';
import { useAdaptiveAccentStore } from '../store/adaptiveAccentStore';
import {
    summarizeDiagnosticValue,
    useGenerationDiagnosticsStore,
    type OmittedGenerationParameter,
} from '../stores/generationDiagnosticsStore';
import { useWebSocketStore } from '../stores/websocketStore';
import { usePromptCacheStore } from '../stores/promptCacheStore';
import { resolveAssetUrl } from '../config/runtimeEndpoints';
import type { ModelMediaCapabilities } from '../utils/modelCapabilities';
import { imageUrlToDataUrl } from '../utils/imageData';
import { matchVideoProfile } from '../pages/GeneratePage/components/VideoSidebar/videoModelProfiles';

interface GenerationFeatureToggles {
    enableInitImage: boolean;
    enableRefiner: boolean;
    enableControlNet: boolean;
    enableVideo: boolean;
    enableVariation: boolean;
}

interface UseGenerationHandlersParams {
    featureToggles: GenerationFeatureToggles;
    mediaCapabilities: ModelMediaCapabilities;
}

interface UseGenerationHandlersReturn {
    generating: boolean;
    generatedImages: string[];
    currentImageIndex: number;
    handleGenerate: (values: GenerateParams, options?: { forceEnableRefiner?: boolean }) => Promise<void>;
    handleInterrupt: () => Promise<void>;
    setCurrentImageIndex: (index: number) => void;
    goToNextImage: () => void;
    goToPrevImage: () => void;
    setGeneratedImages: (images: string[]) => void;
    removeSessionImage: (index: number) => void;
}

interface GenerationDebugContext {
    generationId: string;
    model: string;
    payloadKeys: string[];
    payloadSummary: Record<string, unknown>;
    rawValueSummary: Record<string, unknown>;
    omittedParameters: OmittedGenerationParameter[];
    images?: unknown;
    steps?: unknown;
    requestStartedAt: number;
}

function createGenerationId(): string {
    return `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function summarizeRecord(record: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(record).map(([key, value]) => [key, summarizeDiagnosticValue(value)])
    );
}

function readFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

/**
 * Custom hook to manage image generation logic.
 * Uses the centralized WebSocket store for hot state and only persists final
 * session images plus selection in the secondary store.
 */
export function useGenerationHandlers({
    featureToggles,
    mediaCapabilities,
}: UseGenerationHandlersParams): UseGenerationHandlersReturn {
    const isGenerating = useWebSocketStore((state) => state.generation.isGenerating);
    const generationId = useWebSocketStore((state) => state.generation.generationId);
    const generationPhase = useWebSocketStore((state) => state.generation.phase);
    const generationRequestId = useWebSocketStore((state) => state.generation.requestId);
    const generationImageCount = useWebSocketStore((state) => state.generation.images.length);
    const latestGeneratedImage = useWebSocketStore((state) => {
        const images = state.generation.images;
        return images[images.length - 1] ?? null;
    });
    const generationError = useWebSocketStore((state) => state.generation.error);
    const generationErrorId = useWebSocketStore((state) => state.generation.errorId);
    const generationErrorData = useWebSocketStore((state) => state.generation.errorData);
    const startGeneration = useWebSocketStore((state) => state.startGeneration);
    const stopGeneration = useWebSocketStore((state) => state.stopGeneration);
    const isInitialized = useWebSocketStore((state) => state.isInitialized);

    const paramsRef = useRef<GenerateParams | null>(null);
    const lastErrorRef = useRef<string | null>(null);
    const lastCompletionRef = useRef<string | null>(null);
    const lastDebugContextRef = useRef<GenerationDebugContext | null>(null);
    const startDiagnosticsEntry = useGenerationDiagnosticsStore((state) => state.startEntry);
    const appendDiagnosticsEvent = useGenerationDiagnosticsStore((state) => state.appendEvent);
    const markDiagnosticsError = useGenerationDiagnosticsStore((state) => state.markError);
    const markDiagnosticsInterrupted = useGenerationDiagnosticsStore((state) => state.markInterrupted);

    const {
        sessionImages: generatedImages,
        addSessionImage,
        setSessionImages: setGeneratedImages,
        removeSessionImage,
    } = useSessionImages();
    const setAdaptiveAccentSourceImageUrl = useAdaptiveAccentStore((state) => state.setSourceImageUrl);

    const {
        currentImageIndex,
        setCurrentImageIndex,
        goToNextImage,
        goToPrevImage,
    } = useCanvasNavigationState();

    const generatedImagesRef = useRef(generatedImages);
    const [, startGalleryTransition] = useTransition();
    useEffect(() => {
        generatedImagesRef.current = generatedImages;
    }, [generatedImages]);

    const { enableInitImage, enableRefiner, enableControlNet, enableVideo, enableVariation } = featureToggles;
    const addPromptToCache = usePromptCacheStore((state) => state.addEntry);

    useEffect(() => {
        if (!latestGeneratedImage) {
            return;
        }

        const imagePath = latestGeneratedImage.startsWith('http')
            ? latestGeneratedImage
            : resolveAssetUrl(latestGeneratedImage.startsWith('/') ? latestGeneratedImage : `/${latestGeneratedImage}`);

        if (!generatedImagesRef.current.includes(imagePath)) {
            const nextImageIndex = generatedImagesRef.current.length;
            startGalleryTransition(() => {
                setCurrentImageIndex(nextImageIndex);
                addSessionImage(imagePath);
            });
        }
        setAdaptiveAccentSourceImageUrl(imagePath);
    }, [
        addSessionImage,
        latestGeneratedImage,
        setAdaptiveAccentSourceImageUrl,
        setCurrentImageIndex,
        startGalleryTransition,
    ]);

    useEffect(() => {
        if (!isGenerating && generationPhase === 'complete' && paramsRef.current) {
            const imageCount = generationImageCount;
            if (imageCount > 0) {
                const completionKey = `${generationRequestId || 'no-request'}:${imageCount}`;
                if (lastCompletionRef.current !== completionKey) {
                    lastCompletionRef.current = completionKey;
                    if (generatedImages.length > 0) {
                        setCurrentImageIndex(generatedImages.length - 1);
                    }
                    notifications.show({
                        title: 'Success',
                        message: `Generated ${imageCount} image(s)`,
                        color: 'green',
                    });

                    if (paramsRef.current.prompt && paramsRef.current.model) {
                        addPromptToCache(
                            paramsRef.current.prompt,
                            paramsRef.current.model,
                            paramsRef.current.negativeprompt
                        );
                        logger.debug('Prompt cached for Quick Variation mode');
                    }
                }
            }
        } else if (isGenerating || generationPhase !== 'complete') {
            lastCompletionRef.current = null;
        }
    }, [
        addPromptToCache,
        generationImageCount,
        generationPhase,
        generationRequestId,
        generatedImages.length,
        isGenerating,
        setCurrentImageIndex,
    ]);

    useEffect(() => {
        if (generationError) {
            const diagnosticsSummary = (() => {
                const backendErrorData = generationErrorData;
                const ctx = lastDebugContextRef.current;
                if (generationErrorId === 'missing_model_input' || generationErrorId === 'frontend_missing_model') {
                    const payloadKeys = (backendErrorData && typeof backendErrorData === 'object' && 'payloadKeys' in backendErrorData)
                        ? (backendErrorData as { payloadKeys?: string[] }).payloadKeys
                        : (backendErrorData && typeof backendErrorData === 'object' && 'raw_keys' in backendErrorData)
                            ? (backendErrorData as { raw_keys?: string[] }).raw_keys
                            : ctx?.payloadKeys;
                    return `Model=${ctx?.model || 'unknown'}; Keys=${payloadKeys?.join(', ') || 'unknown'}`;
                }
                return null;
            })();

            const errorMessage = diagnosticsSummary
                ? `${generationError} (${diagnosticsSummary})`
                : generationError;
            const surfacedErrorMessage = `${errorMessage} Diagnostics captured.`;

            if (lastErrorRef.current !== generationError) {
                lastErrorRef.current = generationError;
                if (generationImageCount > 0) {
                    notifications.show({
                        title: 'Generation Warning',
                        message: surfacedErrorMessage,
                        color: 'yellow',
                    });
                } else {
                    notifications.show({
                        title: 'Generation Error',
                        message: surfacedErrorMessage,
                        color: 'red',
                    });
                }
                logger.error('[useGenerationHandlers] generation error', {
                    error: generationError,
                    errorId: generationErrorId,
                    errorData: generationErrorData,
                    debugContext: lastDebugContextRef.current,
                    requestId: generationRequestId,
                    imagesSeen: generationImageCount,
                    phase: generationPhase,
                });
            }
        } else {
            lastErrorRef.current = null;
        }
    }, [
        generationError,
        generationErrorData,
        generationErrorId,
        generationImageCount,
        generationPhase,
        generationRequestId,
    ]);

    const handleGenerate = useCallback(async (values: GenerateParams, options?: { forceEnableRefiner?: boolean }) => {
        const normalizeModelValue = (value: unknown): string | null => {
            if (typeof value === 'string') {
                const trimmed = value.trim();
                return trimmed.length > 0 ? trimmed : null;
            }
            if (value && typeof value === 'object') {
                const obj = value as Record<string, unknown>;
                const candidates = [
                    obj.name,
                    obj.model,
                    obj.model_name,
                    obj.id,
                    obj.value,
                    obj.title,
                ];
                for (const candidate of candidates) {
                    if (typeof candidate === 'string') {
                        const trimmed = candidate.trim();
                        if (trimmed.length > 0) {
                            return trimmed;
                        }
                    }
                }
            }
            return null;
        };

        const asNumber = (value: unknown): number | null => {
            if (typeof value === 'number') {
                return Number.isFinite(value) ? value : null;
            }
            if (typeof value === 'string' && value.trim().length > 0) {
                const parsed = Number(value);
                return Number.isFinite(parsed) ? parsed : null;
            }
            return null;
        };

        const generationId = createGenerationId();
        const rawFormSummary = summarizeRecord(values as Record<string, unknown>);
        const normalizedModel = normalizeModelValue(values.model);

        const startDiagnosticAttempt = (input: {
            model?: string | null;
            payloadKeys?: string[];
            payloadSummary?: Record<string, unknown>;
            omittedParameters?: OmittedGenerationParameter[];
        }) => {
            startDiagnosticsEntry({
                generationId,
                model: input.model ?? normalizedModel ?? null,
                rawModel: values.model ?? null,
                payloadKeys: input.payloadKeys ?? [],
                payloadSummary: input.payloadSummary ?? {},
                rawValueSummary: rawFormSummary,
                omittedParameters: input.omittedParameters ?? [],
                totalSteps: asNumber(values.steps),
                totalBatches: asNumber(values.images),
            });
        };

        const recordEarlyFailure = (errorId: string, message: string, errorData?: Record<string, unknown>) => {
            startDiagnosticAttempt({
                model: normalizedModel,
                payloadKeys: [],
                payloadSummary: {},
            });
            appendDiagnosticsEvent(generationId, {
                type: 'frontend_abort',
                level: 'error',
                message,
                details: {
                    errorId,
                    ...errorData,
                },
            });
            markDiagnosticsError(generationId, {
                error: message,
                errorId,
                errorData,
            });
        };

        if (!normalizedModel) {
            recordEarlyFailure('frontend_missing_model', 'Please select a model before generating.', {
                rawModel: values.model ?? null,
                availableKeys: Object.keys(values || {}).sort(),
            });
            notifications.show({
                title: 'No Model Selected',
                message: 'Please select a model before generating.',
                color: 'red',
            });
            return;
        }

        if (!isInitialized) {
            recordEarlyFailure('frontend_not_ready', 'WebSocket connection not initialized. Please wait.', {
                model: normalizedModel,
            });
            notifications.show({
                title: 'Not Ready',
                message: 'WebSocket connection not initialized. Please wait.',
                color: 'yellow',
            });
            return;
        }

        const normalizedValues = { ...values, model: normalizedModel } as GenerateParams;

        const normalizeImageField = async (key: 'initimage' | 'maskimage') => {
            const rawValue = typeof normalizedValues[key] === 'string' ? normalizedValues[key].trim() : '';
            if (!rawValue || rawValue.startsWith('data:')) {
                return;
            }
            normalizedValues[key] = await imageUrlToDataUrl(rawValue);
        };

        try {
            if (enableInitImage) {
                await normalizeImageField('initimage');
                await normalizeImageField('maskimage');
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to prepare init-image data.';
            recordEarlyFailure('frontend_invalid_initimage', message, {
                initimage: values.initimage ?? null,
                maskimage: values.maskimage ?? null,
            });
            notifications.show({
                title: 'Init Image Failed',
                message,
                color: 'red',
            });
            return;
        }

        const legacyUpscaleModel = typeof normalizedValues.upscalemodel === 'string'
            ? normalizedValues.upscalemodel
            : '';
        if (legacyUpscaleModel) {
            normalizedValues.refinerupscalemethod = legacyUpscaleModel;
        }
        if (
            normalizedValues.refinercontrolpercentage === undefined &&
            normalizedValues.refinercontrol !== undefined &&
            normalizedValues.refinercontrol !== null
        ) {
            normalizedValues.refinercontrolpercentage = normalizedValues.refinercontrol as number;
        }

        // --- Video workflow injection ---
        // If video is enabled and the model matches a known profile, inject the workflow ID
        if (enableVideo && normalizedModel) {
            const videoProfile = matchVideoProfile(normalizedModel);
            if (videoProfile) {
                // Determine workflow type from init image presence
                const videoWorkflow = normalizedValues.initimage ? 'i2v' : 't2v';
                const workflowId = videoProfile.workflowId[videoWorkflow];
                if (workflowId) {
                    (normalizedValues as Record<string, unknown>)['comfyuiworkflow'] = workflowId;
                }
            }
        }

        paramsRef.current = normalizedValues;

        const coreParams = new Set([
            'prompt', 'negativeprompt', 'images', 'model', 'seed', 'steps', 'cfgscale',
            'width', 'height', 'sampler', 'scheduler',
        ]);

        const hasLoras = !!normalizedValues.loras;
        const hasMask = !!normalizedValues.maskimage;
        const submittedRefinerUpscale = readFiniteNumber(normalizedValues.refinerupscale);
        const submittedRefinerControl = readFiniteNumber(
            normalizedValues.refinercontrolpercentage ?? normalizedValues.refinercontrol
        );
        const submittedRefinerModel = typeof normalizedValues.refinermodel === 'string'
            ? normalizedValues.refinermodel.trim()
            : '';
        const submittedRefinerRequested = Boolean(
            (submittedRefinerUpscale !== null && submittedRefinerUpscale !== 1)
            || (submittedRefinerControl !== null && submittedRefinerControl > 0)
            || submittedRefinerModel
        );
        const shouldIncludeRefiner = options?.forceEnableRefiner ?? (enableRefiner || submittedRefinerRequested);

        const includeParam = (key: string): boolean => {
            if (coreParams.has(key)) return true;

            if (['initimage', 'initimagecreativity', 'initimageresettonorm', 'initimagenoise'].includes(key)) return enableInitImage;
            if (['resizemode', 'seamlesstileable'].includes(key)) return enableInitImage;
            if (['maskimage', 'maskblur', 'invertmask'].includes(key)) return enableInitImage && hasMask;

            if (['variationseed', 'variationseedstrength'].includes(key)) return enableVariation;
            if (['loras', 'loraweights'].includes(key)) return hasLoras;
            if (key === 'nopreviews') return normalizedValues.nopreviews === true;

            if (
                [
                    'refinermodel',
                    'refinercontrolpercentage',
                    'refinerupscale',
                    'refinermethod',
                    'refinervae',
                    'refinersteps',
                    'refinercfgscale',
                    'refinerdotiling',
                    'refinerupscalemethod',
                ].includes(key)
            ) return shouldIncludeRefiner;

            if (
                [
                    'controlnetmodel',
                    'controlnetimageinput',
                    'controlnetstrength',
                    'controlnetstart',
                    'controlnetend',
                    'controlnettwomodel',
                    'controlnettwoimageinput',
                    'controlnettwostrength',
                    'controlnettwostart',
                    'controlnettwoend',
                    'controlnetthreemodel',
                    'controlnetthreeimageinput',
                    'controlnetthreestrength',
                    'controlnetthreestart',
                    'controlnetthreeend',
                    'controlnetpreprocessor',
                    'controlnettwopreprocessor',
                    'controlnetthreepreprocessor',
                ].includes(key)
            ) return enableControlNet;

            if (['videomodel', 'videoframes', 'videosteps', 'videocfg', 'videofps', 'videoformat', 'videoboomerang'].includes(key)) {
                return enableVideo && mediaCapabilities.supportsImageToVideo;
            }
            if (['text2videoframes', 'text2videofps', 'text2videoformat'].includes(key)) {
                return enableVideo && mediaCapabilities.supportsTextToVideo;
            }
            if (key === 'comfyuiworkflow') return enableVideo;

            if (key === 'batchsize') return normalizedValues.batchsize !== undefined && normalizedValues.batchsize !== 1;
            if (key === 'vae') return normalizedValues.vae !== undefined && normalizedValues.vae !== 'Automatic' && normalizedValues.vae !== '';
            if (key === 'clipstopatlayer') return normalizedValues.clipstopatlayer !== undefined && normalizedValues.clipstopatlayer !== -1;
            if (key === 'seamlesstileable') return !!normalizedValues.seamlesstileable;
            if (key === 'removebackground') return normalizedValues.removebackground === true;
            if (key === 'donotsave') return normalizedValues.donotsave === true;
            if (key === 'dontsaveintermediates') return normalizedValues.dontsaveintermediates === true;
            if (key === 'upscalemodel') return false;
            if (key === 'refinercontrol') return false;

            return false;
        };

        const omittedParameters: OmittedGenerationParameter[] = [];
        const backendParams: Partial<GenerateParams> = {};

        for (const [key, value] of Object.entries(normalizedValues)) {
            if (!includeParam(key)) {
                omittedParameters.push({
                    key,
                    reason: key === 'upscalemodel' || key === 'refinercontrol'
                        ? 'legacy_alias'
                        : 'feature_filtered',
                    value,
                });
                continue;
            }
            if (value === '' || value === undefined || value === null) {
                omittedParameters.push({
                    key,
                    reason: 'empty_value',
                    value,
                });
                continue;
            }
            if (value === false) {
                omittedParameters.push({
                    key,
                    reason: 'false_value',
                    value,
                });
                continue;
            }

            if (key === 'images') {
                backendParams[key] = value as number;
            } else {
                backendParams[key] = typeof value === 'number' ? String(value) : value;
            }
        }

        const backendModel = normalizeModelValue(backendParams.model);
        if (!backendModel) {
            logger.error('[useGenerationHandlers] Model sync issue: backend payload missing valid model', {
                valuesModel: values.model,
                normalizedModel,
                backendPayloadModel: backendParams.model,
            });
            startDiagnosticAttempt({
                model: normalizedModel,
                payloadKeys: Object.keys(backendParams).sort(),
                payloadSummary: summarizeRecord(backendParams as Record<string, unknown>),
                omittedParameters,
            });
            appendDiagnosticsEvent(generationId, {
                type: 'frontend_payload_error',
                level: 'error',
                message: 'Model value was lost before the websocket request was sent.',
                details: {
                    valuesModel: values.model ?? null,
                    normalizedModel,
                    backendPayloadModel: backendParams.model ?? null,
                    finalPayloadKeys: Object.keys(backendParams).sort(),
                },
            });
            markDiagnosticsError(generationId, {
                error: 'Model value was lost before request send.',
                errorId: 'frontend_payload_missing_model',
                errorData: {
                    valuesModel: values.model ?? null,
                    normalizedModel,
                    backendPayloadModel: backendParams.model ?? null,
                },
            });
            notifications.show({
                title: 'Model Sync Error',
                message: 'Model value was lost before request send. Please reselect your model and try again.',
                color: 'red',
            });
            return;
        }

        backendParams.model = backendModel;
        const payloadKeys = Object.keys(backendParams).sort();
        const payloadSummary = summarizeRecord(backendParams as Record<string, unknown>);
        startDiagnosticAttempt({
            model: backendModel,
            payloadKeys,
            payloadSummary,
            omittedParameters,
        });
        appendDiagnosticsEvent(generationId, {
            type: 'frontend_prepare',
            level: 'info',
            message: 'Frontend prepared websocket generation payload.',
            details: {
                featureToggles,
                modelNormalization: {
                    rawModel: values.model ?? null,
                    normalizedModel,
                    finalModel: backendModel,
                },
                finalPayloadKeys: payloadKeys,
                omittedParameters,
            },
        });

        lastDebugContextRef.current = {
            generationId,
            model: backendModel,
            payloadKeys,
            payloadSummary,
            rawValueSummary: rawFormSummary,
            omittedParameters,
            images: backendParams.images,
            steps: backendParams.steps,
            requestStartedAt: Date.now(),
        };

        logger.debug('[useGenerationHandlers] Starting generation with WebSocket store:', backendParams);
        logger.info('Starting generation with WebSocket store:', backendParams);

        startGeneration(backendParams as GenerateParams, generationId);
    }, [
        appendDiagnosticsEvent,
        enableControlNet,
        enableInitImage,
        enableRefiner,
        enableVariation,
        enableVideo,
        featureToggles,
        isInitialized,
        markDiagnosticsError,
        mediaCapabilities.supportsImageToVideo,
        mediaCapabilities.supportsTextToVideo,
        startDiagnosticsEntry,
        startGeneration,
    ]);

    const handleInterrupt = useCallback(async () => {
        try {
            if (generationId) {
                markDiagnosticsInterrupted(generationId, 'User interrupted generation.');
            }

            stopGeneration();
            await swarmClient.interruptAll();

            notifications.show({
                title: 'Interrupted',
                message: 'Generation cancelled',
                color: 'yellow',
            });
        } catch (error) {
            console.error('Failed to interrupt:', error);
        }
    }, [generationId, markDiagnosticsInterrupted, stopGeneration]);

    return {
        generating: isGenerating,
        generatedImages,
        currentImageIndex,
        handleGenerate,
        handleInterrupt,
        setCurrentImageIndex,
        goToNextImage,
        goToPrevImage,
        setGeneratedImages,
        removeSessionImage,
    };
}
