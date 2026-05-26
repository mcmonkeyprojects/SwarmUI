export type GenerationStepSource = 'backend' | 'node_percent' | 'unknown';
export type GenerationPhase = 'idle' | 'starting' | 'connected' | 'waiting' | 'progress' | 'image' | 'complete' | 'error';

export interface GenerationProgressDisplayInput {
    progress: number;
    hasProgressEvent?: boolean;
    currentStep?: number | null;
    totalSteps?: number | null;
    stepSource?: GenerationStepSource;
    stageLabel?: string | null;
    stageDetail?: string | null;
    stageIndex?: number | null;
    stageCount?: number | null;
    stagesRemaining?: number | null;
    stageTaskIndex?: number | null;
    stageTaskCount?: number | null;
    stageTasksRemaining?: number | null;
    currentBatch?: number | null;
    totalBatches?: number | null;
}

export interface GenerationStatusInput extends GenerationProgressDisplayInput {
    error: string | null;
    isGenerating: boolean;
    phase: GenerationPhase;
    imagesCount: number;
}

export interface GenerationPhaseDisplayInput extends GenerationProgressDisplayInput {
    phase?: GenerationPhase;
}

function isFinitePositiveInteger(value: number | null | undefined): value is number {
    return Number.isFinite(value) && Math.floor(value) === value && value > 0;
}

function formatBatchPrefix(currentBatch?: number | null, totalBatches?: number | null): string {
    if (!isFinitePositiveInteger(totalBatches) || totalBatches <= 1) {
        return '';
    }
    const batch = isFinitePositiveInteger(currentBatch) ? Math.min(currentBatch, totalBatches) : 1;
    return `Image ${batch}/${totalBatches} | `;
}

export function formatGenerationStepDisplay(input: GenerationProgressDisplayInput): string | null {
    const stepSource = input.stepSource ?? 'unknown';
    if (stepSource === 'node_percent') {
        return `Processing ${Math.round(input.progress)}%`;
    }
    if (isFinitePositiveInteger(input.currentStep) && isFinitePositiveInteger(input.totalSteps)) {
        return `Step ${Math.min(input.currentStep, input.totalSteps)}/${input.totalSteps}`;
    }
    if (
        input.hasProgressEvent &&
        !isFinitePositiveInteger(input.currentStep) &&
        isFinitePositiveInteger(input.totalSteps) &&
        input.progress > 0
    ) {
        const estimatedStep = Math.min(Math.round((input.progress / 100) * input.totalSteps), input.totalSteps);
        return `Step ~${estimatedStep}/${input.totalSteps}`;
    }
    return null;
}

export function formatGenerationTaskDisplay(input: GenerationProgressDisplayInput): string | null {
    if (
        isFinitePositiveInteger(input.stageTaskIndex) &&
        isFinitePositiveInteger(input.stageTaskCount) &&
        input.stageTaskCount > 1 &&
        input.stageTaskIndex <= input.stageTaskCount
    ) {
        return `Task ${input.stageTaskIndex}/${input.stageTaskCount}`;
    }
    return null;
}

export function formatGenerationStageDisplay(input: GenerationProgressDisplayInput): string | null {
    if (
        isFinitePositiveInteger(input.stageIndex) &&
        isFinitePositiveInteger(input.stageCount) &&
        input.stageCount > 1 &&
        input.stageIndex <= input.stageCount
    ) {
        return `Stage ${input.stageIndex}/${input.stageCount}`;
    }
    return null;
}

export function formatGenerationRemainingDisplay(input: GenerationProgressDisplayInput): string | null {
    if (
        isFinitePositiveInteger(input.stageTasksRemaining) &&
        input.stageTasksRemaining > 0 &&
        isFinitePositiveInteger(input.stageTaskCount) &&
        input.stageTaskCount > 1
    ) {
        return `${input.stageTasksRemaining} task${input.stageTasksRemaining === 1 ? '' : 's'} remaining`;
    }
    if (isFinitePositiveInteger(input.stagesRemaining) && input.stagesRemaining > 0) {
        return `${input.stagesRemaining} stage${input.stagesRemaining === 1 ? '' : 's'} remaining`;
    }
    return null;
}

export function formatGenerationPercentDisplay(input: GenerationProgressDisplayInput): string {
    if (!input.hasProgressEvent) {
        return 'Pending';
    }
    return `${Math.round(Math.min(100, Math.max(0, input.progress)))}%`;
}

export function formatGenerationPhaseDisplay(input: GenerationPhaseDisplayInput): string {
    if (input.hasProgressEvent && input.phase === 'progress') {
        return 'Processing';
    }

    switch (input.phase) {
        case 'starting':
            return 'Queuing';
        case 'connected':
            return 'Connecting';
        case 'waiting':
            return 'Waiting';
        case 'progress':
            return 'Processing';
        case 'image':
            return 'Receiving';
        case 'complete':
            return 'Complete';
        case 'error':
            return 'Error';
        default:
            return input.hasProgressEvent ? 'Processing' : 'Queuing';
    }
}

export function formatGenerationStageText(input: GenerationProgressDisplayInput): string {
    const batchPrefix = formatBatchPrefix(input.currentBatch, input.totalBatches);
    const label = input.stageLabel || 'Generating';
    const detail = input.stageDetail && input.stageDetail !== input.stageLabel
        ? ` | ${input.stageDetail}`
        : '';
    return `${batchPrefix}${label}${detail}`;
}

export function formatGenerationStatusText(input: GenerationStatusInput): string {
    if (input.error) {
        return input.imagesCount > 0
            ? `Completed with warning: ${input.error}. Diagnostics captured.`
            : `Error: ${input.error}. Diagnostics captured.`;
    }

    if (!input.isGenerating) {
        if (input.phase === 'complete' && input.imagesCount > 0) {
            return 'Generation complete!';
        }
        return '';
    }

    if (!input.hasProgressEvent) {
        if (input.phase === 'starting') {
            return 'Starting generation request...';
        }
        if (input.phase === 'connected' || input.phase === 'waiting') {
            return 'Connected to backend... preparing workflow';
        }
        if (input.phase === 'image') {
            return 'Receiving generated image output...';
        }
        return 'Starting generation... waiting for backend progress';
    }

    const percent = Math.round(input.progress);
    const stageText = formatGenerationStageText(input);
    const batchPrefix = formatBatchPrefix(input.currentBatch, input.totalBatches);
    const stepDisplay = formatGenerationStepDisplay(input);

    if (input.stageLabel) {
        return stageText;
    }

    if (input.stepSource === 'node_percent') {
        return `Processing... ${batchPrefix}${percent}% overall`;
    }

    if (!isFinitePositiveInteger(input.currentStep)) {
        return `Preparing workflow... ${batchPrefix}${percent}%`;
    }

    return `Generating... ${batchPrefix}${stepDisplay ?? `Step ${input.currentStep}/${input.totalSteps || '?'}`} (${percent}%)`;
}

export function hasValidStageBadge(stageIndex?: number | null, stageCount?: number | null): boolean {
    return Boolean(formatGenerationStageDisplay({ progress: 0, stageIndex, stageCount }));
}

export function hasValidPipelineBadge(stageIndex?: number | null, stageCount?: number | null): boolean {
    return isFinitePositiveInteger(stageIndex) &&
        isFinitePositiveInteger(stageCount) &&
        stageCount > 0 &&
        stageIndex <= stageCount;
}
