import { Stack, Text, Group, Card, ScrollArea, Badge, Tooltip } from '@mantine/core';
import { IconTrash, IconPlayerPlay, IconTemplate } from '@tabler/icons-react';
import { useHistoryStore } from '../stores/historyStore';
import type { HistoryEntry } from '../stores/historyStore';
import { notifications } from '@mantine/notifications';
import { SwarmActionIcon as ActionIcon, SwarmButton as Button } from './ui';
import { LazyImage } from './LazyImage';

interface HistoryPanelProps {
    onLoad: (entry: HistoryEntry) => void;
}

export function HistoryPanel({ onLoad }: HistoryPanelProps) {
    const { entries, removeEntry, clearHistory } = useHistoryStore();

    const handleLoad = (entry: HistoryEntry) => {
        onLoad(entry);
        notifications.show({
            title: 'Parameters Loaded',
            message: 'Generation parameters restored from history.',
            color: 'blue',
        });
    };

    if (entries.length === 0) {
        return (
            <Stack align="center" justify="center" h={300} gap="xs">
                <IconTemplate size={40} color="gray" style={{ opacity: 0.5 }} />
                <Text c="dimmed" size="sm">No generation history yet</Text>
            </Stack>
        );
    }

    return (
        <Stack h="100%" gap="md">
            <Group justify="space-between">
                <Text fw={700} size="sm">Generation History ({entries.length})</Text>
                <Button variant="subtle" color="red" size="xs" onClick={clearHistory} leftSection={<IconTrash size={14} />}>
                    Clear All
                </Button>
            </Group>

            <ScrollArea style={{ flex: 1 }} type="hover">
                <Stack gap="sm" pb="md">
                    {entries.map((entry) => (
                        <Card key={entry.id} withBorder padding="sm" radius="md" bg="var(--mantine-color-body)">
                            <Group align="flex-start" wrap="nowrap">
                                {/* Thumbnail */}
                                {entry.imagePaths && entry.imagePaths.length > 0 && (
                                    <LazyImage
                                        src={entry.imagePaths[0]}
                                        width={80}
                                        height={80}
                                        radius="sm"
                                        fit="cover"
                                        alt="Generation Result"
                                        rootMargin="50px"
                                    />
                                )}

                                {/* Info */}
                                <Stack gap={4} style={{ flex: 1, overflow: 'hidden' }}>
                                    <Text size="xs" c="dimmed" truncate>
                                        {new Date(entry.timestamp).toLocaleString()}
                                    </Text>
                                    <Tooltip label={entry.prompt} multiline w={220}>
                                        <Text size="sm" fw={500} lineClamp={2} style={{ lineHeight: 1.2 }}>
                                            {entry.prompt}
                                        </Text>
                                    </Tooltip>

                                    <Group gap={4} mt={4}>
                                        <Badge size="xs" variant="outline">{entry.model}</Badge>
                                        {entry.params.steps && <Badge size="xs" variant="dot">{entry.params.steps} steps</Badge>}
                                    </Group>
                                </Stack>
                            </Group>

                            {/* Actions */}
                            <Group gap="xs" mt="sm" justify="flex-end">
                                <Tooltip label="Delete Entry">
                                    <ActionIcon
                                        variant="light"
                                        color="red"
                                        size="sm"
                                        onClick={() => removeEntry(entry.id)}
                                    >
                                        <IconTrash size={14} />
                                    </ActionIcon>
                                </Tooltip>
                                <Button
                                    variant="light"
                                    size="xs"
                                    leftSection={<IconPlayerPlay size={14} />}
                                    onClick={() => handleLoad(entry)}
                                    fullWidth
                                    style={{ flex: 1 }}
                                >
                                    Load Parameters
                                </Button>
                            </Group>
                        </Card>
                    ))}
                </Stack>
            </ScrollArea>
        </Stack>
    );
}
