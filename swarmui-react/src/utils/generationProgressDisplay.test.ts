import { describe, expect, it } from 'vitest';
import {
    formatGenerationPercentDisplay,
    formatGenerationPhaseDisplay,
    formatGenerationStageDisplay,
    formatGenerationStatusText,
    formatGenerationStepDisplay,
    formatGenerationTaskDisplay,
    hasValidPipelineBadge,
    hasValidStageBadge,
} from './generationProgressDisplay';

describe('generationProgressDisplay', () => {
    it('does not show invalid backend stage badge text', () => {
        expect(formatGenerationStageDisplay({ progress: 25, stageIndex: 1, stageCount: 0 })).toBeNull();
        expect(hasValidStageBadge(1, 0)).toBe(false);
        expect(hasValidStageBadge(3, 2)).toBe(false);
    });

    it('keeps pipeline badge validation separate from backend stage validation', () => {
        expect(hasValidStageBadge(1, 0)).toBe(false);
        expect(hasValidPipelineBadge(1, 3)).toBe(true);
    });

    it('returns visible pending phase and percent text before backend progress arrives', () => {
        expect(formatGenerationPhaseDisplay({
            progress: 0,
            hasProgressEvent: false,
            phase: 'starting',
        })).toBe('Queuing');
        expect(formatGenerationPercentDisplay({
            progress: 0,
            hasProgressEvent: false,
        })).toBe('Pending');
        expect(formatGenerationStatusText({
            error: null,
            isGenerating: true,
            phase: 'starting',
            imagesCount: 0,
            hasProgressEvent: false,
            progress: 0,
        })).toBe('Starting generation request...');
    });

    it('shows step and task text only when backend counts are valid', () => {
        expect(formatGenerationStepDisplay({
            progress: 25,
            hasProgressEvent: true,
            currentStep: 4,
            totalSteps: 20,
            stepSource: 'backend',
        })).toBe('Step 4/20');
        expect(formatGenerationStepDisplay({
            progress: 25,
            hasProgressEvent: true,
            currentStep: 4,
            totalSteps: 0,
            stepSource: 'backend',
        })).toBeNull();
        expect(formatGenerationTaskDisplay({
            progress: 25,
            stageTaskIndex: 1,
            stageTaskCount: 2,
        })).toBe('Task 1/2');
        expect(formatGenerationTaskDisplay({
            progress: 25,
            stageTaskIndex: 3,
            stageTaskCount: 2,
        })).toBeNull();
    });

    it('uses backend stage text when active and processing fallback when no stage is active', () => {
        expect(formatGenerationStatusText({
            error: null,
            isGenerating: true,
            phase: 'progress',
            imagesCount: 0,
            hasProgressEvent: true,
            progress: 42,
            currentStep: 4,
            totalSteps: 20,
            stepSource: 'backend',
            stageLabel: 'Sampling',
            stageDetail: null,
        })).toBe('Sampling');

        expect(formatGenerationStatusText({
            error: null,
            isGenerating: true,
            phase: 'progress',
            imagesCount: 0,
            hasProgressEvent: true,
            progress: 68,
            currentStep: 0,
            totalSteps: 0,
            stepSource: 'node_percent',
            stageLabel: null,
            stageDetail: null,
        })).toBe('Processing... 68% overall');
    });
});
