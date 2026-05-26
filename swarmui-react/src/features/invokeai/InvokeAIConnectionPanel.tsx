import { useCallback, useMemo } from 'react';
import { Alert, Badge, Card, Divider, Group, Select, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconPlugConnected, IconRefresh } from '@tabler/icons-react';
import { SwarmButton } from '../../components/ui';
import { useInvokeAIStore } from './useInvokeAIStore';
import type { InvokeAIConnectionState } from './types';

function connectionColor(state: InvokeAIConnectionState): string {
    switch (state) {
        case 'connected': return 'green';
        case 'checking': return 'yellow';
        case 'error': return 'red';
        default: return 'gray';
    }
}

function connectionLabel(state: InvokeAIConnectionState): string {
    switch (state) {
        case 'connected': return 'Connected';
        case 'checking': return 'Checking';
        case 'error': return 'Error';
        default: return 'Not checked';
    }
}

export function InvokeAIConnectionPanel() {
    const baseUrl = useInvokeAIStore((state) => state.baseUrl);
    const connectionState = useInvokeAIStore((state) => state.connectionState);
    const version = useInvokeAIStore((state) => state.version);
    const lastError = useInvokeAIStore((state) => state.lastError);
    const lastCheckedAt = useInvokeAIStore((state) => state.lastCheckedAt);
    const models = useInvokeAIStore((state) => state.models);
    const selectedModelKey = useInvokeAIStore((state) => state.selectedModelKey);
    const isRefreshingModels = useInvokeAIStore((state) => state.isRefreshingModels);
    const setBaseUrl = useInvokeAIStore((state) => state.setBaseUrl);
    const setSelectedModelKey = useInvokeAIStore((state) => state.setSelectedModelKey);
    const checkConnection = useInvokeAIStore((state) => state.checkConnection);
    const refreshModels = useInvokeAIStore((state) => state.refreshModels);

    const modelOptions = useMemo(() => models.map((model) => ({
        value: model.key,
        label: `${model.name}${model.base ? ` (${model.base})` : ''}`,
    })), [models]);

    const handleCheck = useCallback(async () => {
        try {
            await checkConnection();
            notifications.show({
                title: 'InvokeAI Connected',
                message: 'InvokeAI is ready for utility generation and canvas editing.',
                color: 'green',
            });
        } catch (error) {
            notifications.show({
                title: 'InvokeAI Connection Failed',
                message: error instanceof Error ? error.message : 'Could not connect to InvokeAI.',
                color: 'red',
            });
        }
    }, [checkConnection]);

    const handleRefreshModels = useCallback(async () => {
        try {
            await refreshModels();
            notifications.show({
                title: 'InvokeAI Models Refreshed',
                message: 'The main model list was updated.',
                color: 'green',
            });
        } catch (error) {
            notifications.show({
                title: 'Model Refresh Failed',
                message: error instanceof Error ? error.message : 'Could not refresh InvokeAI models.',
                color: 'red',
            });
        }
    }, [refreshModels]);

    return (
        <Card withBorder padding="md" className="surface-glass swarm-resource-card">
            <Stack gap="md">
                <Group justify="space-between" align="flex-start">
                    <Stack gap={4}>
                        <Group gap="xs">
                            <Text fw={700}>InvokeAI Editing Bridge</Text>
                            <Badge color={connectionColor(connectionState)} variant="light">
                                {connectionLabel(connectionState)}
                            </Badge>
                            {version && (
                                <Badge color="blue" variant="light">
                                    {version}
                                </Badge>
                            )}
                        </Group>
                        <Text size="sm" c="dimmed">
                            InvokeAI is used here for image editing and lightweight utility generation. Swarm generation remains the primary path.
                        </Text>
                    </Stack>
                    <SwarmButton
                        size="sm"
                        tone="brand"
                        emphasis="outline"
                        leftSection={<IconPlugConnected size={16} />}
                        loading={connectionState === 'checking'}
                        onClick={() => void handleCheck()}
                    >
                        Check Connection
                    </SwarmButton>
                </Group>

                {lastError && (
                    <Alert color="red" icon={<IconAlertTriangle size={16} />}>
                        {lastError}
                    </Alert>
                )}

                <TextInput
                    label="InvokeAI Base URL"
                    description="Example: http://127.0.0.1:9090"
                    value={baseUrl}
                    onChange={(event) => setBaseUrl(event.currentTarget.value)}
                />

                <Divider />

                <Group align="flex-end" grow>
                    <Select
                        label="Main Model"
                        placeholder={models.length ? 'Select a model' : 'Connect to load models'}
                        data={modelOptions}
                        value={selectedModelKey}
                        onChange={setSelectedModelKey}
                        searchable
                        disabled={!models.length}
                    />
                    <SwarmButton
                        size="sm"
                        tone="secondary"
                        emphasis="outline"
                        leftSection={<IconRefresh size={16} />}
                        loading={isRefreshingModels}
                        disabled={connectionState !== 'connected'}
                        onClick={() => void handleRefreshModels()}
                    >
                        Refresh Models
                    </SwarmButton>
                </Group>

                {lastCheckedAt && (
                    <Text size="xs" c="dimmed">
                        Last checked {new Date(lastCheckedAt).toLocaleString()}
                    </Text>
                )}
            </Stack>
        </Card>
    );
}
