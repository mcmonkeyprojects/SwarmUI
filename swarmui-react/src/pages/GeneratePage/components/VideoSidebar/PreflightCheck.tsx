import { useEffect, useRef, useState } from 'react';
import { Alert, Badge, Group, Progress, Stack, Text } from '@mantine/core';
import {
    IconAlertTriangle,
    IconCheck,
    IconDownload,
    IconRefresh,
} from '@tabler/icons-react';
import { swarmClient } from '../../../../api/client';
import { SwarmButton } from '../../../../components/ui';
import type { RequiredComponent } from './videoModelProfiles';

type ComponentStatus = 'checking' | 'present' | 'missing' | 'downloading' | 'error';

interface ComponentState {
    status: ComponentStatus;
    overallPercent: number;
    currentPercent: number;
    perSecond: number;
    errorMessage?: string;
}

function makeInitialState(): ComponentState {
    return {
        status: 'checking',
        overallPercent: 0,
        currentPercent: 0,
        perSecond: 0,
    };
}

interface PreflightCheckProps {
    requiredComponents: RequiredComponent[];
    onStatusChange: (allReady: boolean) => void;
}

export function PreflightCheck({ requiredComponents, onStatusChange }: PreflightCheckProps) {
    const [states, setStates] = useState<ComponentState[]>(() =>
        requiredComponents.map(makeInitialState)
    );
    // Track active WebSocket refs so we can close them on unmount
    const socketRefs = useRef<(WebSocket | null)[]>([]);

    // Reset state whenever requiredComponents changes
    useEffect(() => {
        queueMicrotask(() => {
            setStates(requiredComponents.map(makeInitialState));
        });
        socketRefs.current = requiredComponents.map(() => null);
    }, [requiredComponents]);

    // Check presence whenever requiredComponents (or reset) occurs
    useEffect(() => {
        if (requiredComponents.length === 0) {
            onStatusChange(true);
            return;
        }

        let cancelled = false;

        const checkAll = async () => {
            const results = await Promise.all(
                requiredComponents.map(async (comp) => {
                    try {
                        const models = await swarmClient.listModels('', comp.modelType);
                        const found = models.some((m) =>
                            m.name.toLowerCase().includes(comp.filename.toLowerCase())
                        );
                        return found ? 'present' : 'missing';
                    } catch {
                        return 'missing';
                    }
                })
            );

            if (cancelled) return;

            setStates((prev) =>
                prev.map((s, i) => ({
                    ...s,
                    status: results[i] as ComponentStatus,
                }))
            );
        };

        checkAll();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [requiredComponents]);

    // Notify parent when all are present/ready
    useEffect(() => {
        if (requiredComponents.length === 0) return;
        const allReady = states.every((s) => s.status === 'present');
        onStatusChange(allReady);
    }, [states, requiredComponents.length, onStatusChange]);

    function startDownload(index: number) {
        const comp = requiredComponents[index];
        if (!comp) return;

        // Close any existing socket for this slot
        socketRefs.current[index]?.close();

        setStates((prev) =>
            prev.map((s, i) =>
                i === index
                    ? { ...s, status: 'downloading', overallPercent: 0, currentPercent: 0, perSecond: 0, errorMessage: undefined }
                    : s
            )
        );

        const socket = swarmClient.downloadModel(
            { url: comp.downloadUrl, type: comp.modelType, name: comp.filename },
            {
                onProgress: ({ overall_percent, current_percent, per_second }) => {
                    setStates((prev) =>
                        prev.map((s, i) =>
                            i === index
                                ? { ...s, overallPercent: overall_percent, currentPercent: current_percent, perSecond: per_second }
                                : s
                        )
                    );
                },
                onSuccess: () => {
                    setStates((prev) =>
                        prev.map((s, i) =>
                            i === index ? { ...s, status: 'present', overallPercent: 100 } : s
                        )
                    );
                    socketRefs.current[index] = null;
                },
                onError: (error) => {
                    setStates((prev) =>
                        prev.map((s, i) =>
                            i === index
                                ? { ...s, status: 'error', errorMessage: error }
                                : s
                        )
                    );
                    socketRefs.current[index] = null;
                },
            }
        );

        socketRefs.current[index] = socket;
    }

    // Clean up sockets on unmount
    useEffect(() => {
        return () => {
            for (const socket of socketRefs.current) {
                socket?.close();
            }
        };
    }, []);

    if (requiredComponents.length === 0) {
        return null;
    }

    const isChecking = states.some((s) => s.status === 'checking');
    const allPresent = states.every((s) => s.status === 'present');
    const hasMissing = states.some((s) => s.status === 'missing' || s.status === 'error' || s.status === 'downloading');

    if (isChecking) {
        return (
            <Badge color="gray" variant="light" leftSection={null}>
                Checking components...
            </Badge>
        );
    }

    if (allPresent) {
        return (
            <Badge
                color="green"
                variant="light"
                leftSection={<IconCheck size={12} />}
            >
                All components ready
            </Badge>
        );
    }

    if (hasMissing) {
        return (
            <Alert
                color="yellow"
                variant="light"
                icon={<IconAlertTriangle size={16} />}
                title="Missing Components"
            >
                <Stack gap="sm">
                    {requiredComponents.map((comp, i) => {
                        const state = states[i];
                        if (!state) return null;

                        return (
                            <Stack key={comp.filename} gap={4}>
                                <Group justify="space-between" wrap="nowrap">
                                    <Text size="sm" fw={500}>
                                        {comp.name}
                                    </Text>

                                    {state.status === 'missing' && (
                                        <SwarmButton
                                            size="xs"
                                            tone="brand"
                                            emphasis="soft"
                                            leftSection={<IconDownload size={14} />}
                                            onClick={() => startDownload(i)}
                                        >
                                            Download
                                        </SwarmButton>
                                    )}

                                    {state.status === 'error' && (
                                        <SwarmButton
                                            size="xs"
                                            tone="danger"
                                            emphasis="soft"
                                            leftSection={<IconRefresh size={14} />}
                                            onClick={() => startDownload(i)}
                                        >
                                            Retry
                                        </SwarmButton>
                                    )}

                                    {state.status === 'downloading' && (
                                        <Text size="xs" c="dimmed">
                                            {state.perSecond > 0
                                                ? `${(state.perSecond / 1024 / 1024).toFixed(1)} MB/s`
                                                : 'Downloading...'}
                                        </Text>
                                    )}
                                </Group>

                                {state.status === 'downloading' && (
                                    <Progress
                                        value={state.overallPercent}
                                        size="sm"
                                        animated
                                        color="brand"
                                    />
                                )}

                                {state.status === 'error' && state.errorMessage && (
                                    <Text size="xs" c="red">
                                        {state.errorMessage}
                                    </Text>
                                )}
                            </Stack>
                        );
                    })}
                </Stack>
            </Alert>
        );
    }

    return null;
}
