import type { GenerateParams, GenerationProgress } from '../api/types';
import type { GenerationPreviewData, GenerationProgressData } from '../api/ws/types';

export interface GenerationPreviewSnapshot {
    previewImage?: string | null;
    previewRevision?: number;
    previewEventSequence?: number | null;
    previewFrameSequence?: number | null;
    backendProgressSequence?: number | null;
    stageId?: string | null;
    stageLabel?: string | null;
    stageDetail?: string | null;
    stageIndex?: number;
    stageCount?: number;
    stagesRemaining?: number;
    stageTaskIndex?: number;
    stageTaskCount?: number;
    stageTasksRemaining?: number;
    currentStep?: number;
    totalSteps?: number;
    stepSource?: GenerationProgressData['stepSource'];
    currentBatch?: number;
    totalBatches?: number;
    lastProgressAt?: number;
    lastPreviewAt?: number;
}

interface NormalizeGenerationProgressInput {
    progress: GenerationProgress | Record<string, unknown>;
    params?: Partial<GenerateParams> | Record<string, unknown>;
    generationId?: string;
    requestId?: string;
    eventSequence?: number;
    serverElapsedMs?: number;
    managerReceivedAtMs?: number;
}

function hasOwnRecordValue(record: Record<string, unknown>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(record, key);
}

function readFiniteNumber(value: unknown): number | undefined {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function readOptionalFiniteNumber(record: Record<string, unknown>, key: string): number | undefined {
    if (!hasOwnRecordValue(record, key)) {
        return undefined;
    }
    return readFiniteNumber(record[key]);
}

function readOptionalStringOrNull(record: Record<string, unknown>, key: string): string | null | undefined {
    if (!hasOwnRecordValue(record, key)) {
        return undefined;
    }
    const value = record[key];
    if (value === null || value === undefined) {
        return null;
    }
    return typeof value === 'string' ? value : undefined;
}

function readPositiveInteger(value: unknown, fallback: number): number {
    const parsed = readFiniteNumber(value);
    if (parsed === undefined || parsed <= 0) {
        return fallback;
    }
    return Math.max(1, Math.floor(parsed));
}

function readBackendPreview(progress: Record<string, unknown>): GenerationProgressData['backendPreview'] {
    const rawPreview = progress.backend_preview;
    if (!rawPreview || typeof rawPreview !== 'object') {
        return undefined;
    }
    const backendPreview = rawPreview as Record<string, unknown>;
    return {
        previewMode: typeof backendPreview.preview_mode === 'string' ? backendPreview.preview_mode : undefined,
        previewMethod: typeof backendPreview.preview_method === 'string' ? backendPreview.preview_method : undefined,
        warning: typeof backendPreview.warning === 'string' ? backendPreview.warning : backendPreview.warning === null ? null : undefined,
        promptQueuedMs: readFiniteNumber(backendPreview.prompt_queued_ms),
        executionStartMs: readFiniteNumber(backendPreview.execution_start_ms),
        firstProgressMs: readFiniteNumber(backendPreview.first_progress_ms),
        firstPreviewMs: readFiniteNumber(backendPreview.first_preview_ms),
        firstImageMs: readFiniteNumber(backendPreview.first_image_ms),
        completeMs: readFiniteNumber(backendPreview.complete_ms),
        previewEventCount: readFiniteNumber(backendPreview.preview_event_count),
        firstPreviewBytes: readFiniteNumber(backendPreview.first_preview_bytes),
        averagePreviewBytes: readFiniteNumber(backendPreview.average_preview_bytes),
        finalImageBytes: readFiniteNumber(backendPreview.final_image_bytes),
        isFinal: backendPreview.is_final === true,
    };
}

/**
 * Normalizes backend generation progress into the same frontend shape used by the live canvas, queue, and upscaler.
 */
export function normalizeGenerationProgress({
    progress,
    params = {},
    generationId,
    requestId,
    eventSequence,
    serverElapsedMs,
    managerReceivedAtMs,
}: NormalizeGenerationProgressInput): GenerationProgressData {
    const progressRecord = progress as Record<string, unknown>;
    const paramsRecord = params as Record<string, unknown>;
    const fallbackTotalSteps = readPositiveInteger(paramsRecord.steps, 20);
    const stageTotalStepsRaw = readOptionalFiniteNumber(progressRecord, 'stage_total_steps');
    const stageCurrentStepRaw = readOptionalFiniteNumber(progressRecord, 'stage_current_step');
    const hasBackendStepMetadata =
        stageTotalStepsRaw !== undefined &&
        stageTotalStepsRaw > 0 &&
        stageCurrentStepRaw !== undefined &&
        stageCurrentStepRaw >= 0;
    const stageTotalSteps = stageTotalStepsRaw ?? 0;
    const stageCurrentStep = stageCurrentStepRaw ?? 0;
    const stepSource: GenerationProgressData['stepSource'] = hasBackendStepMetadata || progressRecord.current_percent_is_step === true
        ? 'backend'
        : 'node_percent';
    const totalSteps = hasBackendStepMetadata
        ? Math.round(stageTotalSteps)
        : stepSource === 'backend'
            ? fallbackTotalSteps
            : 0;
    const currentPercent = Math.min(1, Math.max(0, readFiniteNumber(progressRecord.current_percent) ?? 0));
    const currentStep = hasBackendStepMetadata
        ? Math.min(totalSteps, Math.max(0, Math.round(stageCurrentStep)))
        : stepSource === 'backend' && totalSteps > 0
            ? Math.min(totalSteps, Math.max(0, Math.round(currentPercent * totalSteps)))
            : 0;

    const batchTotal = readPositiveInteger(paramsRecord.images, 1);
    const batchIndexRaw = readFiniteNumber(progressRecord.batch_index) ?? 0;
    const batchIndex = Math.max(0, Math.floor(batchIndexRaw));
    const batchPercent = Math.min(1, Math.max(0, readFiniteNumber(progressRecord.overall_percent) ?? 0));
    const requestOverallPercent = ((batchIndex + batchPercent) / batchTotal) * 100;

    return {
        currentStep,
        totalSteps,
        stepSource,
        overallPercent: Math.min(100, Math.max(0, requestOverallPercent)),
        batch: batchIndex,
        batchTotal,
        requestId: typeof progressRecord.request_id === 'string' ? progressRecord.request_id : requestId,
        generationId,
        eventSequence: eventSequence ?? readFiniteNumber(progressRecord.event_sequence),
        serverElapsedMs: serverElapsedMs ?? readFiniteNumber(progressRecord.server_time_ms),
        managerReceivedAtMs,
        previewImage: typeof progressRecord.preview === 'string' ? progressRecord.preview : undefined,
        previewFrameSequence: readFiniteNumber(progressRecord.preview_frame_sequence),
        backendProgressSequence: readFiniteNumber(progressRecord.backend_progress_sequence),
        nodeIndex: readFiniteNumber(progressRecord.node_index),
        nodeCount: readFiniteNumber(progressRecord.node_count),
        currentNode: typeof progressRecord.current_node === 'string' ? progressRecord.current_node : undefined,
        currentPercentSource: typeof progressRecord.current_percent_source === 'string' ? progressRecord.current_percent_source : undefined,
        stageId: readOptionalStringOrNull(progressRecord, 'stage_id'),
        stageLabel: readOptionalStringOrNull(progressRecord, 'stage_label'),
        stageDetail: readOptionalStringOrNull(progressRecord, 'stage_detail'),
        stageIndex: readOptionalFiniteNumber(progressRecord, 'stage_index'),
        stageCount: readOptionalFiniteNumber(progressRecord, 'stage_count'),
        stagesRemaining: readOptionalFiniteNumber(progressRecord, 'stages_remaining'),
        stageTaskIndex: readOptionalFiniteNumber(progressRecord, 'stage_task_index'),
        stageTaskCount: readOptionalFiniteNumber(progressRecord, 'stage_task_count'),
        stageTasksRemaining: readOptionalFiniteNumber(progressRecord, 'stage_tasks_remaining'),
        backendPreview: readBackendPreview(progressRecord),
    };
}

/**
 * Builds a preview event from normalized progress when the backend sent an exact preview frame.
 */
export function generationPreviewFromProgress(progress: GenerationProgressData): GenerationPreviewData | null {
    if (!progress.previewImage) {
        return null;
    }
    return {
        image: progress.previewImage,
        requestId: progress.requestId,
        generationId: progress.generationId,
        eventSequence: progress.eventSequence,
        serverElapsedMs: progress.serverElapsedMs,
        managerReceivedAtMs: progress.managerReceivedAtMs,
        previewFrameSequence: progress.previewFrameSequence,
        backendProgressSequence: progress.backendProgressSequence,
        currentStep: progress.currentStep,
        totalSteps: progress.totalSteps,
        stepSource: progress.stepSource,
        overallPercent: progress.overallPercent,
        batch: progress.batch,
        batchTotal: progress.batchTotal,
        nodeIndex: progress.nodeIndex,
        nodeCount: progress.nodeCount,
        currentNode: progress.currentNode,
        currentPercentSource: progress.currentPercentSource,
        stageId: progress.stageId,
        stageLabel: progress.stageLabel,
        stageDetail: progress.stageDetail,
        stageIndex: progress.stageIndex,
        stageCount: progress.stageCount,
        stagesRemaining: progress.stagesRemaining,
        stageTaskIndex: progress.stageTaskIndex,
        stageTaskCount: progress.stageTaskCount,
        stageTasksRemaining: progress.stageTasksRemaining,
    };
}

/**
 * Converts normalized progress into preview fields suitable for persisted job-like state.
 */
export function mergeGenerationPreviewSnapshot(
    existing: GenerationPreviewSnapshot,
    progress: GenerationProgressData
): GenerationPreviewSnapshot {
    const eventSequence = progress.eventSequence ?? null;
    if (
        existing.previewEventSequence !== undefined &&
        existing.previewEventSequence !== null &&
        eventSequence !== null &&
        eventSequence < existing.previewEventSequence
    ) {
        return {
            lastProgressAt: Date.now(),
        };
    }
    const hasNewPreview = !!progress.previewImage;
    let nextRevision = existing.previewRevision ?? 0;
    if (hasNewPreview && progress.previewImage !== existing.previewImage) {
        nextRevision += 1;
    }
    return {
        previewImage: hasNewPreview ? progress.previewImage ?? null : existing.previewImage ?? null,
        previewRevision: nextRevision,
        previewEventSequence: eventSequence ?? existing.previewEventSequence ?? null,
        previewFrameSequence: progress.previewFrameSequence ?? existing.previewFrameSequence ?? null,
        backendProgressSequence: progress.backendProgressSequence ?? existing.backendProgressSequence ?? null,
        stageId: progress.stageId !== undefined ? progress.stageId : existing.stageId ?? null,
        stageLabel: progress.stageLabel !== undefined ? progress.stageLabel : existing.stageLabel ?? null,
        stageDetail: progress.stageDetail !== undefined ? progress.stageDetail : existing.stageDetail ?? null,
        stageIndex: progress.stageIndex ?? existing.stageIndex ?? 0,
        stageCount: progress.stageCount ?? existing.stageCount ?? 0,
        stagesRemaining: progress.stagesRemaining ?? existing.stagesRemaining ?? 0,
        stageTaskIndex: progress.stageTaskIndex ?? existing.stageTaskIndex ?? 0,
        stageTaskCount: progress.stageTaskCount ?? existing.stageTaskCount ?? 0,
        stageTasksRemaining: progress.stageTasksRemaining ?? existing.stageTasksRemaining ?? 0,
        currentStep: progress.currentStep,
        totalSteps: progress.totalSteps,
        stepSource: progress.stepSource,
        currentBatch: progress.batch + 1,
        totalBatches: progress.batchTotal,
        lastProgressAt: Date.now(),
        lastPreviewAt: hasNewPreview ? Date.now() : existing.lastPreviewAt,
    };
}
