/**
 * WebSocket Store
 * 
 * Centralized Zustand store for all WebSocket-related state.
 * Provides reactive access to generation, model loading, and download progress.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { GenerateParams } from '../api/types';
import { swarmBackendAdapter } from '../api/backendAdapter';
import { swarmClient } from '../api/client';
import { featureFlags } from '../config/featureFlags';
import { logger } from '../utils/logger';
import { summarizeDiagnosticValue, useGenerationDiagnosticsStore } from './generationDiagnosticsStore';
import { usePerformanceSessionStore } from './performanceSessionStore';
import {
    initWSManager,
    getWSManager,
    updateWSManagerSession,
    type GenerationProgressData,
    type GenerationImageData,
    type ModelProgressData,
    type DownloadProgressData,
    type ConnectionState,
} from '../api/ws';

// ============================================================================
// Types
// ============================================================================

export interface GenerationState {
    isGenerating: boolean;
    hasProgressEvent: boolean;
    generationId: string | null;
    requestId: string | null;
    progress: number;
    currentStep: number;
    totalSteps: number;
    stageId: string | null;
    stageLabel: string | null;
    stageDetail: string | null;
    stageIndex: number;
    stageCount: number;
    stagesRemaining: number;
    stageTaskIndex: number;
    stageTaskCount: number;
    stageTasksRemaining: number;
    currentBatch: number;
    totalBatches: number;
    previewImage: string | null;
    previewRevision: number;
    images: string[];
    error: string | null;
    errorId: string | null;
    errorData: unknown;
    phase: 'idle' | 'starting' | 'connected' | 'waiting' | 'progress' | 'image' | 'complete' | 'error';
    lastEventAt: number | null;
    startTime: number | null;
}

export interface ModelLoadingState {
    isLoading: boolean;
    progress: number;
    modelName: string | null;
    loadingCount: number;
    isProgressEstimated: boolean;
    error: string | null;
}

export interface DownloadState {
    id: string;
    name: string;
    progress: number;
    bytesPerSecond: number;
    status: 'downloading' | 'complete' | 'error';
    error: string | null;
}

export interface SessionRecoveryState {
    isRecovering: boolean;
    attempts: number;
    lastRecoveredAt: number | null;
    lastError: string | null;
}

export interface ConnectionIssueState {
    endpoint: string | null;
    reason: string | null;
    missedPongs: number;
    lastTransitionAt: number | null;
}

export interface WebSocketStoreState {
    // Initialization
    isInitialized: boolean;

    // Connection health
    connectionHealth: 'connected' | 'degraded' | 'unhealthy' | 'disconnected';
    connectionIssue: ConnectionIssueState;

    // Connection states
    connections: Map<string, ConnectionState>;

    // Generation state
    generation: GenerationState;

    // Model loading state
    modelLoading: ModelLoadingState;

    // Active downloads
    downloads: Map<string, DownloadState>;

    // Session recovery diagnostics
    sessionRecovery: SessionRecoveryState;
}

export interface WebSocketStoreActions {
    // Initialization
    initialize: (wsBaseUrl: string, sessionId: string | null, reason?: string) => void;
    updateSession: (sessionId: string, reason?: string) => void;

    // Generation actions
    startGeneration: (params: GenerateParams, generationId?: string) => string;
    stopGeneration: () => void;
    clearGeneration: () => void;

    // Model loading actions
    loadModel: (modelName: string) => void;
    clearModelLoading: () => void;

    // Download actions
    startDownload: (params: { url: string; type: string; name: string; metadata?: string }) => void;
    cancelDownload: (downloadId: string) => void;
    clearDownload: (downloadId: string) => void;

    // Reset
    reset: () => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialGenerationState: GenerationState = {
    isGenerating: false,
    hasProgressEvent: false,
    generationId: null,
    requestId: null,
    progress: 0,
    currentStep: 0,
    totalSteps: 0,
    stageId: null,
    stageLabel: null,
    stageDetail: null,
    stageIndex: 0,
    stageCount: 0,
    stagesRemaining: 0,
    stageTaskIndex: 0,
    stageTaskCount: 0,
    stageTasksRemaining: 0,
    currentBatch: 0,
    totalBatches: 1,
    previewImage: null,
    previewRevision: 0,
    images: [],
    error: null,
    errorId: null,
    errorData: null,
    phase: 'idle',
    lastEventAt: null,
    startTime: null,
};

const initialModelLoadingState: ModelLoadingState = {
    isLoading: false,
    progress: 0,
    modelName: null,
    loadingCount: 0,
    isProgressEstimated: false,
    error: null,
};

const initialState: WebSocketStoreState = {
    isInitialized: false,
    connectionHealth: 'disconnected',
    connectionIssue: {
        endpoint: null,
        reason: null,
        missedPongs: 0,
        lastTransitionAt: null,
    },
    connections: new Map(),
    generation: initialGenerationState,
    modelLoading: initialModelLoadingState,
    downloads: new Map(),
    sessionRecovery: {
        isRecovering: false,
        attempts: 0,
        lastRecoveredAt: null,
        lastError: null,
    },
};

const PROGRESS_UPDATE_MIN_INTERVAL_MS = 50;
const PREVIEW_UPDATE_MIN_INTERVAL_MS = 100;
const IS_TEST_ENV = import.meta.env.MODE === 'test';

/**
 * Returns true if the event should be dropped because it belongs to a different
 * generation than the one currently tracked in the store.  Both sides must carry
 * a generationId for the check to fire — events without one (e.g. from older
 * code paths) fall through to the existing requestId guards.
 */
function isStaleGenerationEvent(
    stateGenId: string | null,
    eventGenId: string | undefined,
): boolean {
    return !!(stateGenId && eventGenId && stateGenId !== eventGenId);
}

function shouldIgnoreRecoverableGenerationError(
    generation: GenerationState,
    data: { error?: string; errorId?: string; requestId?: string }
): boolean {
    if (!isMissingModelGenerationError(data.error, data.errorId)) {
        return false;
    }
    // If generation already completed or is idle, this is definitely stale.
    if (generation.phase === 'complete' || generation.phase === 'idle') {
        return true;
    }
    // If we have live activity, suppress stale missing_model_input errors.
    if (generation.hasProgressEvent || !!generation.previewImage || generation.images.length > 0) {
        return true;
    }
    return false;
}

function isMissingModelGenerationError(error: string | undefined, errorId: string | undefined): boolean {
    if (errorId === 'missing_model_input') {
        return true;
    }
    if (typeof error !== 'string') {
        return false;
    }
    return error.trim().toLowerCase().startsWith('no model input given');
}

function buildPreviewEventSignature(data: GenerationProgressData): string {
    return [
        data.previewImage || '',
        data.batch,
        data.batchTotal,
        data.stageId || '',
        data.stageTaskIndex ?? -1,
        data.currentStep,
        data.totalSteps,
        Math.round(data.overallPercent * 100) / 100,
    ].join('|');
}

// ============================================================================
// Store
// ============================================================================

export const useWebSocketStore = create<WebSocketStoreState & WebSocketStoreActions>()(
    devtools(
        (set, get) => {
            let lastProgressUpdate = 0;
            let pendingProgressData: GenerationProgressData | null = null;
            let rafId: number | null = null;
            let lastPreviewCommitAt = 0;
            let lastPreviewSignature: string | null = null;
            let pendingPreviewData: GenerationProgressData | null = null;
            let pendingPreviewSignature: string | null = null;
            let previewTimeoutId: ReturnType<typeof setTimeout> | null = null;
            let pendingPreviewQueuedAt = 0;
            let previewEventCount = 0;
            let previewCommitCount = 0;
            let previewDedupedCount = 0;
            let previewSupersededCount = 0;
            let firstPreviewEventRecorded = false;
            let firstPreviewCommitRecorded = false;

            const resetPreviewTelemetry = () => {
                pendingPreviewQueuedAt = 0;
                previewEventCount = 0;
                previewCommitCount = 0;
                previewDedupedCount = 0;
                previewSupersededCount = 0;
                firstPreviewEventRecorded = false;
                firstPreviewCommitRecorded = false;
            };

            const emitPreviewSummary = (reason: 'complete' | 'error' | 'stop' | 'clear') => {
                const generation = get().generation;
                if (!generation.startTime) {
                    return;
                }
                usePerformanceSessionStore.getState().recordSessionEvent(
                    'generate:preview-summary',
                    previewDedupedCount > 0 || previewSupersededCount > 0 ? 'warning' : 'info',
                    {
                        reason,
                        generationId: generation.generationId ?? '',
                        requestId: generation.requestId ?? '',
                        previewEventCount,
                        previewCommitCount,
                        previewDedupedCount,
                        previewSupersededCount,
                        previewRevision: generation.previewRevision,
                    }
                );
            };

            const resetPreviewBuffer = () => {
                pendingPreviewData = null;
                pendingPreviewSignature = null;
                lastPreviewSignature = null;
                pendingPreviewQueuedAt = 0;
                lastPreviewCommitAt = 0;
                if (previewTimeoutId !== null) {
                    clearTimeout(previewTimeoutId);
                    previewTimeoutId = null;
                }
            };

            const flushPreviewUpdate = () => {
                if (!pendingPreviewData?.previewImage) {
                    return;
                }

                const data = pendingPreviewData;
                const nextPreview = data.previewImage ?? null;
                const nextPreviewSignature = pendingPreviewSignature;
                const queueDelay = pendingPreviewQueuedAt > 0 ? performance.now() - pendingPreviewQueuedAt : 0;
                pendingPreviewData = null;
                pendingPreviewSignature = null;
                pendingPreviewQueuedAt = 0;

                set((state) => {
                    if (isStaleGenerationEvent(state.generation.generationId, data.generationId)) {
                        return {};
                    }
                    if (state.generation.requestId && data.requestId && state.generation.requestId !== data.requestId) {
                        return {};
                    }
                    return {
                        generation: {
                            ...state.generation,
                            previewImage: nextPreview,
                            previewRevision: state.generation.previewRevision + 1,
                            lastEventAt: Date.now(),
                        },
                    };
                });

                previewCommitCount += 1;
                lastPreviewCommitAt = performance.now();
                lastPreviewSignature = nextPreviewSignature;
                usePerformanceSessionStore.getState().recordTiming(
                    'ws:preview-queue-delay',
                    queueDelay,
                    {
                        generationId: data.generationId ?? '',
                        requestId: data.requestId ?? '',
                        stageId: data.stageId ?? '',
                        stageLabel: data.stageLabel ?? '',
                    },
                    queueDelay > 250 ? 'warning' : 'info'
                );

                const generationStartTime = get().generation.startTime;
                if (generationStartTime && !firstPreviewCommitRecorded) {
                    firstPreviewCommitRecorded = true;
                    usePerformanceSessionStore.getState().recordTiming(
                        'generate:first-preview-commit',
                        Date.now() - generationStartTime,
                        {
                            generationId: data.generationId ?? '',
                            requestId: data.requestId ?? '',
                            stageId: data.stageId ?? '',
                            stageLabel: data.stageLabel ?? '',
                            queueDelayMs: queueDelay,
                        }
                    );
                }
            };

            const schedulePreviewUpdate = (data: GenerationProgressData, force = false) => {
                if (!data.previewImage) {
                    return;
                }

                previewEventCount += 1;
                const generationStartTime = get().generation.startTime;
                if (generationStartTime && !firstPreviewEventRecorded) {
                    firstPreviewEventRecorded = true;
                    usePerformanceSessionStore.getState().recordTiming(
                        'generate:first-preview-event',
                        Date.now() - generationStartTime,
                        {
                            generationId: data.generationId ?? '',
                            requestId: data.requestId ?? '',
                            stageId: data.stageId ?? '',
                            stageLabel: data.stageLabel ?? '',
                        }
                    );
                }

                const nextPreviewSignature = buildPreviewEventSignature(data);
                if (nextPreviewSignature === lastPreviewSignature || nextPreviewSignature === pendingPreviewSignature) {
                    previewDedupedCount += 1;
                    return;
                }

                if (pendingPreviewData && pendingPreviewSignature && pendingPreviewSignature !== nextPreviewSignature) {
                    previewSupersededCount += 1;
                }

                pendingPreviewData = data;
                pendingPreviewSignature = nextPreviewSignature;
                pendingPreviewQueuedAt = performance.now();

                if (previewTimeoutId !== null) {
                    clearTimeout(previewTimeoutId);
                    previewTimeoutId = null;
                }

                const elapsed = performance.now() - lastPreviewCommitAt;
                if (force || elapsed >= PREVIEW_UPDATE_MIN_INTERVAL_MS) {
                    flushPreviewUpdate();
                    return;
                }

                previewTimeoutId = setTimeout(() => {
                    previewTimeoutId = null;
                    flushPreviewUpdate();
                }, PREVIEW_UPDATE_MIN_INTERVAL_MS - elapsed);
            };

            const flushProgressUpdate = () => {
                if (pendingProgressData) {
                    const data = pendingProgressData;
                    pendingProgressData = null;
                    set((state) => {
                        if (isStaleGenerationEvent(state.generation.generationId, data.generationId)) {
                            return {};
                        }
                        return {
                            generation:
                                state.generation.requestId &&
                                    data.requestId &&
                                    state.generation.requestId !== data.requestId
                                    ? state.generation
                                    : {
                                        ...state.generation,
                                        hasProgressEvent: true,
                                        requestId: state.generation.requestId || data.requestId || null,
                                        progress: Math.min(100, Math.max(0, data.overallPercent)),
                                        currentStep: data.currentStep,
                                        totalSteps: data.totalSteps,
                                        stageId: data.stageId || state.generation.stageId,
                                        stageLabel: data.stageLabel || state.generation.stageLabel,
                                        stageDetail: data.stageDetail || null,
                                        stageIndex: data.stageIndex ?? state.generation.stageIndex,
                                        stageCount: data.stageCount ?? state.generation.stageCount,
                                        stagesRemaining: data.stagesRemaining ?? state.generation.stagesRemaining,
                                        stageTaskIndex: data.stageTaskIndex ?? 0,
                                        stageTaskCount: data.stageTaskCount ?? 0,
                                        stageTasksRemaining: data.stageTasksRemaining ?? 0,
                                        currentBatch: data.batch + 1,
                                        totalBatches: Math.max(1, data.batchTotal),
                                        phase: 'progress',
                                        lastEventAt: Date.now(),
                                    },
                        };
                    });
                }
                rafId = null;
            };

            return {
            ...initialState,

            // ========================================================================
            // Initialization
            // ========================================================================

            initialize: (wsBaseUrl: string, sessionId: string | null, reason: string = 'init') => {
                if (get().isInitialized) {
                    console.debug('[WebSocketStore] Already initialized, updating session');
                    if (sessionId) {
                        updateWSManagerSession(sessionId);
                    }
                    if (reason === 'refresh') {
                        set((state) => ({
                            sessionRecovery: {
                                ...state.sessionRecovery,
                                isRecovering: false,
                                lastRecoveredAt: Date.now(),
                                lastError: null,
                            },
                        }));
                    }
                    return;
                }

                console.debug('[WebSocketStore] Initializing with:', { wsBaseUrl, sessionId, reason });

                const manager = initWSManager({
                    baseUrl: wsBaseUrl,
                    sessionId,
                    debug: import.meta.env.DEV,
                    refreshSession: featureFlags.syncSessionV2
                        ? async () => {
                            const session = await swarmClient.initSession('refresh');
                            return session.session_id;
                        }
                        : undefined,
                });
                swarmBackendAdapter.attachWebSocketManager(manager);
                const diagnostics = useGenerationDiagnosticsStore.getState();

                // Subscribe to generation events
                // Throttle progress updates to reduce React re-renders while keeping UI responsive.

                manager.on('open', (event) => {
                    if (event.endpoint !== 'GenerateText2ImageWS') {
                        return;
                    }
                    const data = event.data as { connectionId?: string; generationId?: string };
                    logger.info('[WebSocketStore] Generation socket open', data);
                    if (data.generationId) {
                        diagnostics.appendEvent(data.generationId, {
                            type: 'socket_open',
                            level: 'info',
                            message: 'Generation websocket opened.',
                            details: data,
                        });
                    }
                    set((state) => {
                        if (isStaleGenerationEvent(state.generation.generationId, data.generationId)) {
                            return {};
                        }
                        return {
                            generation: state.generation.isGenerating
                                ? {
                                    ...state.generation,
                                    phase: 'connected',
                                    lastEventAt: Date.now(),
                                }
                                : state.generation,
                        };
                    });
                });

                manager.on('generation:progress', (event) => {
                    const data = event.data as GenerationProgressData;
                    const now = performance.now();
                    const currentGeneration = get().generation;
                    const diagnosticGenerationId = data.generationId ?? currentGeneration.generationId;
                    if (diagnosticGenerationId) {
                        diagnostics.recordProgress(diagnosticGenerationId, {
                            requestId: data.requestId,
                            progress: data.overallPercent,
                            previewImage: data.previewImage,
                            stageId: data.stageId,
                            stageLabel: data.stageLabel,
                            currentStep: data.currentStep,
                            totalSteps: data.totalSteps,
                        });
                    }
                    if (
                        diagnosticGenerationId &&
                        data.backendPreview &&
                        (data.backendPreview.isFinal || data.backendPreview.previewEventCount === 1 || !!data.backendPreview.warning)
                    ) {
                        diagnostics.appendEvent(diagnosticGenerationId, {
                            type: data.backendPreview.isFinal ? 'backend_preview_summary' : 'backend_preview_telemetry',
                            level: data.backendPreview.warning ? 'warn' : 'info',
                            message: data.backendPreview.isFinal
                                ? 'Received final backend preview telemetry summary.'
                                : 'Received backend preview telemetry update.',
                            details: data.backendPreview,
                        });
                        usePerformanceSessionStore.getState().recordSessionEvent(
                            'backend:preview-telemetry',
                            data.backendPreview.warning ? 'warning' : 'info',
                            data.backendPreview,
                            undefined,
                        );
                    }

                    // Always update on significant changes or first update
                    const significantChange =
                        data.stageId !== currentGeneration.stageId ||
                        data.stageTaskIndex !== currentGeneration.stageTaskIndex ||
                        data.currentStep !== currentGeneration.currentStep ||
                        Math.abs(data.overallPercent - currentGeneration.progress) >= 2;

                    if (IS_TEST_ENV) {
                        pendingProgressData = data;
                        flushProgressUpdate();
                        if (data.previewImage) {
                            schedulePreviewUpdate(data, true);
                        }
                        return;
                    }

                    if (now - lastProgressUpdate >= PROGRESS_UPDATE_MIN_INTERVAL_MS || significantChange) {
                        // Update immediately using requestAnimationFrame for smooth UI
                        lastProgressUpdate = now;
                        pendingProgressData = data;

                        if (rafId === null) {
                            rafId = requestAnimationFrame(flushProgressUpdate);
                        }
                    } else {
                        // Store for next RAF cycle
                        pendingProgressData = data;
                        if (rafId === null) {
                            rafId = requestAnimationFrame(flushProgressUpdate);
                        }
                    }

                    if (data.previewImage) {
                        const previewBoundaryChanged =
                            data.batch + 1 !== currentGeneration.currentBatch ||
                            data.stageId !== currentGeneration.stageId ||
                            data.stageTaskIndex !== currentGeneration.stageTaskIndex;
                        schedulePreviewUpdate(data, previewBoundaryChanged);
                    }
                });

                manager.on('generation:image', (event) => {
                    const data = event.data as GenerationImageData;
                    const imageUrl = data.comfyViewUrl || data.image;
                    const diagnosticGenerationId = data.generationId ?? get().generation.generationId;
                    if (diagnosticGenerationId) {
                        diagnostics.recordImage(diagnosticGenerationId, {
                            requestId: data.requestId,
                            image: imageUrl,
                        });
                    }
                    set((state) => {
                        if (isStaleGenerationEvent(state.generation.generationId, data.generationId)) {
                            return {};
                        }
                        return {
                        generation:
                            state.generation.requestId &&
                                data.requestId &&
                                state.generation.requestId !== data.requestId
                                ? state.generation
                                : state.generation.images.includes(imageUrl)
                                    ? state.generation
                                    : (() => {
                                        const nextImages = [...state.generation.images, imageUrl];
                                        const totalBatches = Math.max(1, state.generation.totalBatches || 1);
                                        const inferredBatch = Math.min(nextImages.length, totalBatches);
                                        const inferredProgress = Math.min(
                                            99,
                                            Math.max(
                                                state.generation.progress,
                                                Math.round((inferredBatch / totalBatches) * 100)
                                            )
                                        );

                                        return {
                                            ...state.generation,
                                            images: nextImages,
                                            requestId: state.generation.requestId || data.requestId || null,
                                            // Some backend paths emit image events but sparse/no progress.
                                            hasProgressEvent: state.generation.hasProgressEvent || state.generation.isGenerating,
                                            phase: 'image',
                                            lastEventAt: Date.now(),
                                            currentBatch: Math.max(state.generation.currentBatch, inferredBatch),
                                            progress: state.generation.hasProgressEvent
                                                ? state.generation.progress
                                                : inferredProgress,
                                        };
                                    })(),
                    };
                    });
                });

                manager.on('generation:complete', (event) => {
                    const data = event.data as { requestId?: string; generationId?: string };
                    resetPreviewBuffer();
                    logger.info('[WebSocketStore] Generation complete event', data);
                    const diagnosticGenerationId = data.generationId ?? get().generation.generationId;
                    if (diagnosticGenerationId) {
                        diagnostics.markComplete(diagnosticGenerationId, {
                            requestId: data.requestId,
                        });
                    }
                    set((state) => {
                        if (isStaleGenerationEvent(state.generation.generationId, data.generationId)) {
                            logger.info('[WebSocketStore] Dropping stale generation complete', {
                                storeGenerationId: state.generation.generationId,
                                eventGenerationId: data.generationId,
                            });
                            return {};
                        }
                        return {
                        generation:
                            state.generation.requestId &&
                                data.requestId &&
                                state.generation.requestId !== data.requestId
                                ? state.generation
                                : (!state.generation.isGenerating && state.generation.progress >= 100)
                                    ? state.generation
                                    : {
                                        ...state.generation,
                                        isGenerating: false,
                                        requestId: state.generation.requestId || data.requestId || null,
                                        hasProgressEvent: true,
                                        error: null,
                                        errorId: null,
                                        errorData: null,
                                        phase: 'complete',
                                        lastEventAt: Date.now(),
                                        progress: 100,
                                        currentStep: Math.max(state.generation.currentStep, state.generation.totalSteps),
                                        currentBatch: Math.max(
                                            state.generation.currentBatch,
                                            Math.min(state.generation.images.length, Math.max(1, state.generation.totalBatches))
                                        ),
                                    },
                        };
                    });
                    emitPreviewSummary('complete');
                });

                manager.on('generation:error', (event) => {
                    const data = event.data as { error: string; requestId?: string; errorId?: string; errorData?: unknown; generationId?: string };
                    resetPreviewBuffer();
                    set((state) => {
                        const diagnosticGenerationId = data.generationId ?? state.generation.generationId;
                        if (isStaleGenerationEvent(state.generation.generationId, data.generationId)) {
                            logger.info('[WebSocketStore] Dropping stale generation error', {
                                storeGenerationId: state.generation.generationId,
                                eventGenerationId: data.generationId,
                                errorId: data.errorId,
                            });
                            return {};
                        }
                        if (state.generation.requestId && data.requestId && state.generation.requestId !== data.requestId) {
                            return {
                                generation: state.generation,
                            };
                        }
                        if (shouldIgnoreRecoverableGenerationError(state.generation, data)) {
                            logger.info('[WebSocketStore] Suppressing recoverable generation error event', data);
                            if (diagnosticGenerationId) {
                                diagnostics.appendEvent(diagnosticGenerationId, {
                                    type: 'suppressed_error',
                                    level: 'warn',
                                    message: `Suppressed recoverable backend error: ${data.errorId || 'unknown_error'}`,
                                    details: data,
                                });
                            }
                            return {
                                generation: {
                                    ...state.generation,
                                    requestId: state.generation.requestId || data.requestId || null,
                                    lastEventAt: Date.now(),
                                },
                            };
                        }
                        logger.error('[WebSocketStore] Generation error event', data);
                        if (!state.generation.isGenerating && state.generation.error === data.error) {
                            return {
                                generation: state.generation,
                            };
                        }
                        if (diagnosticGenerationId) {
                            diagnostics.markError(diagnosticGenerationId, {
                                error: data.error,
                                errorId: data.errorId ?? null,
                                errorData: data.errorData ?? null,
                                requestId: data.requestId ?? null,
                            });
                        }
                        return {
                            generation: {
                                ...state.generation,
                                isGenerating: false,
                                requestId: state.generation.requestId || data.requestId || null,
                                error: data.error,
                                errorId: data.errorId ?? null,
                                errorData: data.errorData ?? null,
                                phase: 'error',
                                lastEventAt: Date.now(),
                            },
                        };
                    });
                    emitPreviewSummary('error');
                });

                // Subscribe to model loading events
                manager.on('model:progress', (event) => {
                    const data = event.data as ModelProgressData;
                    set((state) => ({
                        modelLoading: {
                            ...state.modelLoading,
                            isLoading: data.loadingCount > 0 || state.modelLoading.isLoading,
                            progress: data.progress !== undefined
                                ? Math.min(100, Math.max(0, data.progress))
                                : state.modelLoading.progress,
                            loadingCount: data.loadingCount,
                            isProgressEstimated: data.isEstimated,
                            error: null,
                        },
                    }));
                });

                manager.on('model:loaded', (event) => {
                    const data = event.data as { modelName: string };
                    set({
                        modelLoading: {
                            isLoading: false,
                            progress: 100,
                            modelName: data.modelName,
                            loadingCount: 0,
                            isProgressEstimated: false,
                            error: null,
                        },
                    });
                });

                manager.on('model:error', (event) => {
                    const data = event.data as { error: string };
                    set((state) => ({
                        modelLoading: {
                            ...state.modelLoading,
                            isLoading: false,
                            loadingCount: 0,
                            error: data.error,
                        },
                    }));
                });

                // Subscribe to download events
                manager.on('download:progress', (event) => {
                    const data = event.data as DownloadProgressData;
                    set((state) => {
                        const downloads = new Map(state.downloads);
                        const existing = downloads.get(data.downloadId);
                        if (existing) {
                            downloads.set(data.downloadId, {
                                ...existing,
                                progress: data.overallPercent,
                                bytesPerSecond: data.bytesPerSecond,
                            });
                        }
                        return { downloads };
                    });
                });

                manager.on('download:complete', (event) => {
                    const data = event.data as { downloadId: string };
                    set((state) => {
                        const downloads = new Map(state.downloads);
                        const existing = downloads.get(data.downloadId);
                        if (existing) {
                            downloads.set(data.downloadId, {
                                ...existing,
                                progress: 100,
                                status: 'complete',
                            });
                        }
                        return { downloads };
                    });
                });

                manager.on('download:error', (event) => {
                    const data = event.data as { downloadId: string; error: string };
                    set((state) => {
                        const downloads = new Map(state.downloads);
                        const existing = downloads.get(data.downloadId);
                        if (existing) {
                            downloads.set(data.downloadId, {
                                ...existing,
                                status: 'error',
                                error: data.error,
                            });
                        }
                        return { downloads };
                    });
                });

                // Subscribe to connection health events
                manager.on('connection:healthy', (event) => {
                    const data = event.data as { connectionId?: string; reason?: string };
                    console.info('[WebSocketStore] Connection healthy', {
                        endpoint: event.endpoint,
                        connectionId: data.connectionId,
                        reason: data.reason,
                    });
                    set({
                        connectionHealth: 'connected',
                        connectionIssue: {
                            endpoint: null,
                            reason: null,
                            missedPongs: 0,
                            lastTransitionAt: Date.now(),
                        },
                    });
                });

                manager.on('connection:degraded', (event) => {
                    const data = event.data as {
                        connectionId?: string;
                        missedPongs?: number;
                        reason?: string;
                        sinceLastPongMs?: number | null;
                    };
                    const reason = data.reason || 'Heartbeat response delayed';
                    console.warn('[WebSocketStore] Connection degraded', {
                        endpoint: event.endpoint,
                        connectionId: data.connectionId,
                        missedPongs: data.missedPongs,
                        reason,
                        sinceLastPongMs: data.sinceLastPongMs,
                    });
                    if (event.endpoint === 'GenerateText2ImageWS' && get().generation.generationId) {
                        diagnostics.appendEvent(get().generation.generationId as string, {
                            type: 'connection_degraded',
                            level: 'warn',
                            message: reason,
                            details: data,
                        });
                    }
                    set({
                        connectionHealth: 'degraded',
                        connectionIssue: {
                            endpoint: event.endpoint,
                            reason,
                            missedPongs: data.missedPongs || 1,
                            lastTransitionAt: Date.now(),
                        },
                    });
                });

                manager.on('connection:unhealthy', (event) => {
                    const data = event.data as {
                        connectionId?: string;
                        missedPongs?: number;
                        reason?: string;
                        sinceLastPongMs?: number | null;
                    };
                    const reason = data.reason || 'Heartbeat failed repeatedly';
                    console.error('[WebSocketStore] Connection unhealthy', {
                        endpoint: event.endpoint,
                        connectionId: data.connectionId,
                        missedPongs: data.missedPongs,
                        reason,
                        sinceLastPongMs: data.sinceLastPongMs,
                    });
                    if (event.endpoint === 'GenerateText2ImageWS' && get().generation.generationId) {
                        diagnostics.appendEvent(get().generation.generationId as string, {
                            type: 'connection_unhealthy',
                            level: 'error',
                            message: reason,
                            details: data,
                        });
                    }
                    set({
                        connectionHealth: 'unhealthy',
                        connectionIssue: {
                            endpoint: event.endpoint,
                            reason,
                            missedPongs: data.missedPongs || 3,
                            lastTransitionAt: Date.now(),
                        },
                    });
                });

                manager.on('open', () => {
                    set({
                        connectionHealth: 'connected',
                        connectionIssue: {
                            endpoint: null,
                            reason: null,
                            missedPongs: 0,
                            lastTransitionAt: Date.now(),
                        },
                    });
                });

                manager.on('close', (event) => {
                    const data = event.data as { code?: number };
                    const reason = data.code ? `Socket closed (code ${data.code})` : 'Socket closed';
                    if (event.endpoint === 'GenerateText2ImageWS' && get().generation.generationId) {
                        diagnostics.appendEvent(get().generation.generationId as string, {
                            type: 'socket_close',
                            level: 'debug',
                            message: reason,
                            details: data,
                        });
                    }
                    set({
                        connectionHealth: 'disconnected',
                        connectionIssue: {
                            endpoint: event.endpoint,
                            reason,
                            missedPongs: 0,
                            lastTransitionAt: Date.now(),
                        },
                    });
                });

                manager.on('reconnect', (event) => {
                    const data = event.data as { connectionId: string; attempt: number; delay: number };
                    if (event.endpoint === 'GenerateText2ImageWS' && get().generation.generationId) {
                        diagnostics.appendEvent(get().generation.generationId as string, {
                            type: 'socket_reconnect',
                            level: 'warn',
                            message: `Attempting websocket reconnect #${data.attempt}`,
                            details: data,
                        });
                    }
                    set((state) => ({
                        connectionHealth: 'degraded',
                        connectionIssue: {
                            endpoint: event.endpoint,
                            reason: `Reconnecting (attempt ${data.attempt})`,
                            missedPongs: state.connectionIssue.missedPongs,
                            lastTransitionAt: Date.now(),
                        },
                        sessionRecovery: {
                            ...state.sessionRecovery,
                            attempts: Math.max(state.sessionRecovery.attempts, data.attempt),
                        },
                    }));
                });

                manager.on('session:expired', (event) => {
                    const data = event.data as { attempts: number };
                    if (event.endpoint === 'GenerateText2ImageWS' && get().generation.generationId) {
                        diagnostics.appendEvent(get().generation.generationId as string, {
                            type: 'session_expired',
                            level: 'warn',
                            message: 'Session expired during generation; attempting recovery.',
                            details: data,
                        });
                    }
                    set((state) => ({
                        connectionHealth: 'degraded',
                        connectionIssue: {
                            endpoint: event.endpoint,
                            reason: 'Session expired, attempting recovery',
                            missedPongs: state.connectionIssue.missedPongs,
                            lastTransitionAt: Date.now(),
                        },
                        sessionRecovery: {
                            ...state.sessionRecovery,
                            isRecovering: true,
                            attempts: data.attempts,
                            lastError: null,
                        },
                    }));
                });

                manager.on('session:recovered', (event) => {
                    const data = event.data as { attempts: number };
                    if (event.endpoint === 'GenerateText2ImageWS' && get().generation.generationId) {
                        diagnostics.appendEvent(get().generation.generationId as string, {
                            type: 'session_recovered',
                            level: 'info',
                            message: 'Session recovered successfully.',
                            details: data,
                        });
                    }
                    set((state) => ({
                        connectionHealth: 'connected',
                        connectionIssue: {
                            endpoint: null,
                            reason: null,
                            missedPongs: 0,
                            lastTransitionAt: Date.now(),
                        },
                        sessionRecovery: {
                            ...state.sessionRecovery,
                            isRecovering: false,
                            attempts: data.attempts,
                            lastRecoveredAt: Date.now(),
                            lastError: null,
                        },
                    }));
                });

                manager.on('session:recovery-failed', (event) => {
                    const data = event.data as { attempts: number; error?: string };
                    if (event.endpoint === 'GenerateText2ImageWS' && get().generation.generationId) {
                        diagnostics.appendEvent(get().generation.generationId as string, {
                            type: 'session_recovery_failed',
                            level: 'error',
                            message: data.error || 'Session recovery failed.',
                            details: data,
                        });
                    }
                    set((state) => ({
                        connectionHealth: 'unhealthy',
                        connectionIssue: {
                            endpoint: event.endpoint,
                            reason: data.error || 'Session recovery failed',
                            missedPongs: state.connectionIssue.missedPongs,
                            lastTransitionAt: Date.now(),
                        },
                        sessionRecovery: {
                            ...state.sessionRecovery,
                            isRecovering: false,
                            attempts: data.attempts,
                            lastError: data.error || 'session_recovery_failed',
                        },
                    }));
                });

                set({ isInitialized: true });
            },

            updateSession: (sessionId: string, reason: string = 'refresh') => {
                updateWSManagerSession(sessionId);
                if (reason === 'refresh') {
                    set((state) => ({
                        sessionRecovery: {
                            ...state.sessionRecovery,
                            isRecovering: false,
                            lastRecoveredAt: Date.now(),
                            lastError: null,
                        },
                    }));
                }
            },

            // ========================================================================
            // Generation Actions
            // ========================================================================

            startGeneration: (params: GenerateParams, providedGenerationId?: string) => {
                resetPreviewBuffer();
                resetPreviewTelemetry();
                const parsedSteps = Number(params.steps);
                const totalSteps = Number.isFinite(parsedSteps) && parsedSteps > 0 ? parsedSteps : 20;
                const parsedImages = Number(params.images);
                const totalBatches = Number.isFinite(parsedImages) && parsedImages > 0 ? parsedImages : 1;
                const modelValue = typeof params.model === 'string' ? params.model.trim() : '';
                const paramKeys = Object.keys(params || {}).sort();
                const diagnostics = useGenerationDiagnosticsStore.getState();
                const generationId = providedGenerationId || `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

                logger.info('[WebSocketStore] startGeneration called', {
                    generationId,
                    model: modelValue || null,
                    images: params.images,
                    steps: params.steps,
                    paramKeys,
                });
                diagnostics.ensureEntry({
                    generationId,
                    model: modelValue || null,
                    rawModel: params.model ?? null,
                    payloadKeys: paramKeys,
                    payloadSummary: summarizeDiagnosticValue(params) as Record<string, unknown>,
                    totalSteps,
                    totalBatches,
                });
                diagnostics.appendEvent(generationId, {
                    type: 'frontend_dispatch',
                    level: 'info',
                    message: 'Dispatching generation payload to websocket manager.',
                    details: {
                        model: modelValue || null,
                        images: params.images,
                        steps: params.steps,
                        paramKeys,
                    },
                });

                set({
                    generation: {
                        ...initialGenerationState,
                        isGenerating: true,
                        generationId,
                        phase: 'starting',
                        lastEventAt: Date.now(),
                        startTime: Date.now(),
                        totalSteps,
                        totalBatches,
                    },
                });

                if (!modelValue) {
                    logger.error('[WebSocketStore] startGeneration aborted: missing model in params', {
                        paramKeys,
                        rawModel: params.model ?? null,
                    });
                    set((state) => ({
                        generation: {
                            ...state.generation,
                            isGenerating: false,
                            error: 'No model selected in frontend payload.',
                            errorId: 'frontend_missing_model',
                            errorData: {
                                paramKeys,
                                rawModel: params.model ?? null,
                            },
                            phase: 'error',
                            lastEventAt: Date.now(),
                        },
                    }));
                    diagnostics.markError(generationId, {
                        error: 'No model selected in frontend payload.',
                        errorId: 'frontend_missing_model',
                        errorData: {
                            paramKeys,
                            rawModel: params.model ?? null,
                        },
                    });
                    return generationId;
                }

                try {
                    const manager = getWSManager();
                    manager.startGeneration(params as Record<string, unknown>, generationId);
                    diagnostics.appendEvent(generationId, {
                        type: 'manager_start',
                        level: 'info',
                        message: 'WebSocket manager accepted generation request.',
                    });
                } catch (error) {
                    console.error('[WebSocketStore] Failed to start generation:', error);
                    set((state) => ({
                        generation: {
                            ...state.generation,
                            isGenerating: false,
                            error: 'Failed to start generation',
                            errorId: 'frontend_start_generation_failed',
                            errorData: String(error),
                            phase: 'error',
                            lastEventAt: Date.now(),
                        },
                    }));
                    diagnostics.markError(generationId, {
                        error: 'Failed to start generation',
                        errorId: 'frontend_start_generation_failed',
                        errorData: String(error),
                    });
                }
                return generationId;
            },

            stopGeneration: () => {
                resetPreviewBuffer();
                const activeGenerationId = get().generation.generationId;
                try {
                    const manager = getWSManager();
                    manager.stopGeneration();
                } catch (error) {
                    console.error('[WebSocketStore] Failed to stop generation:', error);
                }
                if (activeGenerationId) {
                    useGenerationDiagnosticsStore.getState().markInterrupted(activeGenerationId, 'Generation stopped from websocket store.');
                }

                set((state) => ({
                    generation: {
                        ...state.generation,
                        isGenerating: false,
                        phase: 'idle',
                        lastEventAt: Date.now(),
                    },
                }));
                emitPreviewSummary('stop');
                resetPreviewTelemetry();
            },

            clearGeneration: () => {
                resetPreviewBuffer();
                emitPreviewSummary('clear');
                resetPreviewTelemetry();
                set({ generation: initialGenerationState });
            },

            // ========================================================================
            // Model Loading Actions
            // ========================================================================

            loadModel: (modelName: string) => {
                set({
                    modelLoading: {
                        isLoading: true,
                        progress: 0,
                        modelName,
                        loadingCount: 0,
                        isProgressEstimated: true,
                        error: null,
                    },
                });

                try {
                    const manager = getWSManager();
                    manager.loadModel(modelName);
                } catch (error) {
                    console.error('[WebSocketStore] Failed to load model:', error);
                    set((state) => ({
                        modelLoading: {
                            ...state.modelLoading,
                            isLoading: false,
                            error: 'Failed to load model',
                        },
                    }));
                }
            },

            clearModelLoading: () => {
                set({ modelLoading: initialModelLoadingState });
            },

            // ========================================================================
            // Download Actions
            // ========================================================================

            startDownload: (params) => {
                const downloadId = `download_${Date.now()}`;

                set((state) => {
                    const downloads = new Map(state.downloads);
                    downloads.set(downloadId, {
                        id: downloadId,
                        name: params.name,
                        progress: 0,
                        bytesPerSecond: 0,
                        status: 'downloading',
                        error: null,
                    });
                    return { downloads };
                });

                try {
                    const manager = getWSManager();
                    manager.startDownload(params);
                } catch (error) {
                    console.error('[WebSocketStore] Failed to start download:', error);
                    set((state) => {
                        const downloads = new Map(state.downloads);
                        downloads.set(downloadId, {
                            id: downloadId,
                            name: params.name,
                            progress: 0,
                            bytesPerSecond: 0,
                            status: 'error',
                            error: 'Failed to start download',
                        });
                        return { downloads };
                    });
                }
            },

            cancelDownload: (downloadId: string) => {
                try {
                    const manager = getWSManager();
                    manager.disconnect(downloadId);
                } catch (error) {
                    console.error('[WebSocketStore] Failed to cancel download:', error);
                }

                set((state) => {
                    const downloads = new Map(state.downloads);
                    downloads.delete(downloadId);
                    return { downloads };
                });
            },

            clearDownload: (downloadId: string) => {
                set((state) => {
                    const downloads = new Map(state.downloads);
                    downloads.delete(downloadId);
                    return { downloads };
                });
            },

            // ========================================================================
            // Reset
            // ========================================================================

            reset: () => {
                try {
                    const manager = getWSManager();
                    manager.disconnectAll();
                } catch {
                    // Manager may not be initialized
                }
                set(initialState);
            },
        };
        },
        { name: 'WebSocketStore' }
    )
);

// ============================================================================
// Selectors
// ============================================================================

export const selectIsGenerating = (state: WebSocketStoreState) => state.generation.isGenerating;
export const selectGenerationProgress = (state: WebSocketStoreState) => state.generation.progress;
export const selectPreviewImage = (state: WebSocketStoreState) => state.generation.previewImage;
export const selectGeneratedImages = (state: WebSocketStoreState) => state.generation.images;
export const selectGenerationError = (state: WebSocketStoreState) => state.generation.error;

export const selectIsModelLoading = (state: WebSocketStoreState) => state.modelLoading.isLoading;
export const selectModelLoadProgress = (state: WebSocketStoreState) => state.modelLoading.progress;
export const selectModelLoadError = (state: WebSocketStoreState) => state.modelLoading.error;

export const selectDownloads = (state: WebSocketStoreState) => state.downloads;
