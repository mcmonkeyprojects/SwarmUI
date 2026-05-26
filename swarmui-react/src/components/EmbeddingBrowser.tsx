import { useState, useCallback, useMemo, type MouseEvent } from 'react';
import { useDebounce } from '../hooks/useDebounce';
import { Z_INDEX } from '../utils/zIndex';
import {
    Stack,
    Group,
    Text,
    Card,
    NumberInput,
    Loader,
    Center,
    Divider,
    Tooltip,
    Box,
    Badge,
    Paper,
} from '@mantine/core';
import {
    IconCopy,
    IconEye,
    IconFolder,
    IconLayoutGrid,
    IconLayoutList,
    IconPhoto,
    IconPhotoOff,
    IconPlus,
    IconRefresh,
    IconSearch,
    IconX,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useQuery } from '@tanstack/react-query';
import { swarmClient } from '../api/client';
import type { Model } from '../api/types';
import { FloatingWindow } from './FloatingWindow';
import { LazyImage } from './LazyImage';
import { ModelDetailModal } from './ModelDetailModal';
import { HeadlessCombobox } from './headless/HeadlessCombobox';
import { ControlTray, SwarmActionIcon, SwarmBadge, SwarmButton, SwarmSearchInput, SwarmSegmentedControl, SwarmTooltip } from './ui';
import { VirtualGrid } from './VirtualGrid';
import {
    BROWSER_THUMBNAIL_SIZES,
    BROWSER_THUMBNAIL_SIZE_OPTIONS,
    DEFAULT_THUMBNAIL_SIZE,
    type ThumbnailSize,
} from './browserThumbnailSizes';
import { featureFlags } from '../config/featureFlags';
import { useWorkerFilter } from '../hooks/useWorker';
import { queryKeys } from '../api/queryClient';

export type EmbeddingTargetField = 'prompt' | 'negativeprompt';
export type EmbeddingInsertMode = 'smart' | EmbeddingTargetField;

export interface EmbeddingInsertRequest {
    embeddingText: string;
    targetField: EmbeddingTargetField;
    preferredPosition: 'prepend';
    dedupeKeys?: string[];
    embeddingTag?: string;
    sourceLabel?: string;
}

interface EmbeddingBrowserProps {
    opened: boolean;
    onClose: () => void;
    onSelectEmbedding: (request: EmbeddingInsertRequest) => void;
}

type ViewMode = 'cards' | 'list' | 'icons';
type EmbeddingTargetReason = 'negative-metadata' | 'likely-negative' | 'positive-default';

interface EmbeddingTargetClassification {
    targetField: EmbeddingTargetField;
    reason: EmbeddingTargetReason;
}

const EMBEDDING_SEARCH_FIELDS: (keyof Model)[] = ['name', 'title', 'description', 'architecture'];
const EMBEDDING_BROWSER_VIEW_MODE_OPTIONS = [
    { value: 'cards', label: <IconLayoutGrid size={14} /> },
    { value: 'list', label: <IconLayoutList size={14} /> },
    { value: 'icons', label: <IconPhoto size={14} /> },
] as const;
const EMBEDDING_INSERT_MODE_OPTIONS = [
    { value: 'smart', label: 'Smart' },
    { value: 'prompt', label: 'Positive' },
    { value: 'negativeprompt', label: 'Negative' },
] as const;
const NEGATIVE_EMBEDDING_NAME_PATTERNS = [
    /(^|[^a-z0-9])negative([^a-z0-9]|$)/i,
    /easy[-_\s]?negative/i,
    /fast[-_\s]?negative/i,
    /deep[-_\s]?negative/i,
    /ng[-_\s]?deep[-_\s]?negative/i,
    /very[-_\s]?bad[-_\s]?image/i,
    /bad[-_\s]?(hand|hands|prompt|artist|image|images|picture|pictures|quality|dream|anatomy|face|eyes)/i,
    /unaesthetic/i,
] as const;
const NEGATIVE_EMBEDDING_TEXT_PATTERNS = [
    /negative\s+(prompt|embedding|textual inversion)/i,
    /(use|used|place|put|add|insert)\s+(this\s+)?(in|for|with)\s+(the\s+)?negative/i,
    /(for|with)\s+(the\s+)?negative\s+prompt/i,
] as const;
const NEGATIVE_EMBEDDING_TAGS = new Set([
    'negative',
    'negative prompt',
    'negative embedding',
    'negative textual inversion',
    'bad hands',
    'bad anatomy',
    'unaesthetic',
]);

function getPreviewUrl(model: Model): string | null {
    const rawPreview = (model.preview_image || model.preview) as string | undefined;
    if (!rawPreview) return null;
    const preview = rawPreview.trim();
    if (!preview || preview === 'imgs/model_placeholder.jpg') return null;
    if (preview.startsWith('data:') || preview.startsWith('http://') || preview.startsWith('https://')) {
        return preview;
    }
    if (preview.startsWith('viewspecial/')) {
        return preview.replace('viewspecial/', '/View/');
    }
    if (preview.startsWith('/')) {
        return preview;
    }
    return `/View/${preview}`;
}

function sanitizeSnippet(input?: string): string {
    if (!input) return '';
    return input
        .replace(/<\/?[^>]+(>|$)/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getStringField(model: Model, field: string): string {
    const value = model[field];
    return typeof value === 'string' ? value : '';
}

function getStringArrayField(model: Model, field: string): string[] {
    const value = model[field];
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter((entry): entry is string => typeof entry === 'string');
}

function getBooleanField(model: Model, field: string): boolean {
    const value = model[field];
    if (value === true) {
        return true;
    }
    return typeof value === 'string' && value.toLowerCase() === 'true';
}

function getEmbeddingFileLabel(model: Model): string {
    const normalizedName = model.name.replace(/\\/g, '/');
    const fileName = normalizedName.split('/').pop() || normalizedName;
    return fileName.replace(/\.[^.]+$/, '');
}

function getEmbeddingTag(model: Model): string {
    return `<embed:${model.name}>`;
}

function getEmbeddingActivationWords(model: Model): string[] {
    const rawText = [
        getStringField(model, 'trigger_phrase'),
        getStringField(model, 'activationText'),
        ...getStringArrayField(model, 'trainedWords'),
    ].join('\n');
    if (!rawText.trim()) {
        return [];
    }

    const seen = new Set<string>();
    return rawText
        .split(/[,\n;]+/)
        .map((word) => word.trim())
        .filter((word) => {
            if (word.length <= 1 || word.length > 96) {
                return false;
            }
            const normalized = word.toLowerCase();
            if (seen.has(normalized)) {
                return false;
            }
            seen.add(normalized);
            return true;
        })
        .slice(0, 12);
}

function getEmbeddingPromptText(embeddingTag: string, activationWords: string[], textOverride?: string): string {
    const requestedText = textOverride?.trim();
    if (requestedText) {
        if (requestedText === embeddingTag) {
            return embeddingTag;
        }
        return `${requestedText}, ${embeddingTag}`;
    }
    if (activationWords.length > 0) {
        return `${activationWords.join(', ')}, ${embeddingTag}`;
    }
    return embeddingTag;
}

function getEmbeddingSourceLabel(embeddingText: string, embeddingTag: string): string {
    return embeddingText === embeddingTag ? 'embedding tag' : 'activation words and embedding tag';
}

function getEmbeddingInsertLabel(model: Model): string {
    return getEmbeddingActivationWords(model).length > 0 ? 'activation words and embedding tag' : 'embedding tag';
}

function matchesAnyPattern(input: string, patterns: readonly RegExp[]): boolean {
    return patterns.some((pattern) => pattern.test(input));
}

function classifyEmbeddingPromptTarget(model: Model): EmbeddingTargetClassification {
    if (getBooleanField(model, 'is_negative_embedding')) {
        return {
            targetField: 'negativeprompt',
            reason: 'negative-metadata',
        };
    }

    const itemIdentityText = [
        getEmbeddingFileLabel(model),
        getStringField(model, 'title'),
    ].join(' ');
    const hasNegativeTag = getStringArrayField(model, 'tags')
        .map((tag) => tag.trim().toLowerCase())
        .some((tag) => NEGATIVE_EMBEDDING_TAGS.has(tag));
    const descriptiveText = [
        getStringField(model, 'description'),
        getStringField(model, 'usage_hint'),
    ].join(' ');

    if (
        matchesAnyPattern(itemIdentityText, NEGATIVE_EMBEDDING_NAME_PATTERNS)
        || hasNegativeTag
        || matchesAnyPattern(descriptiveText, NEGATIVE_EMBEDDING_TEXT_PATTERNS)
    ) {
        return {
            targetField: 'negativeprompt',
            reason: 'likely-negative',
        };
    }

    return {
        targetField: 'prompt',
        reason: 'positive-default',
    };
}

function getTargetReasonLabel(reason: EmbeddingTargetReason): string {
    if (reason === 'negative-metadata') {
        return 'Negative metadata';
    }
    if (reason === 'likely-negative') {
        return 'Likely negative';
    }
    return 'Positive default';
}

export function EmbeddingBrowser({ opened, onClose, onSelectEmbedding }: EmbeddingBrowserProps) {
    const [selectedFolder, setSelectedFolder] = useState<string>('all');
    const [folderDepth, setFolderDepth] = useState<number>(1);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<ViewMode>('cards');
    const [thumbnailSize, setThumbnailSize] = useState<ThumbnailSize>(DEFAULT_THUMBNAIL_SIZE);
    const [insertMode, setInsertMode] = useState<EmbeddingInsertMode>('smart');
    const [detailEmbedding, setDetailEmbedding] = useState<Model | null>(null);
    const [detailModalOpen, setDetailModalOpen] = useState(false);
    const embeddingsQuery = useQuery({
        queryKey: queryKeys.embeddings.browser(),
        queryFn: () => swarmClient.listEmbeddingsWithFolders(),
        staleTime: 5 * 60 * 1000,
        enabled: opened,
    });
    const embeddings = embeddingsQuery.data?.files ?? [];
    const apiFolders = embeddingsQuery.data?.folders ?? [];
    const loading = opened && embeddingsQuery.isLoading && !embeddingsQuery.data;

    const normalizePath = useCallback((path: string): string => path.replace(/\\/g, '/'), []);
    const getFolder = useCallback((path: string) => {
        const parts = normalizePath(path).split('/');
        if (parts.length > 1) {
            return parts.slice(0, -1).join('/');
        }
        return '';
    }, [normalizePath]);

    const loadEmbeddings = async () => {
        try {
            await embeddingsQuery.refetch();
        } catch {
            notifications.show({
                title: 'Error',
                message: 'Failed to load embeddings',
                color: 'red',
            });
        }
    };

    const folders = Array.from(
        new Set([
            ...apiFolders.map((folder) => normalizePath(folder).replace(/^\/+|\/+$/g, '')),
            ...embeddings.map((embedding) => getFolder(embedding.name)),
        ])
    )
        .filter(Boolean)
        .sort();

    const debouncedSearch = useDebounce(searchQuery, 200);
    const { result: searchFilteredEmbeddings } = useWorkerFilter<Model>(
        embeddings,
        debouncedSearch,
        EMBEDDING_SEARCH_FIELDS
    );

    const filteredEmbeddings = useMemo(() => searchFilteredEmbeddings.filter((embedding) => {
        const normalizedPath = normalizePath(embedding.name);
        const embeddingFolder = getFolder(normalizedPath);
        const matchesFolder =
            selectedFolder === 'all'
            || embeddingFolder === selectedFolder
            || embeddingFolder.startsWith(`${selectedFolder}/`);

        let relativeDepth = 0;
        if (selectedFolder === 'all') {
            relativeDepth = embeddingFolder ? embeddingFolder.split('/').filter(Boolean).length : 0;
        } else if (matchesFolder) {
            const selectedDepth = selectedFolder.split('/').filter(Boolean).length;
            const itemDepth = embeddingFolder ? embeddingFolder.split('/').filter(Boolean).length : 0;
            relativeDepth = Math.max(0, itemDepth - selectedDepth);
        }

        return matchesFolder && relativeDepth < folderDepth;
    }), [searchFilteredEmbeddings, selectedFolder, folderDepth, normalizePath, getFolder]);

    const resolveTargetField = (embedding: Model, modeOverride?: EmbeddingInsertMode): EmbeddingTargetField => {
        const effectiveMode = modeOverride ?? insertMode;
        if (effectiveMode === 'prompt' || effectiveMode === 'negativeprompt') {
            return effectiveMode;
        }
        return classifyEmbeddingPromptTarget(embedding).targetField;
    };

    const handleSelectEmbedding = (embedding: Model, modeOverride?: EmbeddingInsertMode, textOverride?: string) => {
        const embeddingTag = getEmbeddingTag(embedding);
        const activationWords = getEmbeddingActivationWords(embedding);
        const embeddingText = getEmbeddingPromptText(embeddingTag, activationWords, textOverride);
        const targetField = resolveTargetField(embedding, modeOverride);
        const sourceLabel = getEmbeddingSourceLabel(embeddingText, embeddingTag);

        onSelectEmbedding({
            embeddingText,
            targetField,
            preferredPosition: 'prepend',
            dedupeKeys: [embeddingText, embeddingTag],
            embeddingTag,
            sourceLabel,
        });

        notifications.show({
            title: 'Embedding Added',
            message: `Added ${sourceLabel} for ${embedding.name} to ${targetField === 'prompt' ? 'positive' : 'negative'} prompt`,
            color: 'green',
        });
    };

    const handleSelectEmbeddingTag = (embedding: Model, modeOverride?: EmbeddingInsertMode) => {
        handleSelectEmbedding(embedding, modeOverride, getEmbeddingTag(embedding));
    };

    const handleCopyEmbedding = (embedding: Model) => {
        const embeddingText = getEmbeddingTag(embedding);
        void navigator.clipboard.writeText(embeddingText);
        notifications.show({
            title: 'Copied',
            message: `Copied ${embeddingText} to clipboard`,
            color: 'blue',
        });
    };

    const openEmbeddingDetails = (embedding: Model) => {
        setDetailEmbedding(embedding);
        setDetailModalOpen(true);
    };

    const folderOptions: { value: string; label: string }[] = (() => {
        const totalCountMap = new Map<string, number>();
        for (const folder of folders) {
            let total = 0;
            for (const embedding of embeddings) {
                const currentFolder = getFolder(normalizePath(embedding.name));
                if (currentFolder === folder || currentFolder.startsWith(`${folder}/`)) total++;
            }
            totalCountMap.set(folder, total);
        }

        const options = [{ value: 'all', label: `Root folder (${embeddings.length})` }];
        for (const folder of folders) {
            const depth = folder.split('/').filter(Boolean).length;
            const indent = depth > 1 ? `${'  '.repeat(depth - 1)}- ` : '';
            const count = totalCountMap.get(folder) || 0;
            options.push({
                value: folder,
                label: `${indent}${folder.split('/').pop()} (${count})`,
            });
        }
        return options;
    })();

    const renderPreview = (embedding: Model, mode: ViewMode) => {
        const previewUrl = getPreviewUrl(embedding);
        const size = BROWSER_THUMBNAIL_SIZES[thumbnailSize][mode === 'cards' ? 'card' : mode === 'list' ? 'list' : 'icon'];

        if (!previewUrl) {
            return (
                <Paper
                    withBorder
                    style={{
                        height: size,
                        minWidth: size,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'var(--theme-gray-6)',
                    }}
                >
                    <Stack gap={4} align="center">
                        <IconPhotoOff size={mode === 'list' ? 16 : 22} />
                        {mode !== 'icons' && (
                            <Text size="xs" c="dimmed">No preview</Text>
                        )}
                    </Stack>
                </Paper>
            );
        }

        return (
            <Box
                style={{
                    height: size,
                    minWidth: size,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'var(--theme-gray-6)',
                    borderRadius: 4,
                    overflow: 'hidden',
                }}
            >
                <LazyImage
                    src={previewUrl}
                    alt={embedding.title || embedding.name}
                    fit="contain"
                    height="100%"
                    width="100%"
                    rootMargin="100px"
                />
            </Box>
        );
    };

    const renderActivationChips = (embedding: Model, maxCount = 4) => {
        const activationWords = getEmbeddingActivationWords(embedding);
        if (activationWords.length === 0) {
            return null;
        }
        return (
            <Group gap={4} wrap="wrap">
                {activationWords.slice(0, maxCount).map((word) => (
                    <SwarmBadge
                        key={word}
                        tone="success"
                        emphasis="soft"
                        size="xs"
                        style={{ cursor: 'pointer' }}
                        onClick={(e: MouseEvent<HTMLDivElement>) => {
                            e.stopPropagation();
                            handleSelectEmbedding(embedding, undefined, word);
                        }}
                    >
                        {word}
                    </SwarmBadge>
                ))}
                {activationWords.length > maxCount && (
                    <Badge size="xs" variant="light">
                        +{activationWords.length - maxCount}
                    </Badge>
                )}
            </Group>
        );
    };

    const renderTagChip = (embedding: Model) => (
        <SwarmBadge
            tone="secondary"
            emphasis="soft"
            size="xs"
            style={{ cursor: 'pointer', fontFamily: 'monospace' }}
            onClick={(e: MouseEvent<HTMLDivElement>) => {
                e.stopPropagation();
                handleSelectEmbeddingTag(embedding);
            }}
        >
            {getEmbeddingTag(embedding)}
        </SwarmBadge>
    );

    const renderInsertActions = (embedding: Model) => (
        <Group gap={4} wrap="nowrap">
            <SwarmActionIcon
                size="sm"
                tone="info"
                emphasis="ghost"
                label={`Copy ${embedding.name} embedding tag`}
                onClick={(e: MouseEvent<HTMLButtonElement>) => {
                    e.stopPropagation();
                    handleCopyEmbedding(embedding);
                }}
            >
                <IconCopy size={14} />
            </SwarmActionIcon>
            <SwarmActionIcon
                size="sm"
                tone="secondary"
                emphasis="ghost"
                label={`View details for ${embedding.name}`}
                onClick={(e: MouseEvent<HTMLButtonElement>) => {
                    e.stopPropagation();
                    openEmbeddingDetails(embedding);
                }}
            >
                <IconEye size={14} />
            </SwarmActionIcon>
            <SwarmActionIcon
                size="sm"
                tone="success"
                emphasis="ghost"
                label={`Insert ${getEmbeddingInsertLabel(embedding)} for ${embedding.name} using current target`}
                onClick={(e: MouseEvent<HTMLButtonElement>) => {
                    e.stopPropagation();
                    handleSelectEmbedding(embedding);
                }}
            >
                <IconPlus size={14} />
            </SwarmActionIcon>
            <SwarmActionIcon
                size="sm"
                tone="primary"
                emphasis="ghost"
                label={`Insert ${getEmbeddingInsertLabel(embedding)} for ${embedding.name} into positive prompt`}
                onClick={(e: MouseEvent<HTMLButtonElement>) => {
                    e.stopPropagation();
                    handleSelectEmbedding(embedding, 'prompt');
                }}
            >
                P
            </SwarmActionIcon>
            <SwarmActionIcon
                size="sm"
                tone="warning"
                emphasis="ghost"
                label={`Insert ${getEmbeddingInsertLabel(embedding)} for ${embedding.name} into negative prompt`}
                onClick={(e: MouseEvent<HTMLButtonElement>) => {
                    e.stopPropagation();
                    handleSelectEmbedding(embedding, 'negativeprompt');
                }}
            >
                N
            </SwarmActionIcon>
        </Group>
    );

    const renderEmbeddingCard = (embedding: Model) => {
        const folder = getFolder(normalizePath(embedding.name));
        const description = sanitizeSnippet(embedding.description);
        const targetClassification = classifyEmbeddingPromptTarget(embedding);
        return (
            <Card
                key={embedding.name}
                className="swarm-browser-item-card"
                p="sm"
                withBorder
                style={{
                    cursor: 'pointer',
                    backgroundColor: 'var(--theme-gray-7)',
                    borderColor: embedding.is_negative_embedding ? 'color-mix(in srgb, var(--theme-warning) 40%, var(--theme-gray-5))' : 'var(--theme-gray-5)',
                    height: '100%',
                }}
                onClick={() => handleSelectEmbedding(embedding)}
            >
                <Stack gap="xs">
                    {renderPreview(embedding, 'cards')}
                    <Group justify="space-between" wrap="nowrap" align="flex-start">
                        <Box style={{ flex: 1, minWidth: 0 }}>
                            <Tooltip label={embedding.name} multiline w={260}>
                                <Text size="sm" fw={600} c="var(--theme-gray-0)" lineClamp={1}>
                                    {embedding.title || embedding.name.split('/').pop()}
                                </Text>
                            </Tooltip>
                            {folder && (
                                <Group gap={4}>
                                    <IconFolder size={12} />
                                    <Text size="xs" c="dimmed" truncate>{folder}</Text>
                                </Group>
                            )}
                        </Box>
                        {embedding.is_negative_embedding === true && (
                            <SwarmBadge tone="warning" size="sm">
                                Negative
                            </SwarmBadge>
                        )}
                    </Group>
                    <Group gap={6} wrap="wrap">
                        {embedding.architecture && (
                            <Badge size="xs" variant="outline">{embedding.architecture}</Badge>
                        )}
                        <Badge
                            size="xs"
                            variant="light"
                            color={targetClassification.targetField === 'negativeprompt' ? 'orange' : undefined}
                        >
                            {getTargetReasonLabel(targetClassification.reason)}
                        </Badge>
                    </Group>
                    {renderActivationChips(embedding)}
                    {description ? (
                        <Text size="xs" c="var(--theme-gray-2)" lineClamp={3}>
                            {description}
                        </Text>
                    ) : (
                        <Text size="xs" c="dimmed">No description available.</Text>
                    )}
                    <Group gap={4} wrap="wrap">
                        {renderTagChip(embedding)}
                    </Group>
                    {renderInsertActions(embedding)}
                </Stack>
            </Card>
        );
    };

    const renderEmbeddingListItem = (embedding: Model) => {
        const folder = getFolder(normalizePath(embedding.name));
        const description = sanitizeSnippet(embedding.description);
        const targetClassification = classifyEmbeddingPromptTarget(embedding);
        return (
            <Card
                key={embedding.name}
                p="sm"
                withBorder
                style={{
                    cursor: 'pointer',
                    backgroundColor: 'var(--theme-gray-7)',
                }}
                onClick={() => handleSelectEmbedding(embedding)}
            >
                <Group align="flex-start" wrap="nowrap">
                    {renderPreview(embedding, 'list')}
                    <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                        <Group justify="space-between" wrap="nowrap" align="flex-start">
                            <Box style={{ flex: 1, minWidth: 0 }}>
                                <Text size="sm" fw={600} lineClamp={1}>
                                    {embedding.title || embedding.name.split('/').pop()}
                                </Text>
                                {folder && (
                                    <Group gap={4}>
                                        <IconFolder size={12} />
                                        <Text size="xs" c="dimmed" truncate>{folder}</Text>
                                    </Group>
                                )}
                            </Box>
                            <Group gap={6} wrap="wrap">
                                {embedding.architecture && (
                                    <Badge size="xs" variant="outline">{embedding.architecture}</Badge>
                                )}
                                {embedding.is_negative_embedding === true && (
                                    <SwarmBadge tone="warning" size="sm">Negative</SwarmBadge>
                                )}
                                <Badge
                                    size="xs"
                                    variant="light"
                                    color={targetClassification.targetField === 'negativeprompt' ? 'orange' : undefined}
                                >
                                    {getTargetReasonLabel(targetClassification.reason)}
                                </Badge>
                            </Group>
                        </Group>
                        {renderActivationChips(embedding, 6)}
                        {description ? (
                            <Text size="xs" c="var(--theme-gray-2)" lineClamp={2}>
                                {description}
                            </Text>
                        ) : (
                            <Text size="xs" c="dimmed">No description available.</Text>
                        )}
                        <Group justify="space-between" align="center" wrap="wrap">
                            {renderTagChip(embedding)}
                            {renderInsertActions(embedding)}
                        </Group>
                    </Stack>
                </Group>
            </Card>
        );
    };

    const renderEmbeddingIcon = (embedding: Model) => (
        <Card
            key={embedding.name}
            withBorder
            p="sm"
            style={{ cursor: 'pointer', textAlign: 'center' }}
            onClick={() => handleSelectEmbedding(embedding)}
        >
            <Stack gap="xs" align="center">
                {renderPreview(embedding, 'icons')}
                <Tooltip label={embedding.title || embedding.name} multiline w={220}>
                    <Text size="xs" fw={600} lineClamp={2}>
                        {embedding.title || embedding.name.split('/').pop()}
                    </Text>
                </Tooltip>
                {embedding.is_negative_embedding === true && (
                    <SwarmBadge tone="warning" size="sm">Negative</SwarmBadge>
                )}
                {getEmbeddingActivationWords(embedding).length > 0 && renderActivationChips(embedding, 2)}
                {renderTagChip(embedding)}
                <Group gap={4}>
                    <SwarmActionIcon
                        size="sm"
                        tone="success"
                        emphasis="ghost"
                        label={`Insert ${getEmbeddingInsertLabel(embedding)} for ${embedding.name}`}
                        onClick={(e: MouseEvent<HTMLButtonElement>) => {
                            e.stopPropagation();
                            handleSelectEmbedding(embedding);
                        }}
                    >
                        <IconPlus size={14} />
                    </SwarmActionIcon>
                    <SwarmActionIcon
                        size="sm"
                        tone="secondary"
                        emphasis="ghost"
                        label={`View details for ${embedding.name}`}
                        onClick={(e: MouseEvent<HTMLButtonElement>) => {
                            e.stopPropagation();
                            openEmbeddingDetails(embedding);
                        }}
                    >
                        <IconEye size={14} />
                    </SwarmActionIcon>
                </Group>
            </Stack>
        </Card>
    );

    const shouldVirtualize = featureFlags.virtualizedBrowsersV2 && filteredEmbeddings.length >= 120;
    const virtualContainerHeight = useMemo(() => {
        if (typeof window === 'undefined') return 520;
        return Math.max(320, Math.min(680, window.innerHeight - 320));
    }, []);

    const virtualColumns = viewMode === 'icons'
        ? { base: 2, sm: 3, md: 4, lg: 5 }
        : { base: 1, sm: 2, md: 3, lg: 4 };
    const virtualRowHeight = viewMode === 'icons'
        ? BROWSER_THUMBNAIL_SIZES[thumbnailSize].icon + 92
        : BROWSER_THUMBNAIL_SIZES[thumbnailSize].card + 180;

    return (
        <>
            <FloatingWindow
                opened={opened}
                onClose={onClose}
                title="Embedding Browser"
                initialWidth={1120}
                initialHeight={760}
                minWidth={700}
                minHeight={480}
                zIndex={Z_INDEX.modal}
            >
                <Stack gap="md" className="swarm-browser-shell">
                    <ControlTray
                        title="Embedding Filters"
                        subtitle="Search textual inversions by name, tags, metadata, or prompt usage."
                        status={`${filteredEmbeddings.length} found`}
                        tone="info"
                    >
                        <Group grow className="swarm-browser-controls-row">
                            <SwarmSearchInput
                                placeholder="Search embeddings..."
                                leftSection={<IconSearch size={16} />}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.currentTarget.value)}
                                style={{ flex: 2 }}
                                visual="glitch"
                            />
                            {folderOptions.length > 1 && (
                                <HeadlessCombobox
                                    placeholder="Filter by folder"
                                    options={folderOptions}
                                    value={selectedFolder}
                                    onChange={(value: string | null) => setSelectedFolder(value || 'all')}
                                    leftSection={<IconFolder size={16} />}
                                    clearable
                                    style={{ flex: 1 }}
                                />
                            )}
                        </Group>
                    </ControlTray>

                    <ControlTray
                        title="Insert Mode"
                        subtitle="Choose the target prompt field and the visible browser density."
                        status={insertMode}
                        tone={insertMode === 'negativeprompt' ? 'warning' : 'success'}
                    >
                    <div className="swarm-browser-view-row">
                        <div className="swarm-browser-view-row__left">
                            <SwarmSegmentedControl
                                value={viewMode}
                                onChange={(value) => setViewMode(value as ViewMode)}
                                data={EMBEDDING_BROWSER_VIEW_MODE_OPTIONS}
                            />
                            <SwarmSegmentedControl
                                value={insertMode}
                                onChange={(value) => setInsertMode(value as EmbeddingInsertMode)}
                                data={EMBEDDING_INSERT_MODE_OPTIONS}
                            />
                            <SwarmSegmentedControl
                                value={thumbnailSize}
                                onChange={(value) => setThumbnailSize(value as ThumbnailSize)}
                                data={BROWSER_THUMBNAIL_SIZE_OPTIONS}
                            />
                            {searchQuery && (
                                <SwarmButton
                                    size="xs"
                                    tone="secondary"
                                    emphasis="ghost"
                                    onClick={() => setSearchQuery('')}
                                >
                                    Clear Search
                                </SwarmButton>
                            )}
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
                                        <SwarmTooltip label="Show all depths">
                                            <Box
                                                component="button"
                                                type="button"
                                                onClick={() => setFolderDepth(99)}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 0, color: 'var(--mantine-color-dimmed)' }}
                                            >
                                                <Text size="xs" c="dimmed">All</Text>
                                            </Box>
                                        </SwarmTooltip>
                                    ) : undefined
                                }
                            />
                            <SwarmActionIcon
                                tone="secondary"
                                emphasis="soft"
                                label="Refresh embeddings"
                                onClick={loadEmbeddings}
                            >
                                <IconRefresh size={16} />
                            </SwarmActionIcon>
                        </div>
                        <Text size="sm" c="dimmed" className="swarm-browser-view-row__meta">
                            {filteredEmbeddings.length} Embedding{filteredEmbeddings.length !== 1 ? 's' : ''} found
                        </Text>
                    </div>
                    </ControlTray>

                    <ControlTray
                        title="Primary Insert Behavior"
                        subtitle="The main plus action can include activation words, raw tags, or force a target field."
                        status={insertMode === 'smart' ? 'Smart' : insertMode === 'prompt' ? 'Positive' : 'Negative'}
                        tone={insertMode === 'negativeprompt' ? 'warning' : 'success'}
                    >
                        <Group justify="space-between" wrap="wrap">
                            <Text size="sm" c="dimmed">
                                Primary add action currently targets{' '}
                                {insertMode === 'smart'
                                    ? 'the smart prompt field and includes activation words when available'
                                    : insertMode === 'prompt'
                                        ? 'the positive prompt'
                                        : 'the negative prompt'}.
                            </Text>
                            <Text size="xs" c="dimmed">
                                Use `P` or `N` to override the destination, or the tag chip to insert the raw embedding tag.
                            </Text>
                        </Group>
                    </ControlTray>

                    <Divider />

                    {loading ? (
                        <Center h={220}>
                            <Loader size="lg" />
                        </Center>
                    ) : filteredEmbeddings.length === 0 ? (
                        <Center h={220}>
                            <Stack gap="xs" align="center">
                                <IconPhotoOff size={28} />
                                <Text c="dimmed">No embeddings found</Text>
                                <Text size="sm" c="dimmed">Try a different folder, search term, or depth setting.</Text>
                            </Stack>
                        </Center>
                    ) : viewMode === 'list' ? (
                        <Stack gap="xs">
                            {filteredEmbeddings.map((embedding) => renderEmbeddingListItem(embedding))}
                        </Stack>
                    ) : shouldVirtualize ? (
                        <VirtualGrid
                            items={filteredEmbeddings}
                            columns={virtualColumns}
                            rowHeight={virtualRowHeight}
                            containerHeight={virtualContainerHeight}
                            gap={8}
                            overscan={4}
                            renderItem={(embedding: Model) => (
                                viewMode === 'icons'
                                    ? renderEmbeddingIcon(embedding)
                                    : renderEmbeddingCard(embedding)
                            )}
                        />
                    ) : (
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: viewMode === 'icons'
                                    ? 'repeat(auto-fill, minmax(170px, 1fr))'
                                    : 'repeat(auto-fill, minmax(260px, 1fr))',
                                gap: 8,
                            }}
                        >
                            {filteredEmbeddings.map((embedding) => (
                                viewMode === 'icons'
                                    ? renderEmbeddingIcon(embedding)
                                    : renderEmbeddingCard(embedding)
                            ))}
                        </div>
                    )}

                    <Group className="swarm-browser-footer swarm-browser-footer--end">
                        <SwarmButton tone="secondary" emphasis="ghost" onClick={onClose} leftSection={<IconX size={14} />}>
                            Close
                        </SwarmButton>
                    </Group>
                </Stack>
            </FloatingWindow>

            <ModelDetailModal
                opened={detailModalOpen}
                onClose={() => {
                    setDetailModalOpen(false);
                    setDetailEmbedding(null);
                }}
                modelName={detailEmbedding?.name || ''}
                subtype="Embedding"
                onAddTriggerToPrompt={(trigger) => {
                    if (!detailEmbedding) {
                        return;
                    }
                    handleSelectEmbedding(detailEmbedding, undefined, trigger);
                }}
                extraTriggerKeywords={detailEmbedding ? [getEmbeddingTag(detailEmbedding)] : []}
            />
        </>
    );
}
