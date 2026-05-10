import { memo, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useWebSocketStore } from '../../../stores/websocketStore';
import { resolveAssetUrl } from '../../../config/runtimeEndpoints';
import { useProgressivePreview } from '../../../hooks/useProgressivePreview';
import { useRenderProfiler } from '../../../hooks/useRenderProfiler';
import { CanvasPanel } from '../../../components/generation/CanvasPanel';
import type { GenerateParams } from '../../../api/types';
import type { GenerateWorkspaceMode } from '../../../stores/navigationStore';

interface FavoriteImage {
    path: string;
    timestamp: number;
    prompt: string;
    model?: string;
}

interface ImageActionContext {
    prompt: string;
    model?: string;
    generationParams?: Partial<GenerateParams>;
}

interface LiveGenerationCanvasStageProps {
    selectedImage: string | null;
    totalImages: number;
    currentImageIndex: number;
    onPrevImage: () => void;
    onNextImage: () => void;
    isFavorite: (image: string) => boolean;
    onAddFavorite: (image: FavoriteImage) => void;
    onRemoveFavorite: (image: string) => void;
    onShowShortcuts: () => void;
    onShowDiagnostics?: () => void;
    hasDiagnosticIssue?: boolean;
    getImageActionContext: () => ImageActionContext;
    showWorkspaceTools?: boolean;
    workspaceMode?: GenerateWorkspaceMode;
    selectedModel?: string;
    selectedBackend?: string;
    generationParams?: Partial<GenerateParams>;
    uxRefresh?: boolean;
    onChooseModel?: () => void;
    onFocusPrompt?: () => void;
    onOpenGenerationSettings?: () => void;
}

function resolvePreviewAsset(previewImage: string | null): string | null {
    if (!previewImage) {
        return null;
    }
    if (previewImage.startsWith('data:') || previewImage.startsWith('http')) {
        return previewImage;
    }
    return resolveAssetUrl(previewImage.startsWith('/') ? previewImage : `/${previewImage}`);
}

function withPreviewRevision(source: string | null, revision: number): string | null {
    if (!source || revision <= 0 || source.startsWith('data:')) {
        return source;
    }

    try {
        const resolved = new URL(source, window.location.origin);
        resolved.searchParams.set('swarm_preview_rev', String(revision));
        return resolved.toString();
    } catch {
        const separator = source.includes('?') ? '&' : '?';
        return `${source}${separator}swarm_preview_rev=${revision}`;
    }
}

function buildGenerationStageText(generation: {
    currentBatch: number;
    totalBatches: number;
    stageLabel: string | null;
    stageDetail: string | null;
}): string {
    const batchPrefix = generation.totalBatches > 1
        ? `Image ${generation.currentBatch || 1}/${generation.totalBatches} | `
        : '';
    const label = generation.stageLabel || 'Generating';
    const detail = generation.stageDetail && generation.stageDetail !== generation.stageLabel
        ? ` | ${generation.stageDetail}`
        : '';
    return `${batchPrefix}${label}${detail}`;
}

function buildGenerationStatusText(generation: {
    error: string | null;
    isGenerating: boolean;
    phase: 'idle' | 'starting' | 'connected' | 'waiting' | 'progress' | 'image' | 'complete' | 'error';
    imagesCount: number;
    hasProgressEvent: boolean;
    currentStep: number;
    totalSteps: number;
    progress: number;
    currentBatch: number;
    totalBatches: number;
    stageLabel: string | null;
    stageDetail: string | null;
}): string {
    if (generation.error) {
        return generation.imagesCount > 0
            ? `Completed with warning: ${generation.error}. Diagnostics captured.`
            : `Error: ${generation.error}. Diagnostics captured.`;
    }

    if (!generation.isGenerating) {
        if (generation.phase === 'complete' && generation.imagesCount > 0) {
            return 'Generation complete!';
        }
        return '';
    }

    if (!generation.hasProgressEvent) {
        if (generation.phase === 'starting') {
            return 'Starting generation request...';
        }
        if (generation.phase === 'connected' || generation.phase === 'waiting') {
            return 'Connected to backend... preparing workflow';
        }
        if (generation.phase === 'image') {
            return 'Receiving generated image output...';
        }
        return 'Starting generation... waiting for backend progress';
    }

    const step = generation.currentStep;
    const total = generation.totalSteps;
    const percent = Math.round(generation.progress);
    const stageText = buildGenerationStageText(generation);
    const batchPrefix = generation.totalBatches > 1
        ? `Image ${generation.currentBatch || 1}/${generation.totalBatches} | `
        : '';

    if ((step ?? 0) <= 0) {
        if (generation.stageLabel) {
            return stageText;
        }
        return `Preparing workflow... ${batchPrefix}${percent}%`;
    }

    if (generation.stageLabel) {
        return stageText;
    }

    return `Generating... ${batchPrefix}Step ${step}/${total || '?'} (${percent}%)`;
}

export const LiveGenerationCanvasStage = memo(function LiveGenerationCanvasStage({
    selectedImage,
    totalImages,
    currentImageIndex,
    onPrevImage,
    onNextImage,
    isFavorite,
    onAddFavorite,
    onRemoveFavorite,
    onShowShortcuts,
    onShowDiagnostics,
    hasDiagnosticIssue = false,
    getImageActionContext,
    showWorkspaceTools = true,
    workspaceMode = 'advanced',
    selectedModel,
    selectedBackend,
    generationParams,
    uxRefresh = false,
    onChooseModel,
    onFocusPrompt,
    onOpenGenerationSettings,
}: LiveGenerationCanvasStageProps) {
    useRenderProfiler('LiveGenerationCanvasStage');

    const generation = useWebSocketStore(
        useShallow((state) => ({
            isGenerating: state.generation.isGenerating,
            hasProgressEvent: state.generation.hasProgressEvent,
            progress: state.generation.progress,
            currentStep: state.generation.currentStep,
            totalSteps: state.generation.totalSteps,
            stageLabel: state.generation.stageLabel,
            stageDetail: state.generation.stageDetail,
            stageIndex: state.generation.stageIndex,
            stageCount: state.generation.stageCount,
            stagesRemaining: state.generation.stagesRemaining,
            stageTaskIndex: state.generation.stageTaskIndex,
            stageTaskCount: state.generation.stageTaskCount,
            stageTasksRemaining: state.generation.stageTasksRemaining,
            previewImage: state.generation.previewImage,
            previewRevision: state.generation.previewRevision,
            error: state.generation.error,
            phase: state.generation.phase,
            imagesCount: state.generation.images.length,
            currentBatch: state.generation.currentBatch,
            totalBatches: state.generation.totalBatches,
            startTime: state.generation.startTime,
        }))
    );

    const resolvedPreviewImage = useMemo(
        () => resolvePreviewAsset(generation.previewImage),
        [generation.previewImage]
    );

    const previewImage = useProgressivePreview(
        withPreviewRevision(resolvedPreviewImage, generation.previewRevision),
        generation.isGenerating,
        {
            metricPrefix: 'ws:preview',
        }
    );

    const statusText = useMemo(
        () => buildGenerationStatusText(generation),
        [generation]
    );

    return (
        <CanvasPanel
            generating={generation.isGenerating}
            hasProgressEvent={generation.hasProgressEvent}
            progress={generation.progress}
            statusText={statusText}
            totalSteps={generation.totalSteps}
            currentStep={generation.currentStep}
            stageLabel={generation.stageLabel}
            stageDetail={generation.stageDetail}
            stageIndex={generation.stageIndex}
            stageCount={generation.stageCount}
            stagesRemaining={generation.stagesRemaining}
            stageTaskIndex={generation.stageTaskIndex}
            stageTaskCount={generation.stageTaskCount}
            stageTasksRemaining={generation.stageTasksRemaining}
            startTime={generation.startTime}
            previewImage={previewImage}
            selectedImage={selectedImage}
            totalImages={totalImages}
            currentImageIndex={currentImageIndex}
            onPrevImage={onPrevImage}
            onNextImage={onNextImage}
            isFavorite={isFavorite}
            onAddFavorite={onAddFavorite}
            onRemoveFavorite={onRemoveFavorite}
            onShowShortcuts={onShowShortcuts}
            onShowDiagnostics={onShowDiagnostics}
            hasDiagnosticIssue={hasDiagnosticIssue}
            getImageActionContext={getImageActionContext}
            showWorkspaceTools={showWorkspaceTools}
            workspaceMode={workspaceMode}
            selectedModel={selectedModel}
            selectedBackend={selectedBackend}
            generationParams={generationParams}
            uxRefresh={uxRefresh}
            onChooseModel={onChooseModel}
            onFocusPrompt={onFocusPrompt}
            onOpenGenerationSettings={onOpenGenerationSettings}
        />
    );
});

export default LiveGenerationCanvasStage;
