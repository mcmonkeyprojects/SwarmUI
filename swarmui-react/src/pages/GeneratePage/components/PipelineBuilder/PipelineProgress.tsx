import { memo } from 'react';
import {
    Box,
    Group,
    Text,
    Tooltip,
    Progress,
    Loader,
} from '@mantine/core';
import {
    IconCheck,
    IconLoader,
    IconExclamationCircle,
    IconCircle,
} from '@tabler/icons-react';
import type { PipelineStageConfig } from '../../../../types/pipeline';
import { PIPELINE_STAGE_LABELS } from '../../../../types/pipeline';

export type StageProgressStatus = 'pending' | 'running' | 'completed' | 'error';

interface PipelineProgressProps {
    stages: PipelineStageConfig[];
    currentStageIndex: number;
    stageResults: Record<string, { error?: string | null }>;
    isRunning: boolean;
    pipelineError?: string;
    'aria-live'?: 'polite' | 'assertive' | 'off';
}

export const PipelineProgress = memo(function PipelineProgress({
    stages,
    currentStageIndex,
    stageResults,
    isRunning,
    pipelineError,
    'aria-live': ariaLive,
}: PipelineProgressProps) {
    const enabledStages = stages.filter((s) => s.enabled);
    const totalStages = enabledStages.length;
    const completedCount = enabledStages.filter((s) => {
        const result = stageResults[s.id];
        return result && !result.error;
    }).length;
    const failedCount = enabledStages.filter((s) => {
        const result = stageResults[s.id];
        return result && result.error;
    }).length;
    const overallProgress = totalStages > 0 ? ((completedCount + failedCount) / totalStages) * 100 : 0;

    const currentStage = isRunning && currentStageIndex < enabledStages.length
        ? enabledStages[currentStageIndex]
        : null;

    return (
        <Box role="status" aria-live={ariaLive}>
            <Progress
                value={overallProgress}
                size="sm"
                animated={isRunning}
                color={pipelineError || failedCount > 0 ? 'red' : undefined}
            />
            <Group gap={4} mt={4} wrap="wrap" justify="space-between">
                <Group gap={4} wrap="wrap">
                    {enabledStages.map((stage, index) => {
                        let status: StageProgressStatus = 'pending';
                        let Icon = IconCircle;
                        let color = 'var(--mantine-color-invokeGray-4)';

                        if (index < currentStageIndex) {
                            const result = stageResults[stage.id];
                            if (result && result.error) {
                                status = 'error';
                                Icon = IconExclamationCircle;
                                color = 'var(--mantine-color-red-5)';
                            }
                            else {
                                status = 'completed';
                                Icon = IconCheck;
                                color = 'var(--mantine-color-green-5)';
                            }
                        }
                        else if (isRunning && index === currentStageIndex) {
                            status = 'running';
                            Icon = IconLoader;
                            color = 'var(--mantine-color-blue-5)';
                        }

                        const label = PIPELINE_STAGE_LABELS[stage.kind];

                        return (
                            <Tooltip
                                key={stage.id}
                                label={`${label}: ${status}`}
                                withArrow
                            >
                                <Group gap={4} style={{ opacity: status === 'pending' && !isRunning ? 0.4 : 1 }}>
                                    <Icon size={14} color={color} style={{
                                        animation: status === 'running' ? 'spin 1.5s linear infinite' : undefined,
                                    }} />
                                    <Text size="xs" c={status === 'pending' ? 'dimmed' : undefined}>
                                        {label}
                                    </Text>
                                    {index < enabledStages.length - 1 && (
                                        <Text size="xs" c="dimmed" style={{ margin: '0 2px' }}>→</Text>
                                    )}
                                </Group>
                            </Tooltip>
                        );
                    })}
                </Group>
                {isRunning && currentStage && (
                    <Group gap="xs">
                        <Loader size="xs" color="blue" variant="dots" />
                        <Text size="xs" c="blue">
                            Running: {PIPELINE_STAGE_LABELS[currentStage.kind]}
                        </Text>
                    </Group>
                )}
            </Group>
            {pipelineError && (
                <Text size="xs" c="red" mt={4}>
                    {pipelineError}
                </Text>
            )}
        </Box>
    );
});
