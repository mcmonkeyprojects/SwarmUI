import { useMemo, useState } from 'react';
import {
    Badge,
    Card,
    Group,
    Modal,
    ScrollArea,
    SegmentedControl,
    SimpleGrid,
    Stack,
    Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useAllModelData, useLoRAs } from '../hooks/useModels';
import { useGenerationStore, useModeToggles } from '../store/generationStore';
import { buildAssetCatalog, type AssetCatalogItem, type AssetCatalogKind } from '../features/assets/catalog';
import { useNavigationStore } from '../stores/navigationStore';
import { useCreativeWorkspaceStore } from '../stores/creativeWorkspaceStore';
import { SwarmButton, SwarmSearchInput } from './ui';

interface AssetCatalogModalProps {
    opened: boolean;
    onClose: () => void;
}

const KIND_OPTIONS: Array<{ value: AssetCatalogKind | 'all'; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'model', label: 'Models' },
    { value: 'lora', label: 'LoRAs' },
    { value: 'embedding', label: 'Embeddings' },
    { value: 'controlnet', label: 'ControlNet' },
    { value: 'upscaler', label: 'Upscalers' },
    { value: 'vae', label: 'VAEs' },
    { value: 'wildcard', label: 'Wildcards' },
];

export function AssetCatalogModal({ opened, onClose }: AssetCatalogModalProps) {
    const [query, setQuery] = useState('');
    const [kind, setKind] = useState<AssetCatalogKind | 'all'>('all');
    const { models, vaes, controlnets, upscalers, embeddings, wildcards } = useAllModelData();
    const loras = useLoRAs();
    const generationStore = useGenerationStore();
    const { enableControlNet, enableVideo } = useModeToggles();
    const navigate = useNavigationStore((state) => state.navigateToGenerate);
    const { activeProjectId, ensureActiveProject, createAssetPack } = useCreativeWorkspaceStore();

    const items = useMemo(() => buildAssetCatalog({
        models,
        loras: loras.data ?? [],
        vaes,
        controlnets,
        upscalers,
        embeddings,
        wildcards,
        context: {
            selectedModel: generationStore.params.model || '',
            enableControlNet,
            enableVideo,
        },
    }), [
        controlnets,
        embeddings,
        enableControlNet,
        enableVideo,
        generationStore.params.model,
        loras.data,
        models,
        upscalers,
        vaes,
        wildcards,
    ]);

    const filteredItems = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        return items.filter((item) => {
            if (kind !== 'all' && item.kind !== kind) {
                return false;
            }
            if (!normalizedQuery) {
                return true;
            }

            return (
                item.title.toLowerCase().includes(normalizedQuery)
                || item.name.toLowerCase().includes(normalizedQuery)
                || item.description?.toLowerCase().includes(normalizedQuery)
                || item.capabilities.some((capability) => capability.toLowerCase().includes(normalizedQuery))
            );
        });
    }, [items, kind, query]);

    const applyItem = (item: AssetCatalogItem) => {
        if (item.kind === 'model') {
            generationStore.setSelectedModel(item.name);
            generationStore.setParams({ model: item.name });
            navigate({ mode: 'guided' });
            notifications.show({
                title: 'Model Applied',
                message: `${item.title} is now the active base model.`,
                color: 'teal',
            });
            onClose();
            return;
        }

        navigate({ mode: 'advanced' });
        notifications.show({
            title: 'Asset Ready To Use',
            message: `${item.title} is available in the Generate workspace.`,
            color: 'blue',
        });
        onClose();
    };

    const saveAssetPack = (item: AssetCatalogItem) => {
        const projectId = activeProjectId ?? ensureActiveProject();
        createAssetPack({
            name: `${item.title} Pack`,
            description: item.compatibility.reason,
            projectId,
            items: [
                {
                    id: item.id,
                    kind: item.kind,
                    name: item.name,
                    title: item.title,
                    compatibilityNote: item.compatibility.reason,
                },
            ],
            recommendedParams: item.kind === 'model' ? { model: item.name } : {},
        });
        notifications.show({
            title: 'Asset Pack Saved',
            message: `${item.title} was saved to the active project.`,
            color: 'teal',
        });
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title="Asset Catalog"
            size="xl"
            centered
            overlayProps={{ backgroundOpacity: 0.45, blur: 8 }}
        >
            <Stack gap="md">
                <Text c="dimmed" size="sm">
                    Unified browser for models, LoRAs, embeddings, control nets, upscalers, VAEs, and wildcards.
                </Text>
                <Group grow align="end">
                    <SwarmSearchInput
                        value={query}
                        onChange={(event) => setQuery(event.currentTarget.value)}
                        placeholder="Search assets, capabilities, or notes..."
                        visual="glitch"
                    />
                    <SegmentedControl
                        value={kind}
                        onChange={(value) => setKind(value as AssetCatalogKind | 'all')}
                        data={KIND_OPTIONS}
                    />
                </Group>
                <ScrollArea.Autosize mah={520}>
                    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                        {filteredItems.map((item) => (
                            <Card key={item.id} withBorder radius="md" shadow="sm">
                                <Stack gap="sm">
                                    <Group justify="space-between" align="flex-start">
                                        <Stack gap={4}>
                                            <Text fw={700}>{item.title}</Text>
                                            <Text size="sm" c="dimmed">
                                                {item.description || item.name}
                                            </Text>
                                        </Stack>
                                        <Badge variant="light">{item.kind}</Badge>
                                    </Group>
                                    <Group gap="xs" wrap="wrap">
                                        <Badge color={item.compatibility.status === 'recommended' ? 'teal' : item.compatibility.status === 'ready' ? 'blue' : 'yellow'}>
                                            {item.compatibility.status} {item.compatibility.score}
                                        </Badge>
                                        {item.capabilities.slice(0, 3).map((capability) => (
                                            <Badge key={capability} variant="outline">
                                                {capability}
                                            </Badge>
                                        ))}
                                    </Group>
                                    <Text size="sm">
                                        {item.compatibility.reason}
                                    </Text>
                                    <Group justify="space-between">
                                        <Text size="xs" c="dimmed">
                                            {item.path || item.name}
                                        </Text>
                                        <SwarmButton
                                            size="xs"
                                            tone={item.compatibility.status === 'recommended' ? 'primary' : 'secondary'}
                                            emphasis={item.compatibility.status === 'recommended' ? 'solid' : 'soft'}
                                            onClick={() => applyItem(item)}
                                        >
                                            {item.kind === 'model' ? 'Use model' : 'Open generate'}
                                        </SwarmButton>
                                        <SwarmButton
                                            size="xs"
                                            tone="secondary"
                                            emphasis="ghost"
                                            onClick={() => saveAssetPack(item)}
                                        >
                                            Save pack
                                        </SwarmButton>
                                    </Group>
                                </Stack>
                            </Card>
                        ))}
                    </SimpleGrid>
                    {filteredItems.length === 0 ? (
                        <Stack py="xl" align="center">
                            <Text c="dimmed">No assets matched the current search.</Text>
                        </Stack>
                    ) : null}
                </ScrollArea.Autosize>
            </Stack>
        </Modal>
    );
}
