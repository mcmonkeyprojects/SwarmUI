/**
 * Performance Dashboard
 * 
 * Development-only floating overlay for real-time performance metrics.
 * Shows memory usage, render counts, API timing, and store updates.
 */

import { useState, useEffect, useMemo } from 'react';
import {
    Paper,
    Text,
    Group,
    Stack,
    Badge,
    Progress,
    Tooltip,
    ScrollArea,
    Collapse,
    Divider,
    Tabs,
} from '@mantine/core';
import {
    IconX,
    IconChevronDown,
    IconChevronUp,
    IconDownload,
    IconTrash,
    IconActivity,
    IconCpu,
    IconDatabase,
    IconRefresh,
} from '@tabler/icons-react';
import { usePerformanceStore } from '../../stores/performanceStore';
import { profiler } from '../../utils/performanceProfiler';
import {
    getPerfDiagnosticsSnapshot,
    resetPerfDiagnostics,
    type PerfDiagnosticsSnapshot,
} from '../../utils/perfDiagnostics';
import { SwarmActionIcon as ActionIcon } from '../ui';

const isDev = import.meta.env.DEV;

interface MetricRowProps {
    name: string;
    value: string | number;
    subValue?: string;
    status?: 'good' | 'warning' | 'bad';
}

function MetricRow({ name, value, subValue, status = 'good' }: MetricRowProps) {
    const color = status === 'good' ? 'green' : status === 'warning' ? 'yellow' : 'red';
    return (
        <Group justify="space-between" gap="xs" wrap="nowrap">
            <Text size="xs" c="dimmed" style={{ flex: 1 }}>{name}</Text>
            <Group gap={4} wrap="nowrap">
                <Badge size="xs" color={color} variant="light">
                    {typeof value === 'number' ? value.toFixed(2) : value}
                </Badge>
                {subValue && <Text size="xs" c="dimmed">{subValue}</Text>}
            </Group>
        </Group>
    );
}

function MemorySection() {
    const { currentMemory, memorySnapshots, takeMemorySnapshot, refreshMemory } = usePerformanceStore();

    useEffect(() => {
        refreshMemory();
    }, [refreshMemory]);

    const status = useMemo(() => {
        if (!currentMemory) return 'good';
        if (currentMemory.percentUsed > 80) return 'bad';
        if (currentMemory.percentUsed > 60) return 'warning';
        return 'good';
    }, [currentMemory]) as 'good' | 'warning' | 'bad';

    return (
        <Stack gap="xs">
            <Group justify="space-between">
                <Text size="xs" fw={600}>Memory</Text>
                <Group gap={4}>
                    <Tooltip label="Refresh">
                        <ActionIcon size="xs" variant="subtle" onClick={refreshMemory}>
                            <IconRefresh size={12} />
                        </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Take Snapshot">
                        <ActionIcon size="xs" variant="subtle" onClick={() => takeMemorySnapshot()}>
                            <IconCpu size={12} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
            </Group>

            {currentMemory ? (
                <>
                    <Progress
                        value={currentMemory.percentUsed}
                        size="sm"
                        color={status === 'good' ? 'green' : status === 'warning' ? 'yellow' : 'red'}
                    />
                    <MetricRow
                        name="Heap Used"
                        value={`${currentMemory.usedMB.toFixed(1)} MB`}
                        subValue={`/ ${currentMemory.totalMB.toFixed(1)} MB`}
                        status={status}
                    />
                    <MetricRow
                        name="Usage"
                        value={`${currentMemory.percentUsed.toFixed(1)}%`}
                        status={status}
                    />
                </>
            ) : (
                <Text size="xs" c="dimmed">Memory API not available</Text>
            )}

            {memorySnapshots.length > 1 && (
                <Text size="xs" c="dimmed">
                    {memorySnapshots.length} snapshots taken
                </Text>
            )}
        </Stack>
    );
}

function RendersSection() {
    const renderMetrics = usePerformanceStore((state) => state.renderMetrics);

    const sortedRenders = useMemo(() => {
        return Array.from(renderMetrics.values())
            .sort((a, b) => b.renderCount - a.renderCount)
            .slice(0, 10);
    }, [renderMetrics]);

    return (
        <Stack gap="xs">
            <Text size="xs" fw={600}>Top Renders</Text>
            {sortedRenders.length === 0 ? (
                <Text size="xs" c="dimmed">No renders tracked yet</Text>
            ) : (
                <ScrollArea h={120}>
                    <Stack gap={2}>
                        {sortedRenders.map((r) => (
                            <MetricRow
                                key={r.component}
                                name={r.component}
                                value={r.renderCount}
                                subValue={`avg ${r.avgRenderTime.toFixed(1)}ms`}
                                status={r.avgRenderTime > 16 ? 'warning' : 'good'}
                            />
                        ))}
                    </Stack>
                </ScrollArea>
            )}
        </Stack>
    );
}

function APISection() {
    const allStats = useMemo(() => profiler.getAllStats(), []);

    const apiStats = useMemo(() => {
        return Object.entries(allStats)
            .filter(([name]) => name.startsWith('api:'))
            .map(([name, stats]) => ({
                name: name.replace('api:', ''),
                ...stats,
            }))
            .sort((a, b) => b.avg - a.avg)
            .slice(0, 10);
    }, [allStats]);

    return (
        <Stack gap="xs">
            <Text size="xs" fw={600}>API Calls</Text>
            {apiStats.length === 0 ? (
                <Text size="xs" c="dimmed">No API calls tracked yet</Text>
            ) : (
                <ScrollArea h={120}>
                    <Stack gap={2}>
                        {apiStats.map((s) => (
                            <MetricRow
                                key={s.name}
                                name={s.name}
                                value={`${s.avg.toFixed(0)}ms`}
                                subValue={`(${s.count} calls)`}
                                status={s.avg > 500 ? 'bad' : s.avg > 200 ? 'warning' : 'good'}
                            />
                        ))}
                    </Stack>
                </ScrollArea>
            )}
        </Stack>
    );
}

function StoresSection() {
    const allStats = useMemo(() => profiler.getAllStats(), []);

    const storeStats = useMemo(() => {
        return Object.entries(allStats)
            .filter(([name]) => name.startsWith('store:'))
            .map(([name, stats]) => ({
                name: name.replace('store:', ''),
                ...stats,
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
    }, [allStats]);

    return (
        <Stack gap="xs">
            <Text size="xs" fw={600}>Store Updates</Text>
            {storeStats.length === 0 ? (
                <Text size="xs" c="dimmed">No store updates tracked yet</Text>
            ) : (
                <ScrollArea h={120}>
                    <Stack gap={2}>
                        {storeStats.map((s) => (
                            <MetricRow
                                key={s.name}
                                name={s.name}
                                value={s.count}
                                subValue={`avg ${s.avg.toFixed(1)}ms`}
                                status={s.avg > 10 ? 'warning' : 'good'}
                            />
                        ))}
                    </Stack>
                </ScrollArea>
            )}
        </Stack>
    );
}

function RecentMetricsSection() {
    const recentMetrics = usePerformanceStore((state) => state.recentMetrics);

    const recent = useMemo(() => {
        return recentMetrics.slice(-20).reverse();
    }, [recentMetrics]);

    return (
        <Stack gap="xs">
            <Text size="xs" fw={600}>Recent ({recent.length})</Text>
            {recent.length === 0 ? (
                <Text size="xs" c="dimmed">No metrics yet</Text>
            ) : (
                <ScrollArea h={150}>
                    <Stack gap={2}>
                        {recent.map((m, i) => (
                            <Group key={i} justify="space-between" gap="xs" wrap="nowrap">
                                <Text size="xs" c="dimmed" lineClamp={1} style={{ flex: 1 }}>
                                    {m.name}
                                </Text>
                                <Badge
                                    size="xs"
                                    color={m.duration > 100 ? 'red' : m.duration > 50 ? 'yellow' : 'green'}
                                    variant="light"
                                >
                                    {m.duration.toFixed(1)}ms
                                </Badge>
                            </Group>
                        ))}
                    </Stack>
                </ScrollArea>
            )}
        </Stack>
    );
}

function DiagnosticsSection({
    snapshot,
    onReset,
}: {
    snapshot: PerfDiagnosticsSnapshot;
    onReset: () => void;
}) {
    const topApiEndpoints = useMemo(
        () =>
            Object.entries(snapshot.apiByEndpoint)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5),
        [snapshot.apiByEndpoint]
    );

    const topReconnectEndpoints = useMemo(
        () =>
            Object.entries(snapshot.reconnectByEndpoint)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5),
        [snapshot.reconnectByEndpoint]
    );

    return (
        <Stack gap="xs">
            <Group justify="space-between">
                <Text size="xs" fw={600}>Diagnostics</Text>
                <ActionIcon size="xs" variant="subtle" color="red" onClick={onReset}>
                    <IconTrash size={12} />
                </ActionIcon>
            </Group>

            <MetricRow name="API calls" value={snapshot.apiCallCount} status="good" />
            <MetricRow
                name="WS reconnects"
                value={snapshot.wsReconnectCount}
                status={snapshot.wsReconnectCount > 10 ? 'warning' : 'good'}
            />
            <MetricRow
                name="WS session recoveries"
                value={snapshot.wsSessionRecoveries}
                status={snapshot.wsSessionRecoveries > 0 ? 'warning' : 'good'}
            />
            <MetricRow
                name="Long tasks"
                value={snapshot.longTaskCount}
                subValue={snapshot.longTaskCount > 0 ? `max ${snapshot.longestLongTaskMs.toFixed(1)}ms` : undefined}
                status={snapshot.longTaskCount > 0 ? 'warning' : 'good'}
            />

            {topApiEndpoints.length > 0 && (
                <>
                    <Divider />
                    <Text size="xs" fw={600}>Top API Endpoints</Text>
                    <Stack gap={2}>
                        {topApiEndpoints.map(([endpoint, count]) => (
                            <MetricRow key={endpoint} name={endpoint} value={count} status="good" />
                        ))}
                    </Stack>
                </>
            )}

            {topReconnectEndpoints.length > 0 && (
                <>
                    <Divider />
                    <Text size="xs" fw={600}>Reconnect Endpoints</Text>
                    <Stack gap={2}>
                        {topReconnectEndpoints.map(([endpoint, count]) => (
                            <MetricRow
                                key={endpoint}
                                name={endpoint}
                                value={count}
                                status={count > 3 ? 'warning' : 'good'}
                            />
                        ))}
                    </Stack>
                </>
            )}
        </Stack>
    );
}

export function PerformanceDashboard() {
    if (!isDev) return null;

    const { isVisible, isMinimized, toggleVisible, toggleMinimized, exportAll, clear } = usePerformanceStore();
    const [activeTab, setActiveTab] = useState<string | null>('memory');
    const [diagnostics, setDiagnostics] = useState<PerfDiagnosticsSnapshot>(getPerfDiagnosticsSnapshot());

    // Handle keyboard shortcut to toggle
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ctrl/Cmd + Shift + P to toggle
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
                e.preventDefault();
                toggleVisible();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [toggleVisible]);

    useEffect(() => {
        const refresh = () => setDiagnostics(getPerfDiagnosticsSnapshot());
        refresh();
        const intervalId = setInterval(refresh, 1000);
        return () => clearInterval(intervalId);
    }, []);

    const handleResetDiagnostics = () => {
        resetPerfDiagnostics();
        setDiagnostics(getPerfDiagnosticsSnapshot());
    };

    const handleExport = () => {
        const data = exportAll();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `perf-metrics-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (!isVisible) {
        return (
            <Tooltip label="Performance Dashboard (Ctrl+Shift+P)">
                <ActionIcon
                    size="lg"
                    variant="filled"
                    color="dark"
                    radius="xl"
                    onClick={toggleVisible}
                    style={{
                        position: 'fixed',
                        bottom: 16,
                        right: 16,
                        zIndex: 9999,
                    }}
                >
                    <IconActivity size={18} />
                </ActionIcon>
            </Tooltip>
        );
    }

    return (
        <Paper
            shadow="lg"
            p="xs"
            radius="md"
            withBorder
            style={{
                position: 'fixed',
                bottom: 16,
                right: 16,
                width: isMinimized ? 200 : 320,
                zIndex: 9999,
                background: 'var(--theme-gray-7)',
                backdropFilter: 'blur(8px)',
            }}
        >
            {/* Header */}
            <Group justify="space-between">
                <Group gap={6}>
                    <IconActivity size={14} />
                    <Text size="xs" fw={600}>Performance</Text>
                </Group>
                <Group gap={2}>
                    <Tooltip label="Export JSON">
                        <ActionIcon size="xs" variant="subtle" onClick={handleExport}>
                            <IconDownload size={12} />
                        </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Clear Metrics">
                        <ActionIcon size="xs" variant="subtle" color="red" onClick={clear}>
                            <IconTrash size={12} />
                        </ActionIcon>
                    </Tooltip>
                    <ActionIcon size="xs" variant="subtle" onClick={toggleMinimized}>
                        {isMinimized ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />}
                    </ActionIcon>
                    <ActionIcon size="xs" variant="subtle" onClick={toggleVisible}>
                        <IconX size={12} />
                    </ActionIcon>
                </Group>
            </Group>

            <Collapse in={!isMinimized}>
                <Divider my="xs" />

                <Tabs value={activeTab} onChange={setActiveTab}>
                    <Tabs.List grow>
                        <Tabs.Tab value="memory" leftSection={<IconCpu size={12} />}>
                            <Text size="xs">Mem</Text>
                        </Tabs.Tab>
                        <Tabs.Tab value="renders" leftSection={<IconActivity size={12} />}>
                            <Text size="xs">Render</Text>
                        </Tabs.Tab>
                        <Tabs.Tab value="api" leftSection={<IconDatabase size={12} />}>
                            <Text size="xs">API</Text>
                        </Tabs.Tab>
                        <Tabs.Tab value="stores" leftSection={<IconDatabase size={12} />}>
                            <Text size="xs">Store</Text>
                        </Tabs.Tab>
                        <Tabs.Tab value="diag" leftSection={<IconActivity size={12} />}>
                            <Text size="xs">Diag</Text>
                        </Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="memory" pt="xs">
                        <MemorySection />
                    </Tabs.Panel>

                    <Tabs.Panel value="renders" pt="xs">
                        <RendersSection />
                    </Tabs.Panel>

                    <Tabs.Panel value="api" pt="xs">
                        <APISection />
                    </Tabs.Panel>

                    <Tabs.Panel value="stores" pt="xs">
                        <StoresSection />
                    </Tabs.Panel>

                    <Tabs.Panel value="diag" pt="xs">
                        <DiagnosticsSection snapshot={diagnostics} onReset={handleResetDiagnostics} />
                    </Tabs.Panel>
                </Tabs>

                <Divider my="xs" />
                <RecentMetricsSection />
            </Collapse>
        </Paper>
    );
}

export default PerformanceDashboard;

