import { useState, useEffect, useCallback, useRef } from 'react';
import {
    Stack,
    Group,
    Text,
    Checkbox,
    ScrollArea,
    Box,
    Loader,
    Center,
    Code,
} from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { swarmClient } from '../../api/client';
import type { LogType, LogMessage } from '../../api/types';
import { useSessionStore } from '../../stores/session';
import { SwarmActionIcon, SwarmButton } from '../../components/ui';

interface DisplayLogMessage extends LogMessage {
    type: string;
    color: string;
}

function getLogTypeIdentifier(type: LogType): string {
    return type.identifier || type.name;
}

export function LogsTab() {
    const isInitialized = useSessionStore((s) => s.isInitialized);
    const [logTypes, setLogTypes] = useState<LogType[]>([]);
    const [enabledTypes, setEnabledTypes] = useState<Set<string>>(new Set());
    const [messages, setMessages] = useState<DisplayLogMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [autoScroll, setAutoScroll] = useState(true);
    const [polling, setPolling] = useState(true);
    const lastSeqRef = useRef<Record<string, number>>({});
    const scrollRef = useRef<HTMLDivElement>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Load available log types
    const loadLogTypes = useCallback(async () => {
        if (!isInitialized) return;
        try {
            const types = await swarmClient.listLogTypes();
            setLogTypes(types);
            const allType = types.find(t => getLogTypeIdentifier(t) === 'All' || t.name === 'All');
            setEnabledTypes(allType ? new Set([getLogTypeIdentifier(allType)]) : new Set(types.map(getLogTypeIdentifier)));
        } catch {
            // Silently ignore
        }
    }, [isInitialized]);

    // Fetch log messages
    const fetchLogs = useCallback(async () => {
        if (!isInitialized || enabledTypes.size === 0) return;
        try {
            const typesArray = Array.from(enabledTypes);
            const response = await swarmClient.listRecentLogMessages(typesArray, lastSeqRef.current);
            if (response && response.data) {
                const newMessages: DisplayLogMessage[] = [];
                for (const [typeName, msgs] of Object.entries(response.data)) {
                    const logType = logTypes.find(t => getLogTypeIdentifier(t) === typeName || t.name === typeName);
                    for (const msg of msgs) {
                        newMessages.push({
                            ...msg,
                            type: logType?.name || typeName,
                            color: logType?.color || '#888',
                        });
                        // Track per-type sequence IDs
                        if (!lastSeqRef.current[typeName] || msg.sequence_id > lastSeqRef.current[typeName]) {
                            lastSeqRef.current[typeName] = msg.sequence_id;
                        }
                    }
                }
                if (newMessages.length > 0) {
                    // Sort by sequence_id
                    newMessages.sort((a, b) => a.sequence_id - b.sequence_id);
                    setMessages(prev => {
                        const combined = [...prev, ...newMessages];
                        // Keep last 2000 messages to prevent memory bloat
                        return combined.length > 2000 ? combined.slice(-2000) : combined;
                    });
                }
            }
        } catch {
            // Polling failure, silently continue
        }
    }, [isInitialized, enabledTypes, logTypes]);

    // Initial load
    useEffect(() => {
        if (isInitialized) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            loadLogTypes();
        }
    }, [isInitialized, loadLogTypes]);

    // Start polling after types are loaded
    useEffect(() => {
        if (logTypes.length === 0 || enabledTypes.size === 0) {
            return;
        }
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLoading(true);
        // Initial fetch
        fetchLogs().finally(() => setLoading(false));
    }, [logTypes, enabledTypes, fetchLogs]);

    // Polling interval
    useEffect(() => {
        if (polling && enabledTypes.size > 0 && logTypes.length > 0) {
            intervalRef.current = setInterval(fetchLogs, 2000);
            return () => {
                if (intervalRef.current) clearInterval(intervalRef.current);
            };
        }
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [polling, fetchLogs, enabledTypes.size, logTypes.length]);

    // Auto-scroll to bottom
    useEffect(() => {
        if (autoScroll && scrollRef.current) {
            const viewport = scrollRef.current.querySelector('[data-scrollable]') || scrollRef.current;
            viewport.scrollTop = viewport.scrollHeight;
        }
    }, [messages, autoScroll]);

    const toggleType = (identifier: string) => {
        setMessages([]);
        lastSeqRef.current = {};
        setEnabledTypes(prev => {
            const next = new Set(prev);
            if (next.has(identifier)) {
                next.delete(identifier);
            } else {
                if (identifier === 'All') {
                    next.clear();
                } else {
                    next.delete('All');
                }
                next.add(identifier);
            }
            return next;
        });
    };

    const handleClear = () => {
        setMessages([]);
        lastSeqRef.current = {};
    };

    return (
        <Stack gap="md" className="swarm-server-section">
            {/* Controls */}
            <Group justify="space-between" className="swarm-server-controls">
                <Group gap="md">
                    {logTypes.map(lt => (
                        <Checkbox
                            key={getLogTypeIdentifier(lt)}
                            label={
                                <Text
                                    size="xs"
                                    fw={600}
                                    style={{
                                        color: lt.color,
                                        background: `color-mix(in srgb, ${lt.color} 18%, var(--theme-gray-8))`,
                                        border: `1px solid color-mix(in srgb, ${lt.color} 42%, transparent)`,
                                        borderRadius: 999,
                                        padding: '2px 8px',
                                        lineHeight: 1.2,
                                    }}
                                >
                                    {lt.name}
                                </Text>
                            }
                            checked={enabledTypes.has(getLogTypeIdentifier(lt))}
                            onChange={() => toggleType(getLogTypeIdentifier(lt))}
                            size="xs"
                        />
                    ))}
                </Group>
                <Group gap="xs">
                    <Checkbox
                        label={<Text size="xs">Auto-scroll</Text>}
                        checked={autoScroll}
                        onChange={(e) => setAutoScroll(e.currentTarget.checked)}
                        size="xs"
                    />
                    <Checkbox
                        label={<Text size="xs">Live</Text>}
                        checked={polling}
                        onChange={(e) => setPolling(e.currentTarget.checked)}
                        size="xs"
                    />
                    <SwarmButton tone="secondary" emphasis="ghost" size="xs" onClick={handleClear}>
                        Clear
                    </SwarmButton>
                    <SwarmActionIcon
                        tone="secondary"
                        emphasis="soft"
                        label="Refresh logs"
                        onClick={fetchLogs}
                    >
                        <IconRefresh size={16} />
                    </SwarmActionIcon>
                </Group>
            </Group>

            {/* Log Output */}
            {loading ? (
                <Center h={400}><Loader size="lg" /></Center>
            ) : (
                <ScrollArea
                    h="min(calc(var(--app-content-height) - 230px), 820px)"
                    ref={scrollRef}
                    className="swarm-log-panel"
                    styles={{ viewport: { backgroundColor: '#111111' } }}
                >
                    <Box p="xs" style={{ fontFamily: 'monospace', fontSize: 12, backgroundColor: '#111111' }}>
                        {messages.length === 0 ? (
                            <Text c="dimmed" size="sm" ta="center" py="xl">
                                No log messages yet. Waiting for new entries...
                            </Text>
                        ) : (
                            messages.map((msg, i) => (
                                <Group key={`${msg.sequence_id}-${i}`} gap={8} wrap="nowrap" align="flex-start" mb={2} className="swarm-log-row">
                                    <Text size="xs" c="dimmed" style={{ flexShrink: 0, minWidth: 70 }}>
                                        {msg.time}
                                    </Text>
                                    <Text
                                        size="xs"
                                        style={{
                                            color: msg.color,
                                            flexShrink: 0,
                                            minWidth: 60,
                                            background: `color-mix(in srgb, ${msg.color} 16%, var(--theme-gray-8))`,
                                            border: `1px solid color-mix(in srgb, ${msg.color} 35%, transparent)`,
                                            borderRadius: 6,
                                            padding: '1px 6px',
                                        }}
                                        fw={600}
                                    >
                                        [{msg.type}]
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
                                        {msg.message}
                                    </Code>
                                </Group>
                            ))
                        )}
                    </Box>
                </ScrollArea>
            )}

            <Text size="xs" c="dimmed">
                {messages.length} message{messages.length !== 1 ? 's' : ''} displayed
            </Text>
        </Stack>
    );
}
