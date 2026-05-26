import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
    Stack,
    Group,
    Text,
    ScrollArea,
    Box,
    Code,
    Popover,
} from '@mantine/core';
import {
    IconDownload,
    IconTrash,
    IconPlayerPause,
    IconPlayerPlay,
} from '@tabler/icons-react';
import type { ClientLogLevel, ClientLogCategory } from '../../stores/clientLogStore';
import { useClientLogStore } from '../../stores/clientLogStore';
import { SwarmActionIcon, SwarmButton, SwarmCheckbox, SwarmSearchInput } from '../../components/ui';

const LEVEL_COLORS: Record<ClientLogLevel, string> = {
    debug: '#6b7280',
    info: '#e5e7eb',
    warn: '#f59e0b',
    error: '#ef4444',
};

const ALL_CATEGORIES: ClientLogCategory[] = [
    'generation',
    'api',
    'ws',
    'canvas',
    'model',
    'store',
    'ui',
    'system',
    'perf',
];

function formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString();
}

export function ClientLogsTab() {
    const entries = useClientLogStore((s) => s.entries);
    const paused = useClientLogStore((s) => s.paused);
    const setPaused = useClientLogStore((s) => s.setPaused);
    const exportAll = useClientLogStore((s) => s.exportAll);
    const clear = useClientLogStore((s) => s.clear);
    const getStats = useClientLogStore((s) => s.getStats);

    const [autoScroll, setAutoScroll] = useState(true);
    const [levelFilter, setLevelFilter] = useState<Set<ClientLogLevel>>(new Set(['debug', 'info', 'warn', 'error']));
    const [categoryFilter, setCategoryFilter] = useState<Set<ClientLogCategory>>(new Set(ALL_CATEGORIES));
    const [searchQuery, setSearchQuery] = useState('');
    const [exporting, setExporting] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    const filtered = useMemo(() => {
        return entries.filter((entry) => {
            if (!levelFilter.has(entry.level)) {
                return false;
            }
            if (!categoryFilter.has(entry.category)) {
                return false;
            }
            if (searchQuery && !entry.message.toLowerCase().includes(searchQuery.toLowerCase())) {
                return false;
            }
            return true;
        });
    }, [entries, levelFilter, categoryFilter, searchQuery]);

    const stats = getStats();

    useEffect(() => {
        if (autoScroll && scrollRef.current) {
            const viewport = scrollRef.current.querySelector('[data-scrollable]') || scrollRef.current;
            viewport.scrollTop = viewport.scrollHeight;
        }
    }, [filtered, autoScroll]);

    const toggleLevel = useCallback((level: ClientLogLevel) => {
        setLevelFilter((prev) => {
            const next = new Set(prev);
            if (next.has(level)) {
                next.delete(level);
            } else {
                next.add(level);
            }
            return next;
        });
    }, []);

    const toggleCategory = useCallback((cat: ClientLogCategory) => {
        setCategoryFilter((prev) => {
            const next = new Set(prev);
            if (next.has(cat)) {
                next.delete(cat);
            } else {
                next.add(cat);
            }
            return next;
        });
    }, []);

    const handleExport = useCallback(async () => {
        setExporting(true);
        try {
            const allEntries = await exportAll();
            const blob = new Blob([JSON.stringify(allEntries, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `swarmui-client-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
            link.click();
            URL.revokeObjectURL(url);
        } finally {
            setExporting(false);
        }
    }, [exportAll]);

    const handleClear = useCallback(async () => {
        await clear();
    }, [clear]);

    return (
        <Stack gap="md" className="swarm-server-section">
            <Stack gap="xs">
                <Group justify="space-between">
                    <Group gap="xs">
                        <Text size="xs" c="dimmed">
                            {filtered.length} of {stats.total} entries
                        </Text>
                        {stats.byLevel.error ? (
                            <Text size="xs" c="red" fw={600}>
                                {stats.byLevel.error} errors
                            </Text>
                        ) : null}
                        {stats.byLevel.warn ? (
                            <Text size="xs" style={{ color: '#f59e0b' }} fw={600}>
                                {stats.byLevel.warn} warnings
                            </Text>
                        ) : null}
                    </Group>
                    <Group gap="xs">
                        <SwarmButton
                            tone="secondary"
                            emphasis="ghost"
                            size="xs"
                            onClick={() => setPaused(!paused)}
                            leftSection={paused ? <IconPlayerPlay size={14} /> : <IconPlayerPause size={14} />}
                        >
                            {paused ? 'Resume' : 'Pause'}
                        </SwarmButton>
                        <SwarmButton
                            tone="secondary"
                            emphasis="ghost"
                            size="xs"
                            onClick={handleExport}
                            loading={exporting}
                            leftSection={<IconDownload size={14} />}
                        >
                            Export JSON
                        </SwarmButton>
                        <Popover position="bottom-end" shadow="md">
                            <Popover.Target>
                                <SwarmActionIcon tone="danger" emphasis="ghost" size="sm" label="Clear client logs">
                                    <IconTrash size={14} />
                                </SwarmActionIcon>
                            </Popover.Target>
                            <Popover.Dropdown>
                                <Stack gap="xs">
                                    <Text size="sm">Clear all client logs?</Text>
                                    <SwarmButton size="xs" tone="danger" emphasis="soft" onClick={handleClear}>
                                        Confirm Clear
                                    </SwarmButton>
                                </Stack>
                            </Popover.Dropdown>
                        </Popover>
                    </Group>
                </Group>

                <Group gap="xs">
                    <SwarmSearchInput
                        size="xs"
                        placeholder="Search messages..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.currentTarget.value)}
                        style={{ flex: 1, maxWidth: 320 }}
                        visual="quiet"
                    />
                    <SwarmCheckbox
                        size="xs"
                        label={<Text size="xs">Auto-scroll</Text>}
                        checked={autoScroll}
                        onChange={(e) => setAutoScroll(e.currentTarget.checked)}
                        visual="material"
                    />
                </Group>

                <Group gap={4} wrap="wrap">
                    <Text size="xs" c="dimmed" mr={4}>
                        Level:
                    </Text>
                    {(['error', 'warn', 'info', 'debug'] as ClientLogLevel[]).map((level) => (
                        <SwarmCheckbox
                            key={level}
                            size="xs"
                            label={
                                <Text
                                    size="xs"
                                    fw={600}
                                    style={{
                                        color: LEVEL_COLORS[level],
                                        background: `color-mix(in srgb, ${LEVEL_COLORS[level]} 18%, var(--theme-gray-8))`,
                                        border: `1px solid color-mix(in srgb, ${LEVEL_COLORS[level]} 42%, transparent)`,
                                        borderRadius: 999,
                                        padding: '1px 6px',
                                        lineHeight: 1.2,
                                    }}
                                >
                                    {level}
                                </Text>
                            }
                            checked={levelFilter.has(level)}
                            onChange={() => toggleLevel(level)}
                            visual="material"
                        />
                    ))}
                </Group>

                <Group gap={4} wrap="wrap">
                    <Text size="xs" c="dimmed" mr={4}>
                        Category:
                    </Text>
                    {ALL_CATEGORIES.map((cat) => (
                        <SwarmCheckbox
                            key={cat}
                            size="xs"
                            label={
                                <Text
                                    size="xs"
                                    fw={600}
                                    style={{
                                        borderRadius: 999,
                                        padding: '1px 6px',
                                        lineHeight: 1.2,
                                        background: 'var(--theme-gray-7)',
                                        border: '1px solid var(--theme-gray-5)',
                                    }}
                                >
                                    {cat}
                                </Text>
                            }
                            checked={categoryFilter.has(cat)}
                            onChange={() => toggleCategory(cat)}
                            visual="material"
                        />
                    ))}
                </Group>
            </Stack>

            <ScrollArea
                h="min(calc(var(--app-content-height) - 280px), 820px)"
                ref={scrollRef}
                className="swarm-log-panel"
                styles={{ viewport: { backgroundColor: '#111111' } }}
            >
                <Box p="xs" style={{ fontFamily: 'monospace', fontSize: 12, backgroundColor: '#111111' }}>
                    {filtered.length === 0 ? (
                        <Text c="dimmed" size="sm" ta="center" py="xl">
                            {entries.length === 0
                                ? 'No client log entries yet. Logging will appear here as you use the app.'
                                : 'No entries match the current filters.'}
                        </Text>
                    ) : (
                        filtered.map((entry) => (
                            <Group
                                key={entry.id}
                                gap={8}
                                wrap="nowrap"
                                align="flex-start"
                                mb={1}
                                className="swarm-log-row"
                                style={{
                                    opacity: entry.level === 'debug' ? 0.7 : 1,
                                }}
                            >
                                <Text
                                    size="xs"
                                    c="dimmed"
                                    style={{ flexShrink: 0, minWidth: 75 }}
                                >
                                    {formatTime(entry.timestamp)}
                                </Text>
                                <Text
                                    size="xs"
                                    style={{
                                        color: LEVEL_COLORS[entry.level],
                                        flexShrink: 0,
                                        minWidth: 38,
                                        textAlign: 'center',
                                        fontWeight: 700,
                                        textTransform: 'uppercase',
                                        fontSize: 10,
                                    }}
                                >
                                    {entry.level}
                                </Text>
                                <Text
                                    size="xs"
                                    style={{
                                        flexShrink: 0,
                                        minWidth: 56,
                                        background: 'var(--theme-gray-7)',
                                        borderRadius: 6,
                                        padding: '1px 5px',
                                        fontSize: 10,
                                        color: 'var(--theme-text-secondary)',
                                    }}
                                >
                                    {entry.category}
                                </Text>
                                <Code
                                    style={{
                                        background: 'transparent',
                                        padding: 0,
                                        fontSize: 12,
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word',
                                        flex: 1,
                                        color: 'var(--theme-text-secondary)',
                                    }}
                                >
                                    {entry.message}
                                </Code>
                            </Group>
                        ))
                    )}
                </Box>
            </ScrollArea>
        </Stack>
    );
}
