import { useMemo, useState } from 'react';
import {
    ActionIcon,
    Badge,
    Box,
    Group,
    Modal,
    ScrollArea,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import {
    IconArrowRight,
    IconBoxMultiple,
    IconHistory,
    IconPhoto,
    IconPrompt,
    IconSearch,
    IconSparkles,
} from '@tabler/icons-react';
import { useModels } from '../hooks/useModels';
import { useSortedFavorites } from '../hooks/useEntities';
import { usePromptCacheStore } from '../stores/promptCacheStore';
import { useGenerationStore } from '../store/generationStore';
import { useNavigationStore, type GenerateWorkspaceMode } from '../stores/navigationStore';

export interface CommandItem {
    id: string;
    title: string;
    subtitle?: string;
    group: 'Navigate' | 'Generate' | 'Models' | 'Prompts' | 'Images';
    keywords: string[];
    action: () => void;
}

interface CommandPaletteProps {
    opened: boolean;
    onClose: () => void;
    onOpenAssetCatalog: () => void;
}

const GENERATE_MODES: Array<{ value: GenerateWorkspaceMode; label: string; subtitle: string }> = [
    { value: 'quick', label: 'Quick Generate', subtitle: 'Minimal setup with fast-start defaults.' },
    { value: 'guided', label: 'Guided Generate', subtitle: 'Balanced path for most sessions.' },
    { value: 'advanced', label: 'Advanced Workspace', subtitle: 'Full studio layout with all tools.' },
];

export function CommandPalette({ opened, onClose, onOpenAssetCatalog }: CommandPaletteProps) {
    const navigate = useNavigationStore((state) => state.navigate);
    const models = useModels();
    const promptEntryMap = usePromptCacheStore((state) => state.entries);
    const favorites = useSortedFavorites();
    const [query, setQuery] = useState('');
    const promptEntries = useMemo(() => Object.values(promptEntryMap), [promptEntryMap]);

    const items = useMemo<CommandItem[]>(() => {
        const pageItems: CommandItem[] = [
            {
                id: 'nav-generate',
                title: 'Open Generate',
                subtitle: 'Jump to the main generation workspace.',
                group: 'Navigate',
                keywords: ['generate', 'workspace', 'studio'],
                action: () => navigate({ page: 'generate' }),
            },
            {
                id: 'nav-history',
                title: 'Open History',
                subtitle: 'Review prior generations and assets.',
                group: 'Navigate',
                keywords: ['history', 'gallery', 'images'],
                action: () => navigate({ page: 'history' }),
            },
            {
                id: 'nav-queue',
                title: 'Open Queue',
                subtitle: 'Review queued jobs and batches.',
                group: 'Navigate',
                keywords: ['queue', 'jobs', 'batches'],
                action: () => navigate({ page: 'queue' }),
            },
            {
                id: 'nav-workflows',
                title: 'Open Workflows',
                subtitle: 'Switch between guided and ComfyUI workspaces.',
                group: 'Navigate',
                keywords: ['workflow', 'wizard', 'comfy'],
                action: () => navigate({ page: 'workflows' }),
            },
            {
                id: 'nav-assets',
                title: 'Open Asset Catalog',
                subtitle: 'Search models, LoRAs, embeddings, and more.',
                group: 'Navigate',
                keywords: ['assets', 'catalog', 'models', 'lora', 'embedding'],
                action: () => onOpenAssetCatalog(),
            },
        ];

        const modeItems: CommandItem[] = GENERATE_MODES.map((mode) => ({
            id: `mode-${mode.value}`,
            title: mode.label,
            subtitle: mode.subtitle,
            group: 'Generate',
            keywords: ['generate', mode.value, 'mode'],
            action: () => navigate({
                page: 'generate',
                generate: {
                    mode: mode.value,
                },
            }),
        }));

        const modelItems: CommandItem[] = (models.data ?? []).slice(0, 24).map((model) => ({
            id: `model-${model.name}`,
            title: `Use model: ${model.title || model.name}`,
            subtitle: model.architecture ? `Architecture: ${model.architecture}` : 'Load and switch model.',
            group: 'Models',
            keywords: ['model', model.name, model.title || '', model.architecture ? String(model.architecture) : ''],
            action: () => {
                const generationStore = useGenerationStore.getState();
                generationStore.setSelectedModel(model.name);
                generationStore.setParams({ model: model.name });
                navigate({
                    page: 'generate',
                    generate: {
                        mode: 'guided',
                    },
                });
            },
        }));

        const promptItems: CommandItem[] = promptEntries
            .sort((left, right) => right.timestamp - left.timestamp)
            .slice(0, 12)
            .map((entry) => ({
                id: `prompt-${entry.hash}`,
                title: entry.prompt.length > 72 ? `${entry.prompt.slice(0, 72)}...` : entry.prompt,
                subtitle: entry.model || 'Reuse recent prompt',
                group: 'Prompts',
                keywords: ['prompt', entry.prompt, entry.model],
                action: () => {
                    const generationStore = useGenerationStore.getState();
                    generationStore.setParams({
                        prompt: entry.prompt,
                        negativeprompt: entry.negativePrompt || '',
                        model: entry.model,
                    });
                    generationStore.setSelectedModel(entry.model);
                    navigate({ page: 'generate' });
                },
            }));

        const imageItems: CommandItem[] = favorites
            .slice(0, 12)
            .map((image) => ({
                id: `favorite-${image.id}`,
                title: image.prompt?.slice(0, 72) || image.id.split('/').pop() || 'Open favorite image',
                subtitle: image.model || image.id,
                group: 'Images',
                keywords: ['image', 'favorite', image.id, image.model || '', image.prompt || ''],
                action: () => navigate({
                    page: 'history',
                    history: {
                        image: image.id,
                    },
                }),
            }));

        return [...pageItems, ...modeItems, ...modelItems, ...promptItems, ...imageItems];
    }, [favorites, models.data, navigate, onOpenAssetCatalog, promptEntries]);

    const filteredItems = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) {
            return items;
        }

        return items.filter((item) => (
            item.title.toLowerCase().includes(normalizedQuery)
            || item.subtitle?.toLowerCase().includes(normalizedQuery)
            || item.keywords.some((keyword) => keyword.toLowerCase().includes(normalizedQuery))
        ));
    }, [items, query]);

    const groupedItems = useMemo(() => {
        const groups = new Map<CommandItem['group'], CommandItem[]>();
        for (const item of filteredItems) {
            const existing = groups.get(item.group) ?? [];
            existing.push(item);
            groups.set(item.group, existing);
        }
        return groups;
    }, [filteredItems]);

    const handleRunItem = (item: CommandItem) => {
        item.action();
        onClose();
        setQuery('');
    };

    return (
        <Modal
            opened={opened}
            onClose={() => {
                setQuery('');
                onClose();
            }}
            title="Command Palette"
            size="lg"
            centered
            overlayProps={{ backgroundOpacity: 0.45, blur: 8 }}
        >
            <Stack gap="md">
                <TextInput
                    autoFocus
                    value={query}
                    onChange={(event) => setQuery(event.currentTarget.value)}
                    leftSection={<IconSearch size={16} />}
                    placeholder="Search pages, models, prompts, and images..."
                />
                <ScrollArea.Autosize mah={460}>
                    <Stack gap="lg">
                        {filteredItems.length === 0 ? (
                            <Box py="xl">
                                <Text ta="center" c="dimmed">
                                    No matching commands yet.
                                </Text>
                            </Box>
                        ) : (
                            Array.from(groupedItems.entries()).map(([group, groupItems]) => (
                                <Stack key={group} gap="xs">
                                    <Group justify="space-between">
                                        <Text size="xs" fw={700} tt="uppercase" c="dimmed">
                                            {group}
                                        </Text>
                                        <Badge variant="light">{groupItems.length}</Badge>
                                    </Group>
                                    {groupItems.map((item) => (
                                        <Box
                                            key={item.id}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => handleRunItem(item)}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter' || event.key === ' ') {
                                                    event.preventDefault();
                                                    handleRunItem(item);
                                                }
                                            }}
                                            style={{
                                                border: '1px solid var(--theme-gray-6)',
                                                borderRadius: 12,
                                                padding: '12px 14px',
                                                cursor: 'pointer',
                                                background: 'color-mix(in srgb, var(--theme-gray-8) 80%, transparent)',
                                            }}
                                        >
                                            <Group justify="space-between" wrap="nowrap" align="flex-start">
                                                <Stack gap={2}>
                                                    <Text fw={600}>{item.title}</Text>
                                                    {item.subtitle ? (
                                                        <Text size="sm" c="dimmed">
                                                            {item.subtitle}
                                                        </Text>
                                                    ) : null}
                                                </Stack>
                                                <ActionIcon variant="subtle" aria-label={`Run ${item.title}`}>
                                                    {group === 'Navigate' ? <IconArrowRight size={16} /> : null}
                                                    {group === 'Generate' ? <IconSparkles size={16} /> : null}
                                                    {group === 'Models' ? <IconBoxMultiple size={16} /> : null}
                                                    {group === 'Prompts' ? <IconPrompt size={16} /> : null}
                                                    {group === 'Images' ? <IconPhoto size={16} /> : null}
                                                    {group === 'Navigate' && item.id === 'nav-history' ? <IconHistory size={16} /> : null}
                                                </ActionIcon>
                                            </Group>
                                        </Box>
                                    ))}
                                </Stack>
                            ))
                        )}
                    </Stack>
                </ScrollArea.Autosize>
            </Stack>
        </Modal>
    );
}
