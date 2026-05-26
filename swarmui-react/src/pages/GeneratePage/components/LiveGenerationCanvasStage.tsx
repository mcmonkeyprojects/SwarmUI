import { memo, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useWebSocketStore } from '../../../stores/websocketStore';
import { usePipelineStore } from '../../../stores/pipelineStore';
import { resolveAssetUrl } from '../../../config/runtimeEndpoints';
import { useRenderProfiler } from '../../../hooks/useRenderProfiler';
import { CanvasPanel } from '../../../components/generation/CanvasPanel';
import type { GenerateParams } from '../../../api/types';
import type { GenerateWorkspaceMode } from '../../../stores/navigationStore';
import { formatGenerationStatusText } from '../../../utils/generationProgressDisplay';

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
            stepSource: state.generation.stepSource,
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

    const pipelineContext = usePipelineStore(
        useShallow((state) => ({
            isRunning: state.isRunning,
            currentStageIndex: state.currentStageIndex,
            stages: state.stages,
        }))
    );

    const enabledPipelineStages = useMemo(
        () => pipelineContext.stages.filter((stage) => stage.enabled),
        [pipelineContext.stages]
    );

    const resolvedPreviewImage = useMemo(
        () => resolvePreviewAsset(generation.previewImage),
        [generation.previewImage]
    );

    const previewImage = useMemo(
        () => withPreviewRevision(resolvedPreviewImage, generation.previewRevision),
        [generation.previewRevision, resolvedPreviewImage]
    );

    const statusText = useMemo(
        () => formatGenerationStatusText(generation),
        [generation]
    );

    const activePipelineStage = pipelineContext.isRunning
        ? enabledPipelineStages[pipelineContext.currentStageIndex] ?? null
        : null;

    return (
        <CanvasPanel
            generating={generation.isGenerating}
            hasProgressEvent={generation.hasProgressEvent}
            progress={generation.progress}
            statusText={statusText}
            totalSteps={generation.totalSteps}
            currentStep={generation.currentStep}
            stepSource={generation.stepSource}
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
            onChooseModel={onChooseModel}
            onFocusPrompt={onFocusPrompt}
            onOpenGenerationSettings={onOpenGenerationSettings}
            phase={generation.phase}
            pipelineStageIndex={pipelineContext.isRunning ? pipelineContext.currentStageIndex : null}
            pipelineStageCount={enabledPipelineStages.length}
            pipelineStageLabel={activePipelineStage?.label ?? null}
        />
    );
});

export default LiveGenerationCanvasStage;
