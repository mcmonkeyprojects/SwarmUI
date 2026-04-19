import { Group, Indicator, Progress, Tooltip } from '@mantine/core';
import { IconListCheck } from '@tabler/icons-react';
import { useQueueStore } from '../stores/queue';
import { useWebSocketStore } from '../stores/websocketStore';
import { SwarmActionIcon, SwarmBadge, type SwarmTone } from './ui';
import { useShallow } from 'zustand/react/shallow';
import { featureFlags } from '../config/featureFlags';

interface QueueStatusBadgeProps {
    compact?: boolean;
    onNavigateToQueue?: () => void;
}

const TONE_INDICATOR_COLORS: Record<SwarmTone, string> = {
    primary: 'var(--theme-brand)',
    secondary: 'var(--theme-gray-4)',
    success: 'var(--theme-success)',
    warning: 'var(--theme-warning)',
    danger: 'var(--theme-error)',
    info: 'var(--theme-info)',
};

export function QueueStatusBadge({ compact = false, onNavigateToQueue }: QueueStatusBadgeProps) {
    const { jobs, isProcessing, isPaused, runnerStatus } = useQueueStore(
        useShallow((state) => ({
            jobs: state.jobs,
            isProcessing: state.isProcessing,
            isPaused: state.isPaused,
            runnerStatus: state.runnerStatus,
        }))
    );
    const { isGenerating, progress } = useWebSocketStore(
        useShallow((state) => ({
            isGenerating: state.generation.isGenerating,
            progress: state.generation.progress,
        }))
    );
    const effectiveProcessing = featureFlags.queueRunnerV2
        ? runnerStatus === 'running' || runnerStatus === 'paused' || runnerStatus === 'stopping'
        : isProcessing;
    const effectivePaused = featureFlags.queueRunnerV2 ? runnerStatus === 'paused' : isPaused;

    const pendingCount = jobs.filter((j) => j.status === 'pending' || j.status === 'scheduled').length;
    const generatingJob = jobs.find((j) => j.status === 'generating');
    const liveProgress = generatingJob
        ? (generatingJob.progress || 0)
        : isGenerating
            ? progress
            : null;
    const completedCount = jobs.filter((j) => j.status === 'completed').length;
    const totalJobs = jobs.length;

    const handleClick = () => {
        onNavigateToQueue?.();
    };

    if (totalJobs === 0 && !isGenerating) {
        if (compact) return null;
        return (
            <Tooltip label="Queue is empty">
                <SwarmActionIcon
                    tone="secondary"
                    emphasis="ghost"
                    label="Open queue page"
                    onClick={handleClick}
                >
                    <IconListCheck size={20} />
                </SwarmActionIcon>
            </Tooltip>
        );
    }

    let badgeTone: SwarmTone = 'secondary';
    if (effectivePaused) {
        badgeTone = 'warning';
    } else if (effectiveProcessing && generatingJob) {
        badgeTone = 'info';
    } else if (isGenerating) {
        badgeTone = 'info';
    } else if (pendingCount > 0) {
        badgeTone = 'info';
    } else if (completedCount === totalJobs) {
        badgeTone = 'success';
    }

    let statusText = '';
    if (effectivePaused) {
        statusText = 'Paused';
    } else if (liveProgress !== null) {
        statusText = `${Math.round(liveProgress)}%`;
    } else if (pendingCount > 0) {
        statusText = `${pendingCount} pending`;
    } else {
        statusText = 'Done';
    }

    if (compact) {
        return (
            <Indicator
                label={pendingCount > 0 ? pendingCount : undefined}
                size={pendingCount > 9 ? 18 : 16}
                processing={(effectiveProcessing && !effectivePaused) || isGenerating}
                disabled={pendingCount === 0 && !effectiveProcessing && !isGenerating}
                styles={{
                    indicator: {
                        backgroundColor: TONE_INDICATOR_COLORS[badgeTone],
                        color: 'var(--theme-gray-9)',
                        border: '1px solid color-mix(in srgb, var(--theme-gray-0) 18%, transparent)',
                    },
                }}
            >
                <Tooltip label={`Queue: ${statusText}`}>
                    <SwarmActionIcon
                        tone={badgeTone}
                        emphasis="ghost"
                        label="Open queue page"
                        onClick={handleClick}
                    >
                        <IconListCheck size={20} />
                    </SwarmActionIcon>
                </Tooltip>
            </Indicator>
        );
    }

    return (
        <Tooltip label="View Queue">
            <SwarmBadge
                size="lg"
                emphasis="soft"
                tone={badgeTone}
                contrast="strong"
                style={{ cursor: 'pointer' }}
                onClick={handleClick}
                leftSection={
                    liveProgress !== null ? (
                        <Progress
                            value={liveProgress}
                            size={8}
                            radius="xl"
                            style={{ width: 44 }}
                            styles={{
                                root: {
                                    background: 'var(--theme-progress-track-bg)',
                                    border: '1px solid var(--theme-progress-track-border)',
                                },
                                section: {
                                    background: 'var(--theme-progress-fill)',
                                    boxShadow: '0 0 9px var(--theme-progress-glow)',
                                },
                            }}
                        />
                    ) : (
                        <IconListCheck size={14} />
                    )
                }
            >
                <Group gap={4}>
                    {pendingCount > 0 && <span>{pendingCount}</span>}
                    <span>{statusText}</span>
                </Group>
            </SwarmBadge>
        </Tooltip>
    );
}
