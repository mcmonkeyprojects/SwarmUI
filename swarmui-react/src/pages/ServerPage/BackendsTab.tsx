import { useState, useMemo, useCallback } from 'react';
import {
    Stack,
    Group,
    Text,
    Card,
    Badge,
    Loader,
    Center,
    Modal,
    Select,
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import {
    IconRefresh,
    IconPlus,
    IconTrash,
    IconPlayerPlay,
    IconPlayerStop,
    IconBrain,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { swarmClient } from '../../api/client';
import { queryClient, queryKeys } from '../../api/queryClient';
import { useBackends } from '../../hooks/useModels';
import type { BackendDetail } from '../../api/types';
import { useSessionStore } from '../../stores/session';
import { SwarmButton, SwarmActionIcon } from '../../components/ui';
import { InvokeAIConnectionPanel } from '../../features/invokeai/InvokeAIConnectionPanel';
import { InvokeAIUtilityPanel } from '../../features/invokeai/InvokeAIUtilityPanel';

function statusColor(status: string): string {
    switch (status.toLowerCase()) {
        case 'running': return 'var(--theme-success)';
        case 'idle': return 'var(--theme-accent)';
        case 'loading': return 'var(--theme-warning)';
        case 'errored': return 'var(--theme-error)';
        case 'disabled': return 'var(--theme-gray-4)';
        default: return 'var(--theme-gray-4)';
    }
}

export function BackendsTab() {
    const isInitialized = useSessionStore((s) => s.isInitialized);
    const [addModalOpen, setAddModalOpen] = useState(false);
    const [selectedType, setSelectedType] = useState<string | null>(null);
    const [addLoading, setAddLoading] = useState(false);
    const [deleteId, setDeleteId] = useState<number | string | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [restartLoading, setRestartLoading] = useState(false);
    const [freeMemLoading, setFreeMemLoading] = useState(false);

    const backendsQuery = useBackends({ enabled: isInitialized });
    const backendTypesQuery = useQuery({
        queryKey: queryKeys.server.backendTypes(),
        queryFn: () => swarmClient.listBackendTypes(),
        enabled: isInitialized,
        staleTime: 10 * 60 * 1000,
    });

    const backends = useMemo<BackendDetail[]>(() => {
        return (backendsQuery.data ?? []).map((backend) => ({
            ...(backend as unknown as BackendDetail),
            id:
                typeof backend.id === 'number'
                    ? backend.id
                    : Number.isNaN(Number(backend.id))
                        ? backend.id
                        : Number(backend.id),
            features: Array.isArray((backend as unknown as BackendDetail).features)
                ? (backend as unknown as BackendDetail).features
                : [],
            enabled: (backend as unknown as BackendDetail).enabled ?? true,
            title: (backend as unknown as BackendDetail).title || String(backend.id),
            max_usages: (backend as unknown as BackendDetail).max_usages ?? 0,
        }));
    }, [backendsQuery.data]);

    const backendTypes = backendTypesQuery.data ?? [];
    const loading = backendsQuery.isLoading || backendTypesQuery.isLoading;

    const refreshBackends = useCallback(async () => {
        await queryClient.invalidateQueries({ queryKey: queryKeys.backend.bootstrap });
        await Promise.all([backendsQuery.refetch(), backendTypesQuery.refetch()]);
    }, [backendsQuery, backendTypesQuery]);

    const handleToggle = async (id: number | string, currentEnabled: boolean) => {
        try {
            await swarmClient.toggleBackend(id, !currentEnabled);
            notifications.show({ title: 'Success', message: `Backend ${!currentEnabled ? 'enabled' : 'disabled'}`, color: 'green' });
            await refreshBackends();
        } catch {
            notifications.show({ title: 'Error', message: 'Failed to toggle backend', color: 'red' });
        }
    };

    const handleRestart = async () => {
        setRestartLoading(true);
        try {
            const response = await swarmClient.restartBackends();
            notifications.show({ title: 'Restarted', message: response.result || 'Backends restarted', color: 'green' });
            await refreshBackends();
        } catch {
            notifications.show({ title: 'Error', message: 'Failed to restart backends', color: 'red' });
        } finally {
            setRestartLoading(false);
        }
    };

    const handleFreeMemory = async () => {
        setFreeMemLoading(true);
        try {
            const response = await swarmClient.freeBackendMemory();
            notifications.show({ title: 'Memory Freed', message: response.result || 'Backend memory freed', color: 'green' });
        } catch {
            notifications.show({ title: 'Error', message: 'Failed to free memory', color: 'red' });
        } finally {
            setFreeMemLoading(false);
        }
    };

    const handleAdd = async () => {
        if (!selectedType) return;
        setAddLoading(true);
        try {
            const response = await swarmClient.addNewBackend(selectedType);
            if ('error' in response && response.error) {
                notifications.show({ title: 'Error', message: response.error, color: 'red' });
            } else {
                notifications.show({ title: 'Added', message: 'New backend added', color: 'green' });
                setAddModalOpen(false);
                setSelectedType(null);
                await refreshBackends();
            }
        } catch {
            notifications.show({ title: 'Error', message: 'Failed to add backend', color: 'red' });
        } finally {
            setAddLoading(false);
        }
    };

    const handleDelete = async () => {
        if (deleteId == null) return;
        setDeleteLoading(true);
        try {
            await swarmClient.deleteBackend(deleteId);
            notifications.show({ title: 'Deleted', message: 'Backend removed', color: 'green' });
            setDeleteId(null);
            await refreshBackends();
        } catch {
            notifications.show({ title: 'Error', message: 'Failed to delete backend', color: 'red' });
        } finally {
            setDeleteLoading(false);
        }
    };

    const typeOptions = backendTypes.map((t) => ({
        value: t.id,
        label: t.name,
    }));

    if (loading) {
        return <Center h={300}><Loader size="lg" /></Center>;
    }

    return (
        <Stack gap="md" className="swarm-server-section">
            {/* Action Bar */}
            <Group justify="space-between" className="swarm-server-controls">
                <Group gap="xs">
                    <SwarmButton
                        tone="brand"
                        size="sm"
                        leftSection={<IconPlus size={16} />}
                        onClick={() => setAddModalOpen(true)}
                    >
                        Add Backend
                    </SwarmButton>
                    <SwarmButton
                        tone="secondary"
                        emphasis="outline"
                        size="sm"
                        leftSection={<IconRefresh size={16} />}
                        loading={restartLoading}
                        onClick={handleRestart}
                    >
                        Restart All
                    </SwarmButton>
                    <SwarmButton
                        tone="secondary"
                        emphasis="outline"
                        size="sm"
                        leftSection={<IconBrain size={16} />}
                        loading={freeMemLoading}
                        onClick={handleFreeMemory}
                    >
                        Free Memory
                    </SwarmButton>
                </Group>
                <SwarmActionIcon
                    tone="secondary"
                    emphasis="soft"
                    label="Refresh backend list"
                    onClick={() => void refreshBackends()}
                >
                    <IconRefresh size={18} />
                </SwarmActionIcon>
            </Group>

            {/* Backends List */}
            {backends.length === 0 ? (
                <Center h={200}>
                    <Text c="dimmed">No backends configured</Text>
                </Center>
            ) : (
                <Stack gap="sm" className="swarm-server-list">
                    {backends.map((backend) => (
                        <Card key={String(backend.id)} withBorder padding="md" className="surface-glass swarm-resource-card">
                            <Group justify="space-between" wrap="nowrap">
                                <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                                    <Group gap="xs">
                                        <Text fw={600} size="sm">
                                            {backend.title || `Backend #${backend.id}`}
                                        </Text>
                                        <Badge
                                            size="sm"
                                            styles={{
                                                root: {
                                                    background: `color-mix(in srgb, ${statusColor(backend.status)} 22%, var(--theme-gray-8))`,
                                                    border: `1px solid color-mix(in srgb, ${statusColor(backend.status)} 44%, transparent)`,
                                                    color: statusColor(backend.status),
                                                },
                                            }}
                                        >
                                            {backend.status}
                                        </Badge>
                                        {!backend.enabled && (
                                            <Badge size="xs" variant="outline" styles={{ root: { color: 'var(--theme-gray-2)', borderColor: 'var(--theme-gray-4)' } }}>
                                                Disabled
                                            </Badge>
                                        )}
                                    </Group>
                                    <Text size="xs" c="var(--theme-gray-2)">
                                        Type: {backend.type}
                                        {backend.max_usages > 0 && ` | Max Usages: ${backend.max_usages}`}
                                        {backend.features.length > 0 && ` | Features: ${backend.features.join(', ')}`}
                                    </Text>
                                </Stack>
                                <Group gap="xs">
                                    <SwarmButton
                                        size="xs"
                                        tone={backend.enabled ? 'danger' : 'brand'}
                                        emphasis="outline"
                                        leftSection={backend.enabled ? <IconPlayerStop size={14} /> : <IconPlayerPlay size={14} />}
                                        onClick={() => handleToggle(backend.id, backend.enabled)}
                                    >
                                        {backend.enabled ? 'Disable' : 'Enable'}
                                    </SwarmButton>
                                    <SwarmActionIcon
                                        size="sm"
                                        tone="danger"
                                        emphasis="ghost"
                                        label={`Delete backend ${String(backend.id)}`}
                                        onClick={() => setDeleteId(backend.id)}
                                    >
                                        <IconTrash size={14} />
                                    </SwarmActionIcon>
                                </Group>
                            </Group>
                        </Card>
                    ))}
                </Stack>
            )}

            <InvokeAIConnectionPanel />
            <InvokeAIUtilityPanel />

            {/* Add Backend Modal */}
            <Modal
                opened={addModalOpen}
                onClose={() => setAddModalOpen(false)}
                title="Add Backend"
                size="sm"
                centered
            >
                <Stack gap="md">
                    <Select
                        label="Backend Type"
                        placeholder="Select a backend type..."
                        data={typeOptions}
                        value={selectedType}
                        onChange={setSelectedType}
                        searchable
                    />
                    {selectedType && backendTypes.find(t => t.id === selectedType) && (
                        <Text size="xs" c="dimmed">
                            {backendTypes.find(t => t.id === selectedType)?.description}
                        </Text>
                    )}
                    <Group justify="flex-end">
                        <SwarmButton tone="secondary" emphasis="ghost" onClick={() => setAddModalOpen(false)}>
                            Cancel
                        </SwarmButton>
                        <SwarmButton tone="brand" loading={addLoading} onClick={handleAdd} disabled={!selectedType}>
                            Add
                        </SwarmButton>
                    </Group>
                </Stack>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                opened={deleteId != null}
                onClose={() => setDeleteId(null)}
                title="Delete Backend"
                size="sm"
                centered
            >
                <Stack gap="md">
                    <Text size="sm">
                        Are you sure you want to delete backend <strong>#{String(deleteId)}</strong>? This cannot be undone.
                    </Text>
                    <Group justify="flex-end">
                        <SwarmButton tone="secondary" emphasis="ghost" onClick={() => setDeleteId(null)}>
                            Cancel
                        </SwarmButton>
                        <SwarmButton tone="danger" loading={deleteLoading} onClick={handleDelete}>
                            Delete
                        </SwarmButton>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    );
}
