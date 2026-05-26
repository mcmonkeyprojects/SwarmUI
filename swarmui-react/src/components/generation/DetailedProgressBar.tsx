import { useEffect, useMemo, useState } from 'react';
import {
    Box,
    Group,
    Stack,
    Text,
    Image,
    Paper,
} from '@mantine/core';
import { motion, useReducedMotion } from 'framer-motion';
import { IconClock, IconLoader } from '@tabler/icons-react';
import { livePreviewPulse, instantSpring } from '../../utils/animations';
import {
    formatGenerationPercentDisplay,
    formatGenerationRemainingDisplay,
    formatGenerationStageDisplay,
    formatGenerationStepDisplay,
    formatGenerationTaskDisplay,
} from '../../utils/generationProgressDisplay';

interface DetailedProgressBarProps {
    /** Overall progress percentage (0-100) */
    progress: number;
    /** True after first progress event from backend */
    hasProgressEvent?: boolean;
    /** Current denoising step (optional) */
    currentStep?: number;
    /** Total steps configured (optional) */
    totalSteps?: number;
    /** Whether currentStep is backend step data or inferred node progress */
    stepSource?: 'backend' | 'node_percent' | 'unknown';
    /** Current major generation stage label */
    stageLabel?: string | null;
    /** Current stage index (1-based) */
    stageIndex?: number | null;
    /** Total number of major stages */
    stageCount?: number | null;
    /** Remaining major stages after the active one */
    stagesRemaining?: number | null;
    /** Current task index inside the active stage */
    stageTaskIndex?: number | null;
    /** Total task count inside the active stage */
    stageTaskCount?: number | null;
    /** Remaining tasks inside the active stage */
    stageTasksRemaining?: number | null;
    /** Live preview thumbnail URL */
    previewImage?: string | null;
    /** Current status message */
    statusText?: string;
    /** Generation start timestamp for ETA calculation */
    startTime?: number;
    /** Whether currently generating */
    isGenerating: boolean;
}

/**
 * Detailed progress bar with step counter, ETA, and live preview.
 * Now with Framer Motion spring-based smooth animations.
 */
export function DetailedProgressBar({
    progress,
    hasProgressEvent = true,
    currentStep,
    totalSteps,
    stepSource = 'unknown',
    stageLabel,
    stageIndex,
    stageCount,
    stagesRemaining,
    stageTaskIndex,
    stageTaskCount,
    stageTasksRemaining,
    previewImage,
    statusText,
    startTime,
    isGenerating,
}: DetailedProgressBarProps) {
    const prefersReducedMotion = useReducedMotion();
    const disableMotion = prefersReducedMotion || isGenerating;
    const [now, setNow] = useState(() => Date.now());
    const isPending = isGenerating && !hasProgressEvent;

    useEffect(() => {
        if (!isGenerating) {
            return;
        }

        const intervalId = window.setInterval(() => {
            setNow(Date.now());
        }, 1000);

        return () => window.clearInterval(intervalId);
    }, [isGenerating]);

    // Calculate ETA based on elapsed time and progress
    const eta = useMemo(() => {
        if (!startTime || progress <= 0 || progress >= 100) return null;

        const elapsed = now - startTime;
        const estimatedTotal = elapsed / (progress / 100);
        const remaining = estimatedTotal - elapsed;

        if (remaining <= 0) return null;

        const seconds = Math.round(remaining / 1000);
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${minutes}m ${secs}s`;
    }, [now, startTime, progress]);

    const stepDisplay = useMemo(() => {
        return formatGenerationStepDisplay({
            progress,
            hasProgressEvent,
            currentStep,
            totalSteps,
            stepSource,
        });
    }, [currentStep, totalSteps, progress, hasProgressEvent, stepSource]);

    const taskDisplay = useMemo(() => {
        return formatGenerationTaskDisplay({
            progress,
            stageTaskIndex,
            stageTaskCount,
        });
    }, [progress, stageTaskIndex, stageTaskCount]);

    const stageDisplay = useMemo(() => {
        const stageProgressDisplay = formatGenerationStageDisplay({
            progress,
            stageIndex,
            stageCount,
        });
        return stageProgressDisplay || (stageLabel && !taskDisplay && !stepDisplay ? stageLabel : null);
    }, [progress, stageIndex, stageCount, stageLabel, taskDisplay, stepDisplay]);

    const remainingDisplay = useMemo(() => {
        return formatGenerationRemainingDisplay({
            progress,
            stagesRemaining,
            stageTaskIndex,
            stageTaskCount,
            stageTasksRemaining,
        });
    }, [progress, stageTaskIndex, stageTasksRemaining, stageTaskCount, stagesRemaining]);

    const percentDisplay = useMemo(() => {
        return formatGenerationPercentDisplay({
            progress,
            hasProgressEvent,
        });
    }, [hasProgressEvent, progress]);

    if (!isGenerating && progress === 0) {
        return null;
    }

    return (
        <Paper
            p="sm"
            radius="md"
            withBorder
            style={{
                background:
                    'linear-gradient(180deg, color-mix(in srgb, var(--theme-gray-8) 90%, var(--theme-gray-7)), color-mix(in srgb, var(--theme-gray-8) 96%, var(--theme-gray-9)))',
                borderColor: 'var(--theme-progress-track-border)',
                boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--theme-gray-0) 8%, transparent)',
            }}
        >
            <Group gap="md" align="flex-start" wrap="nowrap">
                {/* Live preview thumbnail with pulse animation */}
                {previewImage && (
                    disableMotion ? (
                        <Box
                            style={{
                                width: 80,
                                height: 80,
                                borderRadius: 8,
                                overflow: 'hidden',
                                border: '1px solid var(--theme-gray-5)',
                                backgroundColor: 'var(--theme-gray-8)',
                                flexShrink: 0,
                            }}
                        >
                            <Image
                                src={previewImage}
                                alt="Preview"
                                fit="cover"
                                w={80}
                                h={80}
                            />
                        </Box>
                    ) : (
                        <motion.div
                            variants={livePreviewPulse}
                            animate={isGenerating ? 'animate' : undefined}
                            style={{
                                width: 80,
                                height: 80,
                                borderRadius: 8,
                                overflow: 'hidden',
                                border: '1px solid var(--theme-gray-5)',
                                backgroundColor: 'var(--theme-gray-8)',
                                flexShrink: 0,
                            }}
                        >
                            <Image
                                src={previewImage}
                                alt="Preview"
                                fit="cover"
                                w={80}
                                h={80}
                            />
                        </motion.div>
                    )
                )}

                {/* Progress info */}
                <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
                    {/* Status text with loading spinner */}
                    <Group gap="xs" wrap="nowrap">
                        {isGenerating && (
                            <IconLoader size={14} className="icon-spin status-generating" />
                        )}
                        <Text size="sm" fw={500} style={{ color: 'var(--theme-gray-1)' }} truncate>
                            {statusText || (isGenerating ? 'Generating...' : 'Complete')}
                        </Text>
                    </Group>

                    {/* Spring-animated progress bar */}
                    <Box
                        style={{
                            position: 'relative',
                            height: 12,
                            background: 'var(--theme-progress-track-bg)',
                            borderRadius: 4,
                            overflow: 'hidden',
                            border: '1px solid var(--theme-progress-track-border)',
                            boxShadow: 'inset 0 1px 1px color-mix(in srgb, black 30%, transparent)',
                        }}
                    >
                        {disableMotion ? (
                            <Box
                                className={isPending ? 'generate-studio-canvas__progress-fill--pending' : undefined}
                                style={{
                                    width: isPending ? '42%' : `${progress}%`,
                                    height: '100%',
                                    background: isGenerating
                                        ? 'var(--theme-progress-fill)'
                                        : 'var(--theme-progress-fill-complete)',
                                    borderRadius: 3,
                                    boxShadow: isGenerating
                                        ? '0 0 12px var(--theme-progress-glow)'
                                        : '0 0 10px var(--theme-progress-glow-complete)',
                                }}
                            />
                        ) : (
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: isPending ? '42%' : `${progress}%` }}
                                transition={instantSpring}
                                className={isPending ? 'generate-studio-canvas__progress-fill--pending' : undefined}
                                style={{
                                    height: '100%',
                                    background: isGenerating
                                        ? 'var(--theme-progress-fill)'
                                        : 'var(--theme-progress-fill-complete)',
                                    borderRadius: 3,
                                    boxShadow: isGenerating
                                        ? '0 0 12px var(--theme-progress-glow)'
                                        : '0 0 10px var(--theme-progress-glow-complete)',
                                }}
                            />
                        )}
                        {/* Animated shimmer overlay during generation */}
                        {isGenerating && !disableMotion && (
                            <motion.div
                                animate={{ x: ['-100%', '200%'] }}
                                transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '50%',
                                    height: '100%',
                                    background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--theme-gray-0) 20%, transparent), transparent)',
                                    pointerEvents: 'none',
                                }}
                            />
                        )}
                    </Box>

                    {/* Stats row */}
                    <Group gap="md" justify="space-between">
                        <Group gap="sm">
                            {/* Percentage with animated counter effect */}
                            {disableMotion ? (
                                <Text size="xs" fw={600} style={{ color: 'var(--theme-progress-label)' }}>
                                    {percentDisplay}
                                </Text>
                            ) : (
                                <motion.div
                                    key={Math.round(progress)}
                                    initial={{ opacity: 0.5, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ duration: 0.1 }}
                                >
                                    <Text size="xs" fw={600} style={{ color: 'var(--theme-progress-label)' }}>
                                        {percentDisplay}
                                    </Text>
                                </motion.div>
                            )}

                            {/* Step counter */}
                            {stepDisplay && (
                                <>
                                    <Text size="xs" style={{ color: 'var(--theme-gray-4)' }}>-</Text>
                                    <Text size="xs" style={{ color: 'var(--theme-gray-2)' }}>
                                        {stepDisplay}
                                    </Text>
                                </>
                            )}

                            {taskDisplay && (
                                <>
                                    <Text size="xs" style={{ color: 'var(--theme-gray-4)' }}>-</Text>
                                    <Text size="xs" style={{ color: 'var(--theme-gray-2)' }}>
                                        {taskDisplay}
                                    </Text>
                                </>
                            )}

                            {stageDisplay && (
                                <>
                                    <Text size="xs" style={{ color: 'var(--theme-gray-4)' }}>-</Text>
                                    <Text size="xs" style={{ color: 'var(--theme-gray-2)' }}>
                                        {stageDisplay}
                                    </Text>
                                </>
                            )}

                            {remainingDisplay && (
                                <>
                                    <Text size="xs" style={{ color: 'var(--theme-gray-4)' }}>-</Text>
                                    <Text size="xs" style={{ color: 'var(--theme-gray-2)' }}>
                                        {remainingDisplay}
                                    </Text>
                                </>
                            )}
                        </Group>

                        {/* ETA */}
                        {eta && isGenerating && (
                            <Group gap={4}>
                                <IconClock size={12} color="var(--theme-gray-4)" />
                                <Text size="xs" style={{ color: 'var(--theme-gray-4)' }}>
                                    ~{eta} remaining
                                </Text>
                            </Group>
                        )}
                    </Group>
                </Stack>
            </Group>
        </Paper>
    );
}

