import { useState, useEffect, useMemo, useCallback, type MouseEvent } from 'react';
import { useDebounce } from '../hooks/useDebounce';
import { logger } from '../utils/logger';
import { Z_INDEX } from '../utils/zIndex';
import {
    Stack,
    Group,
    Text,
    TextInput,
    Card,
    NumberInput,
    Loader,
    Center,
    Divider,
    Box,
    Collapse,
    Tooltip,
    Menu,
    Modal,
    Badge,
} from '@mantine/core';
import { FloatingWindow } from './FloatingWindow';
import {
    IconSearch,
    IconCheck,
    IconLayoutGrid,
    IconLayoutList,
    IconPhoto,
    IconChevronDown,
    IconChevronUp,
    IconRefresh,
    IconX,
    IconFolder,
    IconDotsVertical,
    IconEye,
    IconEdit,
    IconTrash,
    IconStar,
    IconStarFilled,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useQuery } from '@tanstack/react-query';
import { swarmClient } from '../api/client';
import type { Model } from '../api/types';
import { LazyImage } from './LazyImage';
import { ModelDetailModal } from './ModelDetailModal';
import { HeadlessCombobox } from './headless/HeadlessCombobox';
import { SwarmActionIcon, SwarmBadge, SwarmButton, SwarmSegmentedControl } from './ui';
import { VirtualGrid } from './VirtualGrid';
import {
    BROWSER_THUMBNAIL_SIZES,
    BROWSER_THUMBNAIL_SIZE_OPTIONS,
    DEFAULT_THUMBNAIL_SIZE,
    type ThumbnailSize,
} from './browserThumbnailSizes';
import { featureFlags } from '../config/featureFlags';
import { useWorkerFilter } from '../hooks/useWorker';
import { useBackendStarredModels } from '../hooks/useBackendBootstrap';
import { queryClient, queryKeys } from '../api/queryClient';
import { useDebugTrace } from '../utils/debugTrace';

interface ModelBrowserProps {
    opened: boolean;
    onClose: () => void;
    selectedModel: string;
    onModelSelect: (modelName: string) => void;
    onClearModel?: () => void; // Optional callback to clear the current model
}

type ViewMode = 'cards' | 'list' | 'icons';

const MODEL_SEARCH_FIELDS: (keyof Model)[] = ['name', 'title', 'description', 'architecture'];
const MODEL_BROWSER_VIEW_MODE_OPTIONS = [
    {
        value: 'cards',
        label: (
            <Center style={{ gap: 6 }}>
                <IconLayoutGrid size={16} />
                <span>Cards</span>
            </Center>
        ),
    },
    {
        value: 'list',
        label: (
            <Center style={{ gap: 6 }}>
                <IconLayoutList size={16} />
                <span>List</span>
            </Center>
        ),
    },
    {
        value: 'icons',
        label: (
            <Center style={{ gap: 6 }}>
                <IconPhoto size={16} />
                <span>Icons</span>
            </Center>
        ),
    },
] as const;

function setsEqual<T>(left: Set<T>, right: Set<T>): boolean {
    if (left.size !== right.size) {
        return false;
    }
    for (const value of left) {
        if (!right.has(value)) {
            return false;
        }
    }
    return true;
}

export function ModelBrowser({ opened, onClose, selectedModel, onModelSelect, onClearModel }: ModelBrowserProps) {
    const starredModelsQuery = useBackendStarredModels('Stable-Diffusion', { enabled: opened });
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearch = useDebounce(searchQuery, 200);
    const [viewMode, setViewMode] = useState<ViewMode>('cards');
    const [folderDepth, setFolderDepth] = useState<number>(1);
    const [selectedFolder, setSelectedFolder] = useState<string>('all');
    const [expandedModel, setExpandedModel] = useState<string | null>(null);
    const [thumbnailSize, setThumbnailSize] = useState<ThumbnailSize>(DEFAULT_THUMBNAIL_SIZE);

    // Model actions state
    const [detailModelName, setDetailModelName] = useState('');
    const [detailModalOpen, setDetailModalOpen] = useState(false);
    const [renameModelName, setRenameModelName] = useState('');
    const [renameValue, setRenameValue] = useState('');
    const [renameModalOpen, setRenameModalOpen] = useState(false);
    const [renameLoading, setRenameLoading] = useState(false);
    const [deleteModelName, setDeleteModelName] = useState('');
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [loadedModelNames, setLoadedModelNames] = useState<Set<string>>(new Set());
    const [starredModels, setStarredModels] = useState<Set<string>>(new Set());
    const modelsQuery = useQuery({
        queryKey: queryKeys.models.browser('', 'Stable-Diffusion'),
        queryFn: () => swarmClient.listModelsWithFolders(),
        staleTime: 5 * 60 * 1000,
        enabled: opened,
    });
    const loadedModelsQuery = useQuery({
        queryKey: queryKeys.models.loaded(),
        queryFn: () => swarmClient.listLoadedModels(),
        staleTime: 30 * 1000,
        enabled: opened,
    });
    const models = modelsQuery.data?.files ?? [];
    const apiFolders = modelsQuery.data?.folders ?? [];
    const loading = opened && modelsQuery.isLoading && !modelsQuery.data;

    const sanitizeModelSnippet = (input?: string): string => {
        if (!input) return '';
        return input
            .replace(/<\/?[^>]+(>|$)/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    };

    const getModelTags = (model: Model): string[] => {
        const raw = model.tags;
        if (Array.isArray(raw)) {
            return raw.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0);
        }
        if (typeof raw === 'string' && raw.trim()) {
            return raw
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean);
        }
        return [];
    };

    const renderModelTags = (model: Model, size: 'xs' | 'sm' = 'xs') => {
        const tags = getModelTags(model);
        if (tags.length === 0) {
            return null;
        }
        return (
            <Group gap={4} style={{ maxWidth: '100%' }}>
                {tags.slice(0, 8).map((tag) => (
                    <Badge
                        key={`${model.name}-${tag}`}
                        size={size}
                        variant="outline"
                        style={{
                            maxWidth: 180,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                        title={tag}
                    >
                        {tag}
                    </Badge>
                ))}
            </Group>
        );
    };

    // Toggle expanded model in list view
    const toggleExpandModel = (name: string) => {
        setExpandedModel((prev: string | null) => prev === name ? null : name);
    };

    const loadModels = async () => {
        try {
            const result = await modelsQuery.refetch();
            if (result.data?.files && result.data.files.length > 0) {
                logger.debug('[ModelBrowser] Total models:', result.data.files.length);
            }
            if (result.data?.folders && result.data.folders.length > 0) {
                logger.debug('[ModelBrowser] API folders:', result.data.folders.length);
            }
        } catch (error) {
            console.error('Failed to load Models:', error);
            notifications.show({
                title: 'Error',
                message: 'Failed to load Model list',
                color: 'red',
            });
        }
    };

    useEffect(() => {
        if (!loadedModelsQuery.data) {
            return;
        }
        const nextLoadedModelNames = new Set(loadedModelsQuery.data.map((model) => model.name));
        setLoadedModelNames((current) => setsEqual(current, nextLoadedModelNames) ? current : nextLoadedModelNames);
    }, [loadedModelsQuery.data]);

    useEffect(() => {
        if (!opened || !starredModelsQuery.data) {
            return;
        }
        const nextStarredModels = new Set(starredModelsQuery.data);
        setStarredModels((current) => setsEqual(current, nextStarredModels) ? current : nextStarredModels);
    }, [opened, starredModelsQuery.data]);

    const handleToggleStar = async (modelName: string) => {
        const newStarred = new Set(starredModels);
        if (newStarred.has(modelName)) {
            newStarred.delete(modelName);
        } else {
            newStarred.add(modelName);
        }
        setStarredModels(newStarred);
        try {
            await swarmClient.setStarredModels({ 'Stable-Diffusion': Array.from(newStarred) });
        } catch {
            // Revert on failure
            setStarredModels(starredModels);
            notifications.show({ title: 'Error', message: 'Failed to update starred models', color: 'red' });
        }
    };

    // Model action handlers
    const handleViewDetails = (modelName: string) => {
        setDetailModelName(modelName);
        setDetailModalOpen(true);
    };

    const handleOpenRename = (modelName: string) => {
        setRenameModelName(modelName);
        // Extract just the filename without extension for the rename value
        const parts = modelName.split('/');
        const filename = parts[parts.length - 1];
        setRenameValue(filename);
        setRenameModalOpen(true);
    };

    const handleRenameSubmit = async () => {
        if (!renameModelName || !renameValue.trim()) return;
        setRenameLoading(true);
        try {
            // Preserve the folder path, only rename the file part
            const folder = renameModelName.includes('/')
                ? renameModelName.substring(0, renameModelName.lastIndexOf('/') + 1)
                : '';
            const newName = folder + renameValue.trim();
            const response = await swarmClient.renameModel(renameModelName, newName);
            if (response.error) {
                notifications.show({ title: 'Rename Failed', message: response.error, color: 'red' });
            } else {
                notifications.show({ title: 'Renamed', message: `Model renamed to "${renameValue.trim()}"`, color: 'green' });
                setRenameModalOpen(false);
                queryClient.invalidateQueries({ queryKey: queryKeys.models.browser('', 'Stable-Diffusion') });
                queryClient.invalidateQueries({ queryKey: queryKeys.models.loaded() });
                await loadModels();
            }
        } catch {
            notifications.show({ title: 'Error', message: 'Failed to rename model', color: 'red' });
        } finally {
            setRenameLoading(false);
        }
    };

    const handleOpenDelete = (modelName: string) => {
        setDeleteModelName(modelName);
        setDeleteConfirmOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (!deleteModelName) return;
        setDeleteLoading(true);
        try {
            const response = await swarmClient.deleteModel(deleteModelName);
            if (response.error) {
                notifications.show({ title: 'Delete Failed', message: response.error, color: 'red' });
            } else {
                notifications.show({ title: 'Deleted', message: `Model "${deleteModelName}" deleted`, color: 'green' });
                setDeleteConfirmOpen(false);
                queryClient.invalidateQueries({ queryKey: queryKeys.models.browser('', 'Stable-Diffusion') });
                queryClient.invalidateQueries({ queryKey: queryKeys.models.loaded() });
                await loadModels();
            }
        } catch {
            notifications.show({ title: 'Error', message: 'Failed to delete model', color: 'red' });
        } finally {
            setDeleteLoading(false);
        }
    };

    const normalizePath = useCallback((path: string): string => path.replace(/\\/g, '/'), []);

    const getFolder = useCallback((path: string) => {
        const parts = normalizePath(path).split('/');
        if (parts.length > 1) {
            return parts.slice(0, -1).join('/');
        }
        return '';
    }, [normalizePath]);

    // folder selector - merge API-returned physical folders with model-path-derived folders
    const folders = Array.from(
        new Set([
            ...apiFolders.map((f: string) => normalizePath(f).replace(/^\/+|\/+$/g, '')),
            ...models.map((m: Model) => getFolder(m.name)),
        ])
    )
        .filter(Boolean)
        .sort();

    // Build hierarchical folder options with indentation and model counts
    const folderOptions: { value: string; label: string }[] = (() => {
        const countMap = new Map<string, number>();
        for (const model of models) {
            const modelFolder = getFolder(normalizePath(model.name));
            if (!modelFolder) continue;
            // Count model in this folder and all parent folders
            const segments = modelFolder.split('/').filter(Boolean);
            for (let i = 1; i <= segments.length; i++) {
                const prefix = segments.slice(0, i).join('/');
                countMap.set(prefix, (countMap.get(prefix) || 0) + (i === segments.length ? 1 : 0));
            }
        }
        // Count including subfolders
        const totalCountMap = new Map<string, number>();
        for (const folder of folders) {
            let total = 0;
            for (const model of models) {
                const mf = getFolder(normalizePath(model.name));
                if (mf === folder || mf.startsWith(folder + '/')) total++;
            }
            totalCountMap.set(folder as string, total);
        }
        const options: { value: string; label: string }[] = [{ value: 'all', label: `Root folder (${models.length})` }];
        for (const f of folders) {
            const depth = (f as string).split('/').filter(Boolean).length;
            const indent = depth > 1 ? '  '.repeat(depth - 1) + '└ ' : '';
            const count = totalCountMap.get(f as string) || 0;
            options.push({ value: f as string, label: `${indent}${(f as string).split('/').pop()} (${count})` });
        }
        return options;
    })();

    const { result: searchFilteredModels } = useWorkerFilter<Model>(
        models,
        debouncedSearch,
        MODEL_SEARCH_FIELDS
    );

    // Memoize folder/depth filtering for performance
    const filteredModels = useMemo(() => {
        return searchFilteredModels.filter((model: Model) => {
            const normalizedModelPath = normalizePath(model.name);

            const modelFolder = getFolder(normalizedModelPath);
            const matchesFolder =
                selectedFolder === 'all' ||
                modelFolder === selectedFolder ||
                modelFolder.startsWith(selectedFolder + '/');

            let relativeDepth = 0;
            if (selectedFolder === 'all') {
                relativeDepth = modelFolder ? modelFolder.split('/').filter(Boolean).length : 0;
            } else if (matchesFolder) {
                const selectedDepth = selectedFolder.split('/').filter(Boolean).length;
                const itemDepth = modelFolder ? modelFolder.split('/').filter(Boolean).length : 0;
                relativeDepth = Math.max(0, itemDepth - selectedDepth);
            }
            const matchesFolderDepth = relativeDepth < folderDepth;

            return matchesFolder && matchesFolderDepth;
        });
    }, [searchFilteredModels, selectedFolder, folderDepth, getFolder, normalizePath]);

    useDebugTrace('ModelBrowser', {
        opened,
        loading,
        modelsCount: models.length,
        apiFoldersCount: apiFolders.length,
        searchQuery,
        debouncedSearch,
        viewMode,
        folderDepth,
        selectedFolder,
        thumbnailSize,
        filteredModelsCount: filteredModels.length,
        loadedModelNamesCount: loadedModelNames.size,
        starredModelsCount: starredModels.size,
        detailModalOpen,
        renameModalOpen,
        deleteConfirmOpen,
    });

    const handleSelectModel = (modelName: string) => {
        onModelSelect(modelName);
        onClose();
        notifications.show({
            title: 'Model Selected',
            message: `Selected "${modelName}"`,
            color: 'blue',
        });
    };

    // Render Model Card (Cards View)
    const renderModelCard = (model: Model) => {
        const isSelected = selectedModel === model.name;
        // preview_image can be: base64 data URL, a path like "viewspecial/...", or undefined
        const rawPreview = (model.preview_image || model.preview) as string | undefined;
        // If it starts with 'data:' it's already a data URL
        // Otherwise, construct URL: replace 'viewspecial' with '/View' for Vite proxy
        let previewUrl: string | null = null;
        if (rawPreview) {
            if (rawPreview.startsWith('data:')) {
                previewUrl = rawPreview;
            } else if (rawPreview.startsWith('viewspecial/')) {
                // API returns 'viewspecial/Type/path' - convert to '/View/Type/path'
                previewUrl = rawPreview.replace('viewspecial/', '/View/');
            } else if (rawPreview.startsWith('/')) {
                previewUrl = rawPreview;
            } else {
                previewUrl = `/View/${rawPreview}`;
            }
        }
        const folder = getFolder(model.name);

        return (
            <Card
                key={model.name}
                withBorder
                padding="md"
                className="swarm-selectable-card"
                data-selected={isSelected ? 'true' : undefined}
                style={{
                    cursor: 'pointer',
                    borderColor: isSelected ? 'var(--theme-selected-border)' : undefined,
                    borderWidth: isSelected ? 2 : 1,
                }}
                onClick={() => handleSelectModel(model.name)}
            >
                <Stack gap="xs">
                    {/* Preview Image */}
                    {previewUrl && (
                        <Box
                            style={{
                                height: BROWSER_THUMBNAIL_SIZES[thumbnailSize].card,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: 'var(--theme-surface-input)',
                                borderRadius: 4,
                                overflow: 'hidden',
                            }}
                        >
                            <LazyImage
                                src={previewUrl}
                                alt={model.title || model.name}
                                fit="contain"
                                height="100%"
                                width="100%"
                                rootMargin="100px"
                            />
                        </Box>
                    )}

                    {/* Header */}
                    <Group justify="space-between" wrap="nowrap">
                        <Box style={{ flex: 1, minWidth: 0 }}>
                            <Text size="sm" fw={600} truncate>
                                {model.title || model.name}
                            </Text>
                            {folder && (
                                <Group gap={4}>
                                    <IconFolder size={12} />
                                    <Text size="xs" c="dimmed" truncate>
                                        {folder}
                                    </Text>
                                </Group>
                            )}
                        </Box>
                        <Group gap={4} wrap="nowrap">
                            {loadedModelNames.has(model.name) && (
                                <SwarmBadge tone="success" size="xs">
                                    Loaded
                                </SwarmBadge>
                            )}
                            {isSelected && <SwarmBadge tone="info" size="sm">Active</SwarmBadge>}
                            <SwarmActionIcon
                                size="xs"
                                tone="secondary"
                                emphasis="ghost"
                                label={starredModels.has(model.name) ? `Unstar ${model.title || model.name}` : `Star ${model.title || model.name}`}
                                onClick={(e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); handleToggleStar(model.name); }}
                            >
                                {starredModels.has(model.name) ? <IconStarFilled size={14} style={{ color: 'var(--theme-warning)' }} /> : <IconStar size={14} />}
                            </SwarmActionIcon>
                            <Menu shadow="md" width={160} position="bottom-end" withinPortal>
                                <Menu.Target>
                                    <SwarmActionIcon
                                        size="xs"
                                        tone="secondary"
                                        emphasis="ghost"
                                        label={`Open actions for ${model.title || model.name}`}
                                        onClick={(e: MouseEvent<HTMLButtonElement>) => e.stopPropagation()}
                                    >
                                        <IconDotsVertical size={14} />
                                    </SwarmActionIcon>
                                </Menu.Target>
                                <Menu.Dropdown>
                                    <Menu.Item leftSection={<IconEye size={14} />} onClick={(e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); handleViewDetails(model.name); }}>
                                        View Details
                                    </Menu.Item>
                                    <Menu.Item leftSection={<IconEdit size={14} />} onClick={(e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); handleOpenRename(model.name); }}>
                                        Rename
                                    </Menu.Item>
                                    <Menu.Divider />
                                    <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={(e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); handleOpenDelete(model.name); }}>
                                        Delete
                                    </Menu.Item>
                                </Menu.Dropdown>
                            </Menu>
                        </Group>
                    </Group>

                    {/* Architecture Badge */}
                    {model.architecture && (
                        <SwarmBadge tone="secondary" emphasis="soft" size="sm">
                            {model.architecture}
                        </SwarmBadge>
                    )}
                    {renderModelTags(model)}

                    {/* More Info Button - Toggles expand */}
                    <SwarmButton
                        size="xs"
                        tone="secondary"
                        emphasis="ghost"
                        fullWidth
                        rightSection={<IconEye size={14} />}
                        onClick={(e: MouseEvent<HTMLButtonElement>) => {
                            e.stopPropagation();
                            handleViewDetails(model.name);
                        }}
                    >
                        More Info
                    </SwarmButton>
                </Stack>
            </Card>
        );
    };

    // Render Model List Item (List View)
    const renderModelListItem = (model: Model) => {
        const isSelected = selectedModel === model.name;
        const expanded = expandedModel === model.name;
        // preview_image can be: base64 data URL, a path like "viewspecial/...", or undefined
        const rawPreview = (model.preview_image || model.preview) as string | undefined;
        // If it starts with 'data:' it's already a data URL
        // Otherwise, construct URL: replace 'viewspecial' with '/View' for Vite proxy
        let previewUrl: string | null = null;
        if (rawPreview) {
            if (rawPreview.startsWith('data:')) {
                previewUrl = rawPreview;
            } else if (rawPreview.startsWith('viewspecial/')) {
                previewUrl = rawPreview.replace('viewspecial/', '/View/');
            } else if (rawPreview.startsWith('/')) {
                previewUrl = rawPreview;
            } else {
                previewUrl = `/View/${rawPreview}`;
            }
        }
        const folder = getFolder(model.name);

        return (
            <Card
                key={model.name}
                withBorder
                padding="sm"
                className="swarm-selectable-card"
                data-selected={isSelected ? 'true' : undefined}
                style={{
                    borderColor: isSelected ? 'var(--theme-selected-border)' : undefined,
                    borderWidth: isSelected ? 2 : 1,
                    cursor: 'pointer'
                }}
                onClick={() => handleSelectModel(model.name)}
            >
                <Stack gap="xs">
                    <Group justify="space-between" wrap="nowrap">
                        {/* Left side - Info */}
                        <Group gap="md" style={{ flex: 1, minWidth: 0 }}>
                            {previewUrl && (
                                <Box
                                    style={{
                                        width: BROWSER_THUMBNAIL_SIZES[thumbnailSize].list,
                                        height: BROWSER_THUMBNAIL_SIZES[thumbnailSize].list,
                                        flexShrink: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        backgroundColor: 'var(--theme-surface-input)',
                                        borderRadius: 4,
                                        overflow: 'hidden',
                                    }}
                                >
                                    <LazyImage
                                        src={previewUrl}
                                        alt={model.title || model.name}
                                        fit="cover"
                                        height={BROWSER_THUMBNAIL_SIZES[thumbnailSize].list}
                                        width={BROWSER_THUMBNAIL_SIZES[thumbnailSize].list}
                                        rootMargin="100px"
                                    />
                                </Box>
                            )}
                            <Box style={{ flex: 1, minWidth: 0 }}>
                                <Text size="sm" fw={600} truncate>
                                    {model.title || model.name}
                                </Text>
                                {model.architecture && (
                                    <SwarmBadge tone="secondary" emphasis="soft" size="xs" mt={4}>
                                        {model.architecture}
                                    </SwarmBadge>
                                )}
                                {folder && (
                                    <Group gap={4} mt={2}>
                                        <IconFolder size={12} />
                                        <Text size="xs" c="dimmed">{folder}</Text>
                                    </Group>
                                )}
                            </Box>
                        </Group>

                        {/* Right side - Actions */}
                        <Group gap="xs">
                            {loadedModelNames.has(model.name) && (
                                <SwarmBadge tone="success" size="xs">
                                    Loaded
                                </SwarmBadge>
                            )}
                            <SwarmActionIcon
                                size="sm"
                                tone="secondary"
                                emphasis="ghost"
                                label={starredModels.has(model.name) ? `Unstar ${model.title || model.name}` : `Star ${model.title || model.name}`}
                                onClick={(e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); handleToggleStar(model.name); }}
                            >
                                {starredModels.has(model.name) ? <IconStarFilled size={16} style={{ color: 'var(--theme-warning)' }} /> : <IconStar size={16} />}
                            </SwarmActionIcon>
                            <SwarmActionIcon
                                size="sm"
                                tone="secondary"
                                emphasis="ghost"
                                label={expanded ? `Collapse details for ${model.title || model.name}` : `Expand details for ${model.title || model.name}`}
                                onClick={(e: MouseEvent<HTMLButtonElement>) => {
                                    e.stopPropagation();
                                    toggleExpandModel(model.name);
                                }}
                            >
                                {expanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
                            </SwarmActionIcon>
                            <Menu shadow="md" width={160} position="bottom-end" withinPortal>
                                <Menu.Target>
                                    <SwarmActionIcon
                                        size="sm"
                                        tone="secondary"
                                        emphasis="ghost"
                                        label={`Open actions for ${model.title || model.name}`}
                                        onClick={(e: MouseEvent<HTMLButtonElement>) => e.stopPropagation()}
                                    >
                                        <IconDotsVertical size={14} />
                                    </SwarmActionIcon>
                                </Menu.Target>
                                <Menu.Dropdown>
                                    <Menu.Item leftSection={<IconEye size={14} />} onClick={(e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); handleViewDetails(model.name); }}>
                                        View Details
                                    </Menu.Item>
                                    <Menu.Item leftSection={<IconEdit size={14} />} onClick={(e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); handleOpenRename(model.name); }}>
                                        Rename
                                    </Menu.Item>
                                    <Menu.Divider />
                                    <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={(e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); handleOpenDelete(model.name); }}>
                                        Delete
                                    </Menu.Item>
                                </Menu.Dropdown>
                            </Menu>
                            {isSelected && <IconCheck size={20} color="var(--theme-info)" />}
                        </Group>
                    </Group>

                    {/* Expanded Info */}
                    <Collapse in={expanded}>
                        <Stack gap="xs" mt="xs">
                            <Divider />
                            {model.description && (
                                <Text size="xs" c="dimmed">
                                    {sanitizeModelSnippet(model.description).slice(0, 260)}
                                    {sanitizeModelSnippet(model.description).length > 260 ? '...' : ''}
                                </Text>
                            )}
                            {renderModelTags(model)}
                            <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }}>
                                {model.name}
                            </Text>
                        </Stack>
                    </Collapse>
                </Stack>
            </Card>
        );
    };

    // Render Model Icon (Icons View)
    const renderModelIcon = (model: Model) => {
        const isSelected = selectedModel === model.name;
        // preview_image can be: base64 data URL, a path like "viewspecial/...", or undefined
        const rawPreview = (model.preview_image || model.preview) as string | undefined;
        // If it starts with 'data:' it's already a data URL
        // Otherwise, construct URL: replace 'viewspecial' with '/View' for Vite proxy
        let previewUrl: string | null = null;
        if (rawPreview) {
            if (rawPreview.startsWith('data:')) {
                previewUrl = rawPreview;
            } else if (rawPreview.startsWith('viewspecial/')) {
                previewUrl = rawPreview.replace('viewspecial/', '/View/');
            } else if (rawPreview.startsWith('/')) {
                previewUrl = rawPreview;
            } else {
                previewUrl = `/View/${rawPreview}`;
            }
        }

        return (
            <Tooltip
                key={model.name}
                label={model.title || model.name}
                withArrow
            >
                <Card
                    withBorder
                    padding="xs"
                    className="swarm-selectable-card"
                    data-selected={isSelected ? 'true' : undefined}
                    style={{
                        cursor: 'pointer',
                        borderColor: isSelected ? 'var(--theme-selected-border)' : undefined,
                        borderWidth: isSelected ? 2 : 1,
                        position: 'relative',
                    }}
                    onClick={() => handleSelectModel(model.name)}
                >
                    {/* Context menu overlay for icons */}
                    <Menu shadow="md" width={160} position="bottom-end" withinPortal>
                        <Menu.Target>
                            <SwarmActionIcon
                                size="xs"
                                tone="secondary"
                                emphasis="ghost"
                                label={`Open actions for ${model.title || model.name}`}
                                onClick={(e: MouseEvent<HTMLButtonElement>) => e.stopPropagation()}
                                style={{ position: 'absolute', top: 2, right: 2, zIndex: 1 }}
                            >
                                <IconDotsVertical size={12} />
                            </SwarmActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Item leftSection={<IconEye size={14} />} onClick={(e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); handleViewDetails(model.name); }}>
                                View Details
                            </Menu.Item>
                            <Menu.Item leftSection={<IconEdit size={14} />} onClick={(e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); handleOpenRename(model.name); }}>
                                Rename
                            </Menu.Item>
                            <Menu.Divider />
                            <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={(e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); handleOpenDelete(model.name); }}>
                                Delete
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                    {loadedModelNames.has(model.name) && (
                        <SwarmBadge tone="success" size="xs" style={{ position: 'absolute', top: 2, left: 2, zIndex: 1 }}>
                            Loaded
                        </SwarmBadge>
                    )}
                    <SwarmActionIcon
                        size="xs"
                        tone="secondary"
                        emphasis="ghost"
                        label={starredModels.has(model.name) ? `Unstar ${model.title || model.name}` : `Star ${model.title || model.name}`}
                        onClick={(e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); handleToggleStar(model.name); }}
                        style={{ position: 'absolute', bottom: 2, right: 2, zIndex: 1 }}
                    >
                        {starredModels.has(model.name) ? <IconStarFilled size={12} style={{ color: 'var(--theme-warning)' }} /> : <IconStar size={12} />}
                    </SwarmActionIcon>
                    <Stack gap={4} align="center">
                        {previewUrl ? (
                            <Box
                                style={{
                                    width: BROWSER_THUMBNAIL_SIZES[thumbnailSize].icon,
                                    height: BROWSER_THUMBNAIL_SIZES[thumbnailSize].icon,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: 'var(--theme-surface-input)',
                                    borderRadius: 4,
                                    overflow: 'hidden',
                                }}
                            >
                                <LazyImage
                                    src={previewUrl}
                                    alt={model.title || model.name}
                                    fit="contain"
                                    height="100%"
                                    width="100%"
                                    rootMargin="100px"
                                />
                            </Box>
                        ) : (
                            <Center
                                style={{
                                    width: BROWSER_THUMBNAIL_SIZES[thumbnailSize].icon,
                                    height: BROWSER_THUMBNAIL_SIZES[thumbnailSize].icon,
                                    backgroundColor: 'var(--theme-surface-input)',
                                    borderRadius: 4,
                                }}
                            >
                                <IconPhoto size={24} color="var(--theme-text-secondary)" />
                            </Center>
                        )}
                        <Text size="xs" fw={500} ta="center" lineClamp={2} w="100%">
                            {model.title || model.name}
                        </Text>
                        {isSelected && (
                            <SwarmBadge tone="info" size="xs" fullWidth>
                                Active
                            </SwarmBadge>
                        )}
                    </Stack>
                </Card>
            </Tooltip>
        );
    };

    const shouldVirtualize = featureFlags.virtualizedBrowsersV2 && filteredModels.length >= 120;
    const virtualContainerHeight = useMemo(() => {
        if (typeof window === 'undefined') return 520;
        return Math.max(360, Math.min(720, window.innerHeight - 320));
    }, []);

    return (
        <FloatingWindow
            opened={opened}
            onClose={onClose}
            title="Model Browser"
            initialWidth={1100}
            initialHeight={750}
            minWidth={600}
            minHeight={400}
            zIndex={Z_INDEX.modal}
        >
            <Stack gap="md">
                {/* Controls Row */}
                <Group grow className="swarm-browser-controls-row">
                    <TextInput
                        placeholder="Search Models..."
                        leftSection={<IconSearch size={16} />}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.currentTarget.value)}
                    />
                    <HeadlessCombobox
                        placeholder="Filter by folder"
                        options={folderOptions}
                        value={selectedFolder}
                        onChange={(value: string | null) => setSelectedFolder(value || 'all')}
                        leftSection={<IconFolder size={16} />}
                        clearable
                        style={{ flex: 1 }}
                    />
                </Group>

                {/* View Options */}
                <div className="swarm-browser-view-row">
                    <div className="swarm-browser-view-row__left">
                        <SwarmSegmentedControl
                            value={viewMode}
                            onChange={(value: string) => setViewMode(value as ViewMode)}
                            data={MODEL_BROWSER_VIEW_MODE_OPTIONS}
                        />
                        <NumberInput
                            label="Folder Depth"
                            description={folderDepth >= 99 ? 'Showing all depths' : `${folderDepth === 1 ? 'This folder only' : `Up to ${folderDepth} levels deep`}`}
                            value={folderDepth >= 99 ? '' : folderDepth}
                            placeholder="All"
                            onChange={(value) => {
                                if (value === '' || value === undefined) {
                                    setFolderDepth(99);
                                } else {
                                    const normalized = Number(value) || 1;
                                    setFolderDepth(Math.min(99, Math.max(1, normalized)));
                                }
                            }}
                            min={1}
                            max={99}
                            step={1}
                            w={160}
                            size="xs"
                            rightSection={
                                folderDepth < 99 ? (
                                    <Tooltip label="Show all depths">
                                        <Box
                                            component="button"
                                            type="button"
                                            onClick={() => setFolderDepth(99)}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 0, color: 'var(--mantine-color-dimmed)' }}
                                        >
                                            <Text size="xs" c="dimmed">All</Text>
                                        </Box>
                                    </Tooltip>
                                ) : undefined
                            }
                        />
                        <SwarmActionIcon
                            tone="secondary"
                            emphasis="soft"
                            label="Refresh model list"
                            onClick={() => void loadModels()}
                            title="Refresh Models"
                        >
                            <IconRefresh size={18} />
                        </SwarmActionIcon>
                    </div>
                    <Text size="sm" c="dimmed" className="swarm-browser-view-row__meta">
                        {filteredModels.length} Model{filteredModels.length !== 1 ? 's' : ''} found
                    </Text>
                    <SwarmSegmentedControl
                        value={thumbnailSize}
                        onChange={(value: string) => setThumbnailSize(value as ThumbnailSize)}
                        data={BROWSER_THUMBNAIL_SIZE_OPTIONS}
                        className="swarm-browser-view-row__right"
                    />
                </div>

                <Divider />

                {/* Available Models */}
                {loading ? (
                    <Center h={300}>
                        <Loader size="lg" />
                    </Center>
                ) : filteredModels.length === 0 ? (
                    <Center h={200}>
                        <Text c="dimmed">No Models found</Text>
                    </Center>
                ) : (
                    <>
                        {viewMode === 'cards' && (
                            shouldVirtualize ? (
                                <VirtualGrid
                                    items={filteredModels}
                                    columns={{ base: 1, sm: 2, md: 3, lg: 4, xl: 5 }}
                                    rowHeight={BROWSER_THUMBNAIL_SIZES[thumbnailSize].card + 220}
                                    containerHeight={virtualContainerHeight}
                                    gap={16}
                                    overscan={4}
                                    renderItem={(model: Model) => renderModelCard(model)}
                                />
                            ) : (
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: `repeat(auto-fill, minmax(${BROWSER_THUMBNAIL_SIZES[thumbnailSize].card * 1.5 + 60}px, 1fr))`,
                                    gap: 16,
                                }}>
                                    {filteredModels.map((model: Model) => renderModelCard(model))}
                                </div>
                            )
                        )}

                        {viewMode === 'list' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {filteredModels.map((model: Model) => renderModelListItem(model))}
                            </div>
                        )}

                        {viewMode === 'icons' && (
                            shouldVirtualize ? (
                                <VirtualGrid
                                    items={filteredModels}
                                    columns={{ base: 3, sm: 4, md: 6, lg: 7, xl: 8 }}
                                    rowHeight={BROWSER_THUMBNAIL_SIZES[thumbnailSize].icon + 96}
                                    containerHeight={virtualContainerHeight}
                                    gap={8}
                                    overscan={4}
                                    renderItem={(model: Model) => renderModelIcon(model)}
                                />
                            ) : (
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: `repeat(auto-fill, minmax(${BROWSER_THUMBNAIL_SIZES[thumbnailSize].icon + 40}px, 1fr))`,
                                    gap: 8,
                                }}>
                                    {filteredModels.map((model: Model) => renderModelIcon(model))}
                                </div>
                            )
                        )}
                    </>
                )}

                {/* Actions */}
                <Group className="swarm-browser-footer swarm-browser-footer--between">
                    {/* Clear Model Button */}
                    {selectedModel && onClearModel && (
                        <SwarmButton
                            tone="danger"
                            emphasis="outline"
                            leftSection={<IconX size={16} />}
                            onClick={() => {
                                onClearModel();
                                notifications.show({
                                    title: 'Model Cleared',
                                    message: 'Current model has been cleared',
                                    color: 'orange',
                                });
                            }}
                        >
                            Clear Model
                        </SwarmButton>
                    )}
                    {!selectedModel && <Box />}
                    <SwarmButton tone="secondary" emphasis="ghost" onClick={onClose}>
                        Close
                    </SwarmButton>
                </Group>
            </Stack>

            {/* Model Detail Modal */}
            <ModelDetailModal
                opened={detailModalOpen}
                onClose={() => setDetailModalOpen(false)}
                modelName={detailModelName}
                onModelChanged={() => {
                    queryClient.invalidateQueries({ queryKey: queryKeys.models.browser('', 'Stable-Diffusion') });
                    queryClient.invalidateQueries({ queryKey: queryKeys.models.loaded() });
                    void loadModels();
                }}
            />

            {/* Rename Modal */}
            <Modal
                opened={renameModalOpen}
                onClose={() => setRenameModalOpen(false)}
                title="Rename Model"
                size="sm"
                centered
                zIndex={Z_INDEX.modal + 10}
            >
                <Stack gap="md">
                    <Text size="sm" c="dimmed">Renaming: {renameModelName}</Text>
                    <TextInput
                        label="New Name"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.currentTarget.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSubmit(); }}
                    />
                    <Group justify="flex-end">
                        <SwarmButton tone="secondary" emphasis="ghost" onClick={() => setRenameModalOpen(false)}>
                            Cancel
                        </SwarmButton>
                        <SwarmButton tone="brand" loading={renameLoading} onClick={handleRenameSubmit}>
                            Rename
                        </SwarmButton>
                    </Group>
                </Stack>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                opened={deleteConfirmOpen}
                onClose={() => setDeleteConfirmOpen(false)}
                title="Delete Model"
                size="sm"
                centered
                zIndex={Z_INDEX.modal + 10}
            >
                <Stack gap="md">
                    <Text size="sm">
                        Are you sure you want to delete <strong>{deleteModelName}</strong>? This action cannot be undone.
                    </Text>
                    <Group justify="flex-end">
                        <SwarmButton tone="secondary" emphasis="ghost" onClick={() => setDeleteConfirmOpen(false)}>
                            Cancel
                        </SwarmButton>
                        <SwarmButton tone="danger" loading={deleteLoading} onClick={handleDeleteConfirm}>
                            Delete
                        </SwarmButton>
                    </Group>
                </Stack>
            </Modal>
        </FloatingWindow>
    );
}

