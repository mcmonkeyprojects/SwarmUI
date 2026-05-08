import { memo, useEffect, useRef } from 'react';
import { usePerformanceSessionStore } from '../../../stores/performanceSessionStore';
import { useWebSocketStore } from '../../../stores/websocketStore';

export interface GenerateDeferredDataset {
    key: 'vaes' | 'controlnets' | 'upscalers' | 'embeddings' | 'wildcards';
    enabled: boolean;
    loading: boolean;
}

interface GeneratePerformanceMilestonesProps {
    routeEnteredAt: number | null;
    loadingModels: boolean;
    loadingBackends: boolean;
    supplementalDataReady: boolean;
    deferredDatasets: GenerateDeferredDataset[];
}

export const GeneratePerformanceMilestones = memo(function GeneratePerformanceMilestones({
    routeEnteredAt,
    loadingModels,
    loadingBackends,
    supplementalDataReady,
    deferredDatasets,
}: GeneratePerformanceMilestonesProps) {
    const previewImage = useWebSocketStore((state) => state.generation.previewImage);
    const generationStartTime = useWebSocketStore((state) => state.generation.startTime);
    const isGenerating = useWebSocketStore((state) => state.generation.isGenerating);
    const generationPhase = useWebSocketStore((state) => state.generation.phase);
    const hasProgressEvent = useWebSocketStore((state) => state.generation.hasProgressEvent);
    const generatedImageCount = useWebSocketStore((state) => state.generation.images.length);
    const stageId = useWebSocketStore((state) => state.generation.stageId);
    const stageLabel = useWebSocketStore((state) => state.generation.stageLabel);
    const recordedMilestonesRef = useRef<Record<string, boolean>>({});
    const deferredStartTimesRef = useRef<Record<string, number>>({});
    const recordedDatasetsRef = useRef<Record<string, boolean>>({});
    const trackedGenerationStartRef = useRef<number | null>(null);

    useEffect(() => {
        if (routeEnteredAt === null) {
            return undefined;
        }
        let cancelled = false;
        const record = usePerformanceSessionStore.getState().recordTiming;
        const shellReadyHandle = window.requestAnimationFrame(() => {
            if (cancelled || recordedMilestonesRef.current['generate:shell-ready']) {
                return;
            }
            const shellDuration = performance.now() - routeEnteredAt;
            recordedMilestonesRef.current['generate:shell-ready'] = true;
            record('generate:shell-ready', shellDuration, { route: 'generate' });

            if (!recordedMilestonesRef.current['generate:prompt-ready']) {
                recordedMilestonesRef.current['generate:prompt-ready'] = true;
                record('generate:prompt-ready', shellDuration, { route: 'generate' });
            }
        });

        return () => {
            cancelled = true;
            window.cancelAnimationFrame(shellReadyHandle);
        };
    }, [routeEnteredAt]);

    useEffect(() => {
        if (routeEnteredAt === null) {
            return;
        }
        if (recordedMilestonesRef.current['generate:primary-data-ready']) {
            return;
        }
        if (loadingModels || loadingBackends) {
            return;
        }

        recordedMilestonesRef.current['generate:primary-data-ready'] = true;
        usePerformanceSessionStore.getState().recordTiming(
            'generate:primary-data-ready',
            performance.now() - routeEnteredAt,
            { route: 'generate' }
        );
    }, [loadingBackends, loadingModels, routeEnteredAt]);

    useEffect(() => {
        if (routeEnteredAt === null) {
            return;
        }
        if (!supplementalDataReady || recordedMilestonesRef.current['generate:supplemental-ready']) {
            return;
        }

        recordedMilestonesRef.current['generate:supplemental-ready'] = true;
        usePerformanceSessionStore.getState().recordTiming(
            'generate:supplemental-ready',
            performance.now() - routeEnteredAt,
            { route: 'generate' }
        );
    }, [routeEnteredAt, supplementalDataReady]);

    useEffect(() => {
        if (routeEnteredAt === null) {
            return;
        }
        const record = usePerformanceSessionStore.getState().recordTiming;
        const now = performance.now();

        for (const dataset of deferredDatasets) {
            if (dataset.enabled && deferredStartTimesRef.current[dataset.key] === undefined) {
                deferredStartTimesRef.current[dataset.key] = now;
            }

            if (!dataset.enabled || dataset.loading || recordedDatasetsRef.current[dataset.key]) {
                continue;
            }

            const startedAt = deferredStartTimesRef.current[dataset.key] ?? routeEnteredAt;
            recordedDatasetsRef.current[dataset.key] = true;
            record(
                `generate:dataset:${dataset.key}`,
                now - startedAt,
                { route: 'generate', dataset: dataset.key }
            );
        }
    }, [deferredDatasets, routeEnteredAt]);

    useEffect(() => {
        if (!isGenerating || !generationStartTime) {
            trackedGenerationStartRef.current = null;
            return;
        }

        if (trackedGenerationStartRef.current === generationStartTime) {
            return;
        }

        trackedGenerationStartRef.current = generationStartTime;
        recordedMilestonesRef.current['generate:socket-connected'] = false;
        recordedMilestonesRef.current['generate:first-progress'] = false;
        recordedMilestonesRef.current['generate:first-preview'] = false;
        recordedMilestonesRef.current['generate:first-image'] = false;
        recordedMilestonesRef.current['generate:complete'] = false;
    }, [generationStartTime, isGenerating]);

    useEffect(() => {
        if (!generationStartTime || recordedMilestonesRef.current['generate:socket-connected']) {
            return;
        }

        if (generationPhase !== 'connected') {
            return;
        }

        recordedMilestonesRef.current['generate:socket-connected'] = true;
        usePerformanceSessionStore.getState().recordTiming(
            'generate:socket-connected',
            Date.now() - generationStartTime,
            { route: 'generate', phase: generationPhase }
        );
    }, [generationPhase, generationStartTime]);

    useEffect(() => {
        if (!generationStartTime || recordedMilestonesRef.current['generate:first-progress']) {
            return;
        }

        if (!hasProgressEvent && generationPhase !== 'progress' && generationPhase !== 'image' && generationPhase !== 'complete') {
            return;
        }

        recordedMilestonesRef.current['generate:first-progress'] = true;
        usePerformanceSessionStore.getState().recordTiming(
            'generate:first-progress',
            Date.now() - generationStartTime,
            {
                route: 'generate',
                phase: generationPhase,
                stageId: stageId ?? '',
                stageLabel: stageLabel ?? '',
            }
        );
    }, [generationPhase, generationStartTime, hasProgressEvent, stageId, stageLabel]);

    useEffect(() => {
        if (!generationStartTime || recordedMilestonesRef.current['generate:first-preview']) {
            return;
        }

        if (!previewImage) {
            return;
        }

        recordedMilestonesRef.current['generate:first-preview'] = true;
        usePerformanceSessionStore.getState().recordTiming(
            'generate:first-preview',
            Date.now() - generationStartTime,
            {
                route: 'generate',
                phase: generationPhase,
                stageId: stageId ?? '',
                stageLabel: stageLabel ?? '',
            }
        );
    }, [generationPhase, generationStartTime, previewImage, stageId, stageLabel]);

    useEffect(() => {
        if (!generationStartTime || recordedMilestonesRef.current['generate:first-image']) {
            return;
        }

        if (generatedImageCount <= 0) {
            return;
        }

        recordedMilestonesRef.current['generate:first-image'] = true;
        usePerformanceSessionStore.getState().recordTiming(
            'generate:first-image',
            Date.now() - generationStartTime,
            {
                route: 'generate',
                phase: generationPhase,
                imageCount: generatedImageCount,
            }
        );
    }, [generatedImageCount, generationPhase, generationStartTime]);

    useEffect(() => {
        if (!generationStartTime || recordedMilestonesRef.current['generate:complete']) {
            return;
        }

        if (generationPhase !== 'complete') {
            return;
        }

        recordedMilestonesRef.current['generate:complete'] = true;
        usePerformanceSessionStore.getState().recordTiming(
            'generate:complete',
            Date.now() - generationStartTime,
            {
                route: 'generate',
                phase: generationPhase,
                imageCount: generatedImageCount,
            }
        );
    }, [generatedImageCount, generationPhase, generationStartTime]);

    return null;
});
