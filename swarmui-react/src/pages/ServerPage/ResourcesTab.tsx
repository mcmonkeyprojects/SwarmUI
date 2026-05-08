import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    Badge,
    Box,
    Card,
    Center,
    Checkbox,
    Group,
    Loader,
    Progress,
    SimpleGrid,
    Stack,
    Text,
    ThemeIcon,
} from '@mantine/core';
import {
    IconActivityHeartbeat,
    IconBolt,
    IconBrain,
    IconDeviceDesktop,
    IconRefresh,
    IconServer,
    IconSparkles,
    IconTemperature,
} from '@tabler/icons-react';
import { swarmClient } from '../../api/client';
import { queryClient, queryKeys } from '../../api/queryClient';
import { useBackends } from '../../hooks/useModels';
import type { BackendStatus, ModelDescription } from '../../api/types';
import { useSessionStore } from '../../stores/session';
import { ProgressRingStat, StatTile, SwarmActionIcon, SwarmButton } from '../../components/ui';
import { showError, showSuccess, showWarning } from '../../utils/notificationUtils';

function formatBytes(bytes: number): string {
    if (bytes === 0) {
        return '0 B';
    }
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function clampPercent(value: number): number {
    return Math.max(0, Math.min(100, value));
}

function getProgressStyles(percent: number) {
    const fill =
        percent > 90
            ? 'var(--theme-tone-danger-bg)'
            : percent > 70
                ? 'var(--theme-tone-warning-bg)'
                : 'var(--theme-progress-fill)';
    const glow =
        percent > 90
            ? 'var(--theme-tone-danger-glow)'
            : percent > 70
                ? 'var(--theme-tone-warning-glow)'
                : 'var(--theme-progress-glow)';

    return {
        root: {
            background: 'var(--theme-progress-track-bg)',
            border: '1px solid var(--theme-progress-track-border)',
        },
        section: {
            background: fill,
            boxShadow: `0 0 10px ${glow}`,
        },
    };
}

function normalizeModelPath(value: string | null | undefined): string {
    return (value || '').replaceAll('\\', '/').trim().toLowerCase();
}

function modelNamesMatch(modelName: string, currentModel: string | null | undefined): boolean {
    const normalizedModel = normalizeModelPath(modelName);
    const normalizedCurrent = normalizeModelPath(currentModel);
    if (!normalizedModel || !normalizedCurrent) {
        return false;
    }
    return normalizedModel === normalizedCurrent
        || normalizedModel === `${normalizedCurrent}.safetensors`
        || `${normalizedModel}.safetensors` === normalizedCurrent;
}

function shortModelName(name: string): string {
    const cleaned = name.replaceAll('\\', '/');
    const finalSegment = cleaned.split('/').pop();
    return finalSegment || cleaned;
}

function pickModelTitle(model: ModelDescription): string {
    return model.title?.trim() || shortModelName(model.name);
}

function getLoadTone(percent: number): 'cool' | 'warm' | 'hot' {
    if (percent >= 85) {
        return 'hot';
    }
    if (percent >= 65) {
        return 'warm';
    }
    return 'cool';
}

function extractIntegers(value: unknown): number[] {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return [value];
    }
    if (typeof value === 'string') {
        return Array.from(value.matchAll(/\d+/g)).map((match) => Number(match[0]));
    }
    if (Array.isArray(value)) {
        return value.flatMap((entry) => extractIntegers(entry));
    }
    if (value && typeof value === 'object') {
        return Object.values(value as Record<string, unknown>).flatMap((entry) => extractIntegers(entry));
    }
    return [];
}

function inferBackendGpuIds(backend: BackendStatus): string[] {
    const settings = backend.settings;
    if (!settings || typeof settings !== 'object') {
        return [];
    }
    const ids = new Set<string>();
    for (const [key, rawValue] of Object.entries(settings)) {
        if (!/(gpu|cuda|device)/i.test(key)) {
            continue;
        }
        for (const value of extractIntegers(rawValue)) {
            ids.add(String(value));
        }
    }
    return Array.from(ids);
}

interface TelemetryMeterProps {
    label: string;
    value: number;
    hint?: string;
}

function TelemetryMeter({ label, value, hint }: TelemetryMeterProps) {
    const clamped = clampPercent(value);
    const tone = getLoadTone(clamped);
    return (
        <Stack gap={4}>
            <Group justify="space-between" gap="xs" wrap="nowrap">
                <Text size="xs" fw={600}>{label}</Text>
                <Text size="xs" fw={700}>{Math.round(clamped)}%</Text>
            </Group>
            <div className={`swarm-resource-meter swarm-resource-meter--${tone}`}>
                <div className="swarm-resource-meter__fill" style={{ width: `${clamped}%` }} />
            </div>
            {hint && (
                <Text size="xs" c="dimmed">
                    {hint}
                </Text>
            )}
        </Stack>
    );
}

interface MetricChipProps {
    label: string;
    value: string | number;
    hint?: string;
}

function MetricChip({ label, value, hint }: MetricChipProps) {
    return (
        <div className="swarm-resource-chip">
            <Text size="10px" fw={700} tt="uppercase" c="var(--theme-text-secondary)">
                {label}
            </Text>
            <Text size="lg" fw={700}>
                {value}
            </Text>
            {hint && (
                <Text size="xs" c="dimmed" lineClamp={2}>
                    {hint}
                </Text>
            )}
        </div>
    );
}

interface LoadedModelCardData {
    model: ModelDescription;
    hosts: BackendStatus[];
    hostGpuIds: string[];
    backendShare: number;
    hostVramPercent: number | null;
    hostVramUsed: number;
    hostVramTotal: number;
    heatPercent: number;
    activityLabel: string;
}

export function ResourcesTab() {
    const isInitialized = useSessionStore((s) => s.isInitialized);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [ejectingModels, setEjectingModels] = useState<Record<string, boolean>>({});
    const refreshInterval = autoRefresh ? 3000 : false;

    const resourcesQuery = useQuery({
        queryKey: queryKeys.server.resources(),
        queryFn: () => swarmClient.getServerResourceInfo(),
        enabled: isInitialized,
        refetchInterval: refreshInterval,
        refetchIntervalInBackground: false,
    });
    const loadedModelsQuery = useQuery({
        queryKey: queryKeys.models.loaded(),
        queryFn: () => swarmClient.listLoadedModels(),
        enabled: isInitialized,
        refetchInterval: refreshInterval,
        refetchIntervalInBackground: false,
    });
    const backendsQuery = useBackends({ enabled: isInitialized, autoRefresh });

    const resources = resourcesQuery.data ?? null;
    const loadedModels = useMemo(() => loadedModelsQuery.data ?? [], [loadedModelsQuery.data]);
    const backendStatuses = useMemo(() => backendsQuery.data ?? [], [backendsQuery.data]);
    const loading = resourcesQuery.isLoading || loadedModelsQuery.isLoading || backendsQuery.isLoading;
    const refreshing = resourcesQuery.isFetching || loadedModelsQuery.isFetching || backendsQuery.isFetching;
    const loadError = resourcesQuery.error || loadedModelsQuery.error || backendsQuery.error;

    const fetchSnapshot = useCallback(async () => {
        try {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.server.resources(), refetchType: 'none' }),
                queryClient.invalidateQueries({ queryKey: queryKeys.models.loaded(), refetchType: 'none' }),
                queryClient.invalidateQueries({ queryKey: queryKeys.backend.bootstrap, refetchType: 'none' }),
            ]);
            await Promise.all([
                resourcesQuery.refetch(),
                loadedModelsQuery.refetch(),
                backendsQuery.refetch(),
            ]);
        } catch {
            showError('Resources refresh failed', 'Unable to load the current server performance snapshot.');
        }
    }, [backendsQuery, loadedModelsQuery, resourcesQuery]);

    const ramUsedPercent = resources?.system_ram.total
        ? (resources.system_ram.used / resources.system_ram.total) * 100
        : 0;

    const gpuEntries = useMemo(() => Object.entries(resources?.gpus || {}), [resources]);

    const loadableBackends = useMemo(() => {
        return backendStatuses.filter((backend) => backend.can_load_models !== false);
    }, [backendStatuses]);

    const activeModelHosts = useMemo(() => {
        return loadableBackends.filter((backend) => typeof backend.current_model === 'string' && backend.current_model.trim());
    }, [loadableBackends]);

    const loadedModelCards = useMemo<LoadedModelCardData[]>(() => {
        const totalModelHosts = Math.max(loadableBackends.length, 1);
        return loadedModels
            .map((model) => {
                const hosts = activeModelHosts.filter((backend) => modelNamesMatch(model.name, backend.current_model));
                const inferredGpuIds = new Set<string>();
                for (const host of hosts) {
                    for (const gpuId of inferBackendGpuIds(host)) {
                        inferredGpuIds.add(gpuId);
                    }
                }
                if (!inferredGpuIds.size && gpuEntries.length === 1 && hosts.length > 0) {
                    inferredGpuIds.add(gpuEntries[0][0]);
                }
                const hostGpuIds = Array.from(inferredGpuIds);
                const hostGpus = hostGpuIds
                    .map((gpuId) => resources?.gpus?.[gpuId])
                    .filter((gpu): gpu is NonNullable<typeof gpu> => !!gpu);
                const hostVramUsed = hostGpus.reduce((sum, gpu) => sum + gpu.used_memory, 0);
                const hostVramTotal = hostGpus.reduce((sum, gpu) => sum + gpu.total_memory, 0);
                const hostVramPercent = hostVramTotal > 0
                    ? (hostVramUsed / hostVramTotal) * 100
                    : null;
                const freshestSeconds = hosts
                    .map((host) => host.seconds_since_used)
                    .filter((value): value is number => typeof value === 'number');
                const freshestHost = freshestSeconds.length > 0 ? Math.min(...freshestSeconds) : null;
                let activityLabel = 'Loaded';
                if (freshestHost !== null) {
                    if (freshestHost <= 5) {
                        activityLabel = 'Active now';
                    }
                    else if (freshestHost <= 45) {
                        activityLabel = 'Touched recently';
                    }
                    else {
                        activityLabel = 'Cooling down';
                    }
                }
                const backendShare = (hosts.length / totalModelHosts) * 100;
                const heatPercent = hostVramPercent ?? backendShare;
                return {
                    model,
                    hosts,
                    hostGpuIds,
                    backendShare,
                    hostVramPercent,
                    hostVramUsed,
                    hostVramTotal,
                    heatPercent,
                    activityLabel,
                };
            })
            .sort((left, right) => {
                if (right.heatPercent !== left.heatPercent) {
                    return right.heatPercent - left.heatPercent;
                }
                if (right.hosts.length !== left.hosts.length) {
                    return right.hosts.length - left.hosts.length;
                }
                return pickModelTitle(left.model).localeCompare(pickModelTitle(right.model));
            });
    }, [activeModelHosts, gpuEntries, loadedModels, loadableBackends.length, resources]);

    const gpuModelCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const card of loadedModelCards) {
            for (const gpuId of card.hostGpuIds) {
                counts[gpuId] = (counts[gpuId] || 0) + 1;
            }
        }
        return counts;
    }, [loadedModelCards]);

    const hottestGpu = useMemo(() => {
        const gpuStats = gpuEntries
            .map(([id, gpu]) => ({
                id,
                name: gpu.name,
                vramPercent: gpu.total_memory > 0 ? (gpu.used_memory / gpu.total_memory) * 100 : 0,
            }))
            .sort((left, right) => right.vramPercent - left.vramPercent);
        return gpuStats[0] || null;
    }, [gpuEntries]);

    const clusterPressure = Math.max(
        resources?.cpu.usage || 0,
        ramUsedPercent,
        hottestGpu?.vramPercent || 0
    );

    const operationalRecommendations = useMemo(() => {
        const recommendations: Array<{ label: string; detail: string; tone: 'red' | 'yellow' | 'teal' | 'blue' }> = [];
        if (clusterPressure >= 85) {
            recommendations.push({
                label: 'High pressure',
                detail: 'Pause large queue campaigns or free backend memory before starting another heavy run.',
                tone: 'red',
            });
        }
        if ((hottestGpu?.vramPercent || 0) >= 80) {
            recommendations.push({
                label: 'VRAM hot',
                detail: 'Unload idle models or reduce batch size before image-to-video, refiner, or upscale work.',
                tone: 'yellow',
            });
        }
        if (activeModelHosts.length > 0 && loadedModels.length > activeModelHosts.length) {
            recommendations.push({
                label: 'Idle residency',
                detail: 'Some loaded models are not tied to active hosts; eject individual cards below if memory is tight.',
                tone: 'blue',
            });
        }
        if (recommendations.length === 0) {
            recommendations.push({
                label: 'Ready',
                detail: 'Resource pressure is low enough for normal generation, review, or dataset planning work.',
                tone: 'teal',
            });
        }
        return recommendations;
    }, [activeModelHosts.length, clusterPressure, hottestGpu?.vramPercent, loadedModels.length]);

    const handleEjectModel = useCallback(async (card: LoadedModelCardData) => {
        if (!card.hosts.length) {
            showWarning('Model residency unavailable', 'This model is marked as loaded, but no owning backend was identified to eject it from.');
            return;
        }
        setEjectingModels((current) => ({ ...current, [card.model.name]: true }));
        try {
            const responses = await Promise.allSettled(
                card.hosts.map((host) => swarmClient.freeBackendMemory(false, host.id))
            );
            const successfulHosts = responses.filter((response) => {
                if (response.status !== 'fulfilled') {
                    return false;
                }
                return !!response.value.result && (response.value.count || 0) > 0;
            }).length;
            if (successfulHosts === card.hosts.length) {
                showSuccess(
                    'Model ejected',
                    `${pickModelTitle(card.model)} was released from ${successfulHosts} backend${successfulHosts === 1 ? '' : 's'}.`
                );
            }
            else if (successfulHosts > 0) {
                showWarning(
                    'Partial eject',
                    `${pickModelTitle(card.model)} was released from ${successfulHosts} of ${card.hosts.length} backend hosts.`
                );
            }
            else {
                showError(
                    'Model eject failed',
                    `No backend reported that it released ${pickModelTitle(card.model)}.`
                );
            }
            await fetchSnapshot();
        } finally {
            setEjectingModels((current) => {
                const updated = { ...current };
                delete updated[card.model.name];
                return updated;
            });
        }
    }, [fetchSnapshot]);

    if (loading) {
        return <Center h={300}><Loader size="lg" /></Center>;
    }

    if (!resources) {
        return (
            <Card withBorder padding="lg" className="surface-glass swarm-resource-empty">
                <Stack align="center" gap="sm">
                    <Text fw={600}>Failed to load resource information</Text>
                    <Text size="sm" c="dimmed" ta="center">
                        The resources panel could not fetch a live server snapshot yet.
                    </Text>
                    <SwarmButton
                        tone="secondary"
                        emphasis="outline"
                        size="sm"
                        leftSection={<IconRefresh size={16} />}
                        loading={refreshing}
                        onClick={() => void fetchSnapshot()}
                    >
                        Retry
                    </SwarmButton>
                </Stack>
            </Card>
        );
    }

    return (
        <Stack gap="md" className="swarm-server-section swarm-resource-deck">
            <Group justify="flex-end" gap="xs" className="swarm-server-controls">
                <Checkbox
                    label={<Text size="xs">Auto-refresh (3s)</Text>}
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.currentTarget.checked)}
                    size="xs"
                />
                <SwarmButton
                    tone="secondary"
                    emphasis="outline"
                    size="xs"
                    leftSection={<IconBolt size={14} />}
                    loading={refreshing}
                    onClick={() => void fetchSnapshot()}
                >
                    Refresh Pulse
                </SwarmButton>
                <SwarmActionIcon
                    tone="secondary"
                    emphasis="soft"
                    label="Refresh resource metrics"
                    onClick={() => void fetchSnapshot()}
                >
                    <IconRefresh size={16} />
                </SwarmActionIcon>
            </Group>

            <Card withBorder padding="lg" className="surface-glass swarm-resource-hero">
                <Group justify="space-between" align="flex-start" gap="lg">
                    <Stack gap="xs" className="swarm-resource-hero__copy">
                        <Group gap="xs" wrap="wrap">
                            <div className="swarm-resource-live">
                                <span className="swarm-resource-live__dot" />
                                <Text size="xs" fw={700}>Live Performance Pulse</Text>
                            </div>
                            <Badge variant="light" color={clusterPressure >= 85 ? 'red' : clusterPressure >= 65 ? 'yellow' : 'teal'}>
                                {Math.round(clusterPressure)}% overall pressure
                            </Badge>
                            {refreshing && (
                                <Badge variant="light" color="blue">
                                    Refreshing
                                </Badge>
                            )}
                        </Group>
                        <Text size="xl" fw={700}>
                            Loaded models, backend residency, and live hardware pressure in one view
                        </Text>
                        <Text size="sm" c="dimmed" maw={640}>
                            Watch which models are occupying generation hosts, how much of your runtime footprint they hold,
                            and eject individual model hosts without hopping to another server tool.
                        </Text>
                        <Group gap="xs" wrap="wrap">
                            <Badge variant="outline">
                                {loadedModels.length} loaded model{loadedModels.length === 1 ? '' : 's'}
                            </Badge>
                            <Badge variant="outline">
                                {activeModelHosts.length} active host backend{activeModelHosts.length === 1 ? '' : 's'}
                            </Badge>
                            <Badge variant="outline">
                                {resources ? 'Live snapshot ready' : 'Waiting for first sample'}
                            </Badge>
                        </Group>
                        {loadError && (
                            <Text size="xs" c="var(--theme-error)">
                                {loadError instanceof Error ? loadError.message : 'Unable to refresh live server telemetry right now.'}
                            </Text>
                        )}
                    </Stack>

                    <div className="swarm-resource-hero__stats">
                        <MetricChip
                            label="Model Share"
                            value={`${Math.round((activeModelHosts.length / Math.max(loadableBackends.length, 1)) * 100)}%`}
                            hint={`${activeModelHosts.length}/${loadableBackends.length} model hosts active`}
                        />
                        <MetricChip
                            label="Hottest VRAM"
                            value={hottestGpu ? `${Math.round(hottestGpu.vramPercent)}%` : 'N/A'}
                            hint={hottestGpu ? hottestGpu.name : 'No GPU telemetry'}
                        />
                        <MetricChip
                            label="System RAM"
                            value={`${Math.round(ramUsedPercent)}%`}
                            hint={`${formatBytes(resources.system_ram.used)} live`}
                        />
                    </div>
                </Group>
            </Card>

            <Card withBorder padding="md" className="surface-glass">
                <Stack gap="xs">
                    <Group gap="xs">
                        <IconActivityHeartbeat size={18} color="var(--theme-brand)" />
                        <Text fw={700}>Operational Guidance</Text>
                    </Group>
                    <SimpleGrid cols={{ base: 1, md: operationalRecommendations.length > 1 ? 2 : 1 }} spacing="xs">
                        {operationalRecommendations.map((recommendation) => (
                            <Group key={recommendation.label} align="flex-start" gap="xs" wrap="nowrap">
                                <Badge color={recommendation.tone} variant="light">
                                    {recommendation.label}
                                </Badge>
                                <Text size="sm" c="dimmed">
                                    {recommendation.detail}
                                </Text>
                            </Group>
                        ))}
                    </SimpleGrid>
                </Stack>
            </Card>

            <SimpleGrid cols={{ base: 1, sm: 2, xl: 4 }} spacing="md">
                <ProgressRingStat
                    value={resources.cpu.usage}
                    label="CPU"
                    description={`${resources.cpu.cores} cores`}
                    color={
                        resources.cpu.usage > 80
                            ? 'var(--theme-error)'
                            : resources.cpu.usage > 50
                                ? 'var(--theme-warning)'
                                : 'var(--theme-brand)'
                    }
                />
                <Card withBorder padding="md" className="surface-glass swarm-resource-card">
                    <Stack gap="xs">
                        <Group justify="space-between">
                            <Text size="sm" fw={600}>System RAM</Text>
                            <Text size="xs" c="dimmed">
                                {formatBytes(resources.system_ram.used)} / {formatBytes(resources.system_ram.total)}
                            </Text>
                        </Group>
                        <Progress
                            value={ramUsedPercent}
                            size="lg"
                            styles={getProgressStyles(ramUsedPercent)}
                            radius="md"
                        />
                        <Text size="xs" c="dimmed">
                            {formatBytes(resources.system_ram.free)} free
                        </Text>
                    </Stack>
                </Card>
                <StatTile
                    label="Loaded Models"
                    value={loadedModels.length}
                    hint={`${activeModelHosts.length} backends currently holding a model`}
                    icon={<IconSparkles size={14} />}
                    tone={loadedModels.length > 0 ? 'brand' : 'neutral'}
                />
                <StatTile
                    label="Resident Hosts"
                    value={activeModelHosts.length}
                    hint={hottestGpu ? `${hottestGpu.name} is the hottest VRAM host` : 'No GPU host mapping yet'}
                    icon={<IconServer size={14} />}
                    tone={activeModelHosts.length > 0 ? 'warning' : 'neutral'}
                />
            </SimpleGrid>

            {gpuEntries.length > 0 && (
                <>
                    <Group justify="space-between" align="flex-end" mt="md">
                        <Stack gap={2}>
                            <Text size="lg" fw={600}>GPU Pressure</Text>
                            <Text size="sm" c="dimmed">
                                Live device utilization, thermals, and mapped resident-model host pressure.
                            </Text>
                        </Stack>
                        <ThemeIcon variant="light" radius="xl" size="lg" color="blue">
                            <IconActivityHeartbeat size={18} />
                        </ThemeIcon>
                    </Group>

                    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                        {gpuEntries.map(([id, gpu]) => {
                            const vramUsedPercent = gpu.total_memory > 0
                                ? (gpu.used_memory / gpu.total_memory) * 100
                                : 0;
                            const combinedLoad = clampPercent((gpu.utilization_gpu + vramUsedPercent) / 2);
                            return (
                                <Card key={id} withBorder padding="md" className="surface-glass swarm-resource-card swarm-resource-gpu-card animated-card">
                                    <Stack gap="sm">
                                        <Group justify="space-between">
                                            <Group gap="xs">
                                                <IconDeviceDesktop size={16} />
                                                <Stack gap={0}>
                                                    <Text size="sm" fw={600}>{gpu.name}</Text>
                                                    <Text size="xs" c="dimmed">GPU #{id}</Text>
                                                </Stack>
                                            </Group>
                                            <Badge variant="light" color={gpuModelCounts[id] ? 'blue' : 'gray'}>
                                                {gpuModelCounts[id] ? `${gpuModelCounts[id]} resident model${gpuModelCounts[id] === 1 ? '' : 's'}` : 'No mapped models'}
                                            </Badge>
                                        </Group>

                                        <div className="swarm-resource-chip-grid">
                                            <MetricChip
                                                label="Temperature"
                                                value={`${gpu.temperature} deg C`}
                                                hint={gpu.temperature >= 85 ? 'Thermal caution' : gpu.temperature >= 70 ? 'Warm' : 'Stable'}
                                            />
                                            <MetricChip
                                                label="VRAM Used"
                                                value={`${Math.round(vramUsedPercent)}%`}
                                                hint={`${formatBytes(gpu.used_memory)} / ${formatBytes(gpu.total_memory)}`}
                                            />
                                            <MetricChip
                                                label="GPU Core"
                                                value={`${Math.round(gpu.utilization_gpu)}%`}
                                                hint={`${Math.round(gpu.utilization_memory)}% memory bus`}
                                            />
                                        </div>

                                        <TelemetryMeter
                                            label="Compute pressure"
                                            value={gpu.utilization_gpu}
                                            hint={`${Math.round(gpu.utilization_memory)}% memory bus utilization`}
                                        />

                                        <TelemetryMeter
                                            label="VRAM pressure"
                                            value={vramUsedPercent}
                                            hint={`${formatBytes(gpu.free_memory)} free`}
                                        />

                                        <Stack gap={4}>
                                            <Group justify="space-between">
                                                <Text size="xs">Thermal + load blend</Text>
                                                <Group gap={6}>
                                                    <ThemeIcon size="sm" radius="xl" variant="light" color={gpu.temperature >= 85 ? 'red' : gpu.temperature >= 70 ? 'yellow' : 'teal'}>
                                                        <IconTemperature size={12} />
                                                    </ThemeIcon>
                                                    <Text size="xs" fw={600}>{gpu.temperature} deg C</Text>
                                                </Group>
                                            </Group>
                                            <Progress
                                                value={combinedLoad}
                                                size="lg"
                                                styles={getProgressStyles(combinedLoad)}
                                                radius="md"
                                            />
                                        </Stack>
                                    </Stack>
                                </Card>
                            );
                        })}
                    </SimpleGrid>
                </>
            )}

            {gpuEntries.length === 0 && (
                <Card withBorder padding="md" className="surface-glass swarm-resource-card">
                    <Center h={100}>
                        <Text c="dimmed">No GPU information available</Text>
                    </Center>
                </Card>
            )}
            <Group justify="space-between" align="flex-end" mt="md">
                <Stack gap={2}>
                    <Text size="lg" fw={600}>Loaded Model Footprint</Text>
                    <Text size="sm" c="dimmed">
                        Backend share is exact. Host VRAM pressure is derived from the GPUs currently mapped to each model host.
                    </Text>
                </Stack>
                <ThemeIcon variant="light" radius="xl" size="lg" color="violet">
                    <IconBrain size={18} />
                </ThemeIcon>
            </Group>

            {loadedModelCards.length > 0 ? (
                <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="md">
                    {loadedModelCards.map((card) => {
                        const heat = getLoadTone(card.heatPercent);
                        const previewUrl = card.model.preview_image;
                        const isEjecting = !!ejectingModels[card.model.name];
                        return (
                            <Card
                                key={card.model.name}
                                withBorder
                                padding="md"
                                className={`surface-glass swarm-resource-card swarm-resource-model-card swarm-resource-model-card--${heat} animated-card`}
                            >
                                <Box className="swarm-resource-model-card__media">
                                    {previewUrl && (
                                        <img
                                            src={previewUrl}
                                            alt=""
                                            className="swarm-resource-model-card__media-image"
                                        />
                                    )}
                                    <div className="swarm-resource-model-card__media-overlay" />
                                    <Group justify="space-between" align="flex-start" className="swarm-resource-model-card__media-content">
                                        <Badge variant="light" color={heat === 'hot' ? 'red' : heat === 'warm' ? 'yellow' : 'teal'}>
                                            {card.activityLabel}
                                        </Badge>
                                        <Badge variant="light" color="blue">
                                            {card.hosts.length} host{card.hosts.length === 1 ? '' : 's'}
                                        </Badge>
                                    </Group>
                                </Box>

                                <Stack gap="sm">
                                    <Group justify="space-between" align="flex-start" gap="md" wrap="nowrap">
                                        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                                            <Text size="sm" fw={700} lineClamp={1}>
                                                {pickModelTitle(card.model)}
                                            </Text>
                                            <Text size="xs" c="dimmed" lineClamp={1}>
                                                {shortModelName(card.model.name)}
                                            </Text>
                                        </Stack>
                                        <SwarmButton
                                            size="xs"
                                            tone="danger"
                                            emphasis="outline"
                                            loading={isEjecting}
                                            disabled={!card.hosts.length}
                                            onClick={() => void handleEjectModel(card)}
                                        >
                                            Eject
                                        </SwarmButton>
                                    </Group>

                                    <Group gap="xs" wrap="wrap">
                                        {card.model.architecture && (
                                            <Badge variant="outline">{card.model.architecture}</Badge>
                                        )}
                                        {card.model.standard_width > 0 && card.model.standard_height > 0 && (
                                            <Badge variant="outline">
                                                {card.model.standard_width}x{card.model.standard_height}
                                            </Badge>
                                        )}
                                        {card.hostGpuIds.length > 0 && (
                                            <Badge variant="outline">
                                                GPU {card.hostGpuIds.join(', ')}
                                            </Badge>
                                        )}
                                        {!card.hostGpuIds.length && (
                                            <Badge variant="outline" color="gray">
                                                GPU mapping unavailable
                                            </Badge>
                                        )}
                                    </Group>

                                    <div className="swarm-resource-chip-grid">
                                        <MetricChip
                                            label="Hosts"
                                            value={card.hosts.length}
                                            hint={`${card.hosts.length} backend${card.hosts.length === 1 ? '' : 's'} keeping it resident`}
                                        />
                                        <MetricChip
                                            label="Share"
                                            value={`${Math.round(card.backendShare)}%`}
                                            hint={`${card.hosts.length}/${loadableBackends.length} model hosts`}
                                        />
                                        <MetricChip
                                            label="Host VRAM"
                                            value={card.hostVramPercent === null ? 'N/A' : `${Math.round(card.hostVramPercent)}%`}
                                            hint={card.hostVramPercent === null ? 'No reliable GPU mapping yet' : `${formatBytes(card.hostVramUsed)} / ${formatBytes(card.hostVramTotal)}`}
                                        />
                                    </div>

                                    <TelemetryMeter
                                        label="Backend share"
                                        value={card.backendShare}
                                        hint={`${card.hosts.length} of ${Math.max(loadableBackends.length, 1)} model-capable backends`}
                                    />

                                    {card.hostVramPercent === null ? (
                                        <Text size="xs" c="dimmed">
                                            Host VRAM is not directly attributable for this backend configuration yet, so this card
                                            is tracking exact residency and backend share instead.
                                        </Text>
                                    ) : (
                                        <TelemetryMeter
                                            label="Host VRAM pressure"
                                            value={card.hostVramPercent}
                                            hint={`${formatBytes(card.hostVramUsed)} live across mapped GPUs`}
                                        />
                                    )}

                                    <Stack gap={6}>
                                        <Group gap="xs">
                                            <IconServer size={14} />
                                            <Text size="xs" fw={600}>Resident on</Text>
                                        </Group>
                                        <div className="swarm-resource-hosts">
                                            {card.hosts.map((host) => (
                                                <div key={`${card.model.name}-${host.id}`} className="swarm-resource-host-pill">
                                                    <Text size="xs" fw={600} lineClamp={1}>
                                                        {host.title || `Backend ${host.id}`}
                                                    </Text>
                                                    <Text size="10px" c="dimmed" lineClamp={1}>
                                                        {host.time_since_used || host.status}
                                                    </Text>
                                                </div>
                                            ))}
                                        </div>
                                    </Stack>
                                </Stack>
                            </Card>
                        );
                    })}
                </SimpleGrid>
            ) : (
                <Card withBorder padding="lg" className="surface-glass swarm-resource-empty">
                    <Stack align="center" gap="xs">
                        <ThemeIcon variant="light" radius="xl" size="xl" color="gray">
                            <IconSparkles size={20} />
                        </ThemeIcon>
                        <Text fw={600}>No models are currently resident</Text>
                        <Text size="sm" c="dimmed" ta="center" maw={520}>
                            The live performance deck is ready. As soon as a backend keeps a model loaded, it will show up here
                            with its host share, mapped VRAM pressure, and an eject control.
                        </Text>
                    </Stack>
                </Card>
            )}
        </Stack>
    );
}
