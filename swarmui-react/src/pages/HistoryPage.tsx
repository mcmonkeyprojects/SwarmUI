import { useState, useEffect, useMemo, useCallback, useRef, type ChangeEvent } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
    Badge,
    Grid,
    Card,
    Group,
    Text,
    Stack,
    Loader,
    Center,
    TextInput,
    Breadcrumbs,
    Anchor,
    Tooltip,
    Select,
    Chip,
    Paper,
    Modal,
} from '@mantine/core';
import {
    IconSearch,
    IconFolderFilled,
    IconHome,
    IconLayoutGrid,
    IconFolder,
    IconCheckbox,
    IconX,
    IconTrash,
    IconStar,
    IconColumns,
    IconSelectAll,
    IconFolderOpen,
    IconUpload,
    IconRefresh,
    IconDownload,
    IconArrowDown,
    IconArrowUp,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { swarmClient } from '../api/client';
import { resolveAssetUrl } from '../config/runtimeEndpoints';
import { ImageUpscaler } from '../components/ImageUpscaler';
import { ImageCard } from '../components/ImageCard';
import { ImageDetailModal } from '../components/ImageDetailModal';
import { ImageComparison } from '../components/ImageComparison';
import { useImageActions } from '../hooks/useImageActions';
import { useImageSelection } from '../hooks/useImageSelection';
import type { HistoryImageItem, HistoryMediaType, ListImagesV2Params } from '../api/types';
import { useGenerationStore, useInitImageToggle } from '../store/generationStore';
import { useCanvasWorkflowStore } from '../stores/canvasWorkflowStore';
import { useNavigationStore } from '../stores/navigationStore';
import type { HistoryRouteState } from '../stores/navigationStore';
import { useSessionStore } from '../stores/session';
import { useWebSocketStore } from '../stores/websocketStore';
import { imageUrlToDataUrl } from '../utils/imageData';
import { logger } from '../utils/logger';
import { SkeletonGrid } from '../components/SkeletonCard';
import { VirtualGrid } from '../components/VirtualGrid';
import { PageScaffold } from '../components/layout/PageScaffold';
import { SectionHero, SwarmActionIcon, SwarmButton, SwarmSegmentedControl } from '../components/ui';
import { useDebouncedState } from '../hooks/useDebounce';
import { queryClient, queryKeys } from '../api/queryClient';
import {
    cleanHistoryFolderPath,
    DEFAULT_HISTORY_PREFERENCES,
    HISTORY_PAGE_SIZE,
    getHistoryFilename,
    getHistoryMetadataSummary,
    getHistoryRelativePath,
    getHistorySelectionId,
    isImageMedia,
    isReservedHistoryFolderPath,
    mergeHistoryItems,
    readHistoryPreferences,
    resolveHistoryItems,
    writeHistoryPreferences,
    type HistoryPreferences,
} from '../features/history/historyUtils';
import { useHistoryWorkspaceStore } from '../stores/historyWorkspaceStore';
import { useWorkflowWorkspaceStore } from '../stores/workflowWorkspaceStore';

interface HistoryPageProps {
    routeState?: HistoryRouteState;
}

export function HistoryPage({ routeState }: HistoryPageProps) {
    const { setParams } = useGenerationStore();
    const setBatchOutputFolder = useGenerationStore((state) => state.setBatchOutputFolder);
    const { setEnableInitImage } = useInitImageToggle();
    const openCanvasWorkflow = useCanvasWorkflowStore((state) => state.openSession);
    const { navigateToGenerate, navigateToHistory } = useNavigationStore();
    const setWorkflowHandoff = useWorkflowWorkspaceStore((state) => state.setHandoff);
    const navigateToWorkflows = useNavigationStore((state) => state.navigateToWorkflows);
    const permissions = useSessionStore((state) => state.permissions);
    const generationPhase = useWebSocketStore((state) => state.generation.phase);
    const generatedImageCount = useWebSocketStore((state) => state.generation.images.length);
    const { savedViews, activeViewId, saveView, setActiveView, addToCollection } = useHistoryWorkspaceStore();

    const [preferences, setPreferences] = useState<HistoryPreferences>(() => ({
        ...DEFAULT_HISTORY_PREFERENCES,
        ...readHistoryPreferences(),
    }));
    const [currentPath, setCurrentPath] = useState('');
    const [selectedImage, setSelectedImage] = useState<HistoryImageItem | null>(null);
    const [searchQuery, setSearchQuery, debouncedSearchQuery] = useDebouncedState('', 250);
    const [upscaleModal, setUpscaleModal] = useState(false);
    const [upscaleImage, setUpscaleImage] = useState('');
    const [upscaleImageMetadata, setUpscaleImageMetadata] = useState<string | Record<string, unknown> | null>(null);
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const [comparisonModal, setComparisonModal] = useState(false);
    const [comparisonImages, setComparisonImages] = useState<[HistoryImageItem | null, HistoryImageItem | null]>([null, null]);
    const [lineageModalOpen, setLineageModalOpen] = useState(false);

    const completedGenerationRef = useRef(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const {
        selectedIds,
        isSelected,
        toggle,
        selectRange,
        selectAll,
        clearSelection,
        selectionCount,
        isSelectionMode,
        enterSelectionMode,
        exitSelectionMode,
        lastSelectedId,
    } = useImageSelection();

    const permissionSet = useMemo(() => new Set(permissions), [permissions]);
    const hasPermission = useCallback((permission: string) => permissionSet.has('*') || permissionSet.has(permission), [permissionSet]);

    const canStar = hasPermission('user_star_images');
    const canDelete = hasPermission('user_delete_image');
    const canOpenFolder = hasPermission('local_image_folder');
    const canImport = hasPermission('basic_image_generation');
    const canGenerate = hasPermission('fundamental_generate_tab_access') || hasPermission('basic_image_generation');

    const effectiveCurrentFolderOnly = preferences.viewMode === 'gallery'
        && preferences.currentFolderOnly
        && !!currentPath;

    const historyQuery = useMemo<ListImagesV2Params>(() => ({
        path: preferences.viewMode === 'folders'
            ? currentPath
            : effectiveCurrentFolderOnly
                ? currentPath
                : '',
        recursive: preferences.viewMode === 'gallery' ? !effectiveCurrentFolderOnly : false,
        depth: preferences.viewMode === 'gallery' ? undefined : 0,
        query: debouncedSearchQuery.trim() || null,
        sortBy: preferences.sortBy,
        sortReverse: preferences.sortReverse,
        starredOnly: preferences.starredOnly,
        mediaType: preferences.mediaType,
        limit: HISTORY_PAGE_SIZE,
    }), [
        preferences.viewMode,
        currentPath,
        effectiveCurrentFolderOnly,
        debouncedSearchQuery,
        preferences.sortBy,
        preferences.sortReverse,
        preferences.starredOnly,
        preferences.mediaType,
    ]);

    const historyListQueryKey = useMemo(() => ['history', 'list', historyQuery] as const, [historyQuery]);

    const historyQueryResult = useInfiniteQuery({
        queryKey: historyListQueryKey,
        initialPageParam: null as string | null,
        placeholderData: () => undefined,
        queryFn: async ({ pageParam }) => swarmClient.listImagesV2({
            ...historyQuery,
            cursor: (pageParam as string | null) ?? null,
        }),
        getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    });

    const historyPages = historyQueryResult.data?.pages ?? [];
    const visibleImages = useMemo(() => {
        let items: HistoryImageItem[] = [];

        for (const page of historyPages) {
            const resolved = resolveHistoryItems(page.files);
            items = items.length > 0 ? mergeHistoryItems(items, resolved) : resolved;
        }

        return items;
    }, [historyPages]);
    const historyFolders = historyPages[0]?.folders ?? [];
    const historyLastPage = historyPages[historyPages.length - 1] ?? null;
    const historyHasMore = !!historyQueryResult.hasNextPage;
    const historyTruncated = !!historyLastPage?.truncated;
    const historyTotalCount = historyLastPage?.total_count ?? 0;
    const historyLoading = historyQueryResult.isPending;
    const historyLoadingMore = historyQueryResult.isFetchingNextPage;
    const historyError = historyQueryResult.error instanceof Error
        ? historyQueryResult.error.message
        : historyQueryResult.error
            ? String(historyQueryResult.error)
            : null;

    useEffect(() => {
        writeHistoryPreferences(preferences);
    }, [preferences]);

    const updatePreferences = useCallback((next: Partial<HistoryPreferences>) => {
        setPreferences((prev) => ({ ...prev, ...next }));
    }, []);

    useEffect(() => {
        clearSelection();
        setSelectedImage(null);
    }, [clearSelection, historyListQueryKey]);

    useEffect(() => {
        if (generationPhase === 'complete' && generatedImageCount > 0 && generatedImageCount !== completedGenerationRef.current) {
            completedGenerationRef.current = generatedImageCount;
            void historyQueryResult.refetch();
        }
    }, [generationPhase, generatedImageCount, historyQueryResult.refetch]);

    const updateLocalImage = useCallback((image: HistoryImageItem, transform: (current: HistoryImageItem) => HistoryImageItem) => {
        const selectionId = getHistorySelectionId(image);
        setSelectedImage((prev) => {
            if (!prev || getHistorySelectionId(prev) !== selectionId) {
                return prev;
            }
            return transform(prev);
        });
    }, []);

    const { toggleStar, deleteImage, openFolder, addImageToHistory } = useImageActions({
        onStarToggled: (image, newStarred) => {
            updateLocalImage(image as HistoryImageItem, (current) => ({ ...current, starred: newStarred }));
            void queryClient.invalidateQueries({ queryKey: queryKeys.images.all });
            void historyQueryResult.refetch();
        },
        onDeleted: (_image) => {
            setSelectedImage(null);
            clearSelection();
            void queryClient.invalidateQueries({ queryKey: queryKeys.images.all });
            void historyQueryResult.refetch();
        },
        onImageAdded: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.images.all });
            void historyQueryResult.refetch();
        },
    });
    const allImageIds = useMemo(() => visibleImages.map((image) => getHistorySelectionId(image)), [visibleImages]);
    const selectedImages = useMemo(
        () => visibleImages.filter((image) => selectedIds.has(getHistorySelectionId(image))),
        [visibleImages, selectedIds]
    );

    useEffect(() => {
        if (!routeState?.image) {
            return;
        }

        const match = visibleImages.find((image) => getHistoryRelativePath(image) === routeState.image || image.src === routeState.image);
        if (match && (!selectedImage || getHistorySelectionId(selectedImage) !== getHistorySelectionId(match))) {
            setSelectedImage(match);
        }
    }, [routeState?.image, selectedImage, visibleImages]);

    const handleSelectionToggle = useCallback((imageId: string, event?: { shiftKey?: boolean }) => {
        if (event?.shiftKey && lastSelectedId) {
            selectRange(lastSelectedId, imageId, allImageIds);
        } else {
            toggle(imageId);
        }
    }, [lastSelectedId, selectRange, toggle, allImageIds]);

    const handleImportImage = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const closeSelectedImage = useCallback(() => {
        setSelectedImage(null);
        navigateToHistory({ image: null });
    }, [navigateToHistory]);

    const handleUseFolderForNextBatch = useCallback(() => {
        const folder = cleanHistoryFolderPath(currentPath);
        if (!folder || isReservedHistoryFolderPath(folder)) {
            notifications.show({
                title: 'Select A Folder',
                message: 'Open a normal history folder first, then send that folder to Generate.',
                color: 'yellow',
            });
            return;
        }

        setBatchOutputFolder(folder);
        navigateToGenerate();
        notifications.show({
            title: 'Next Save Folder Set',
            message: `The next batch will save into ${folder}.`,
            color: 'green',
        });
    }, [currentPath, navigateToGenerate, setBatchOutputFolder]);

    useEffect(() => {
        if (!routeState) {
            return;
        }

        if (routeState.path !== undefined && routeState.path !== currentPath) {
            setCurrentPath(routeState.path || '');
        }
        if (routeState.query !== undefined && routeState.query !== searchQuery) {
            setSearchQuery(routeState.query || '');
        }
        if (routeState.viewId && routeState.viewId !== activeViewId) {
            setActiveView(routeState.viewId);
        }
        if (
            routeState.sortBy && routeState.sortBy !== preferences.sortBy
            || routeState.sortReverse !== undefined && routeState.sortReverse !== preferences.sortReverse
            || routeState.starredOnly !== undefined && routeState.starredOnly !== preferences.starredOnly
            || routeState.mediaType && routeState.mediaType !== preferences.mediaType
            || routeState.currentFolderOnly !== undefined && routeState.currentFolderOnly !== preferences.currentFolderOnly
        ) {
            setPreferences((prev) => ({
                ...prev,
                sortBy: routeState.sortBy ?? prev.sortBy,
                sortReverse: routeState.sortReverse ?? prev.sortReverse,
                starredOnly: routeState.starredOnly ?? prev.starredOnly,
                mediaType: routeState.mediaType ?? prev.mediaType,
                currentFolderOnly: routeState.currentFolderOnly ?? prev.currentFolderOnly,
            }));
        }
    }, [
        activeViewId,
        currentPath,
        preferences.currentFolderOnly,
        preferences.mediaType,
        preferences.sortBy,
        preferences.sortReverse,
        preferences.starredOnly,
        routeState,
        searchQuery,
        setActiveView,
        setSearchQuery,
    ]);

    const handleFileSelected = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }

        await addImageToHistory(file);
        event.target.value = '';
    }, [addImageToHistory]);

    const handleFolderClick = useCallback((folderName: string) => {
        const newPath = currentPath ? `${currentPath}/${folderName}` : folderName;
        setCurrentPath(newPath);
    }, [currentPath]);

    const handleBreadcrumbClick = useCallback((index: number) => {
        if (index === -1) {
            setCurrentPath('');
            return;
        }

        const parts = currentPath.split('/');
        setCurrentPath(parts.slice(0, index + 1).join('/'));
    }, [currentPath]);

    const handleUpscale = useCallback((imagePath: string, metadata?: string | Record<string, unknown> | null) => {
        closeSelectedImage();
        setUpscaleImage(imagePath);
        setUpscaleImageMetadata(metadata || null);
        setUpscaleModal(true);
    }, [closeSelectedImage]);

    const handleReuseParams = useCallback((image: HistoryImageItem) => {
        if (!image.metadata) {
            notifications.show({
                title: 'No Metadata',
                message: 'This image does not have any generation metadata.',
                color: 'yellow',
            });
            return;
        }

        try {
            const meta = typeof image.metadata === 'string'
                ? JSON.parse(image.metadata)
                : image.metadata;

            logger.debug('[ReuseParams] Raw metadata:', meta);

            const swarmParams = meta.sui_image_params || meta.swarm || meta;
            const params: Record<string, unknown> = {};

            const prompt = swarmParams.prompt || meta.prompt;
            if (prompt) params.prompt = prompt;

            const negPrompt = swarmParams.negativeprompt || swarmParams.negative_prompt || meta.negativeprompt || meta.negative_prompt;
            if (negPrompt) params.negativeprompt = negPrompt;

            const model = swarmParams.model || meta.model || meta.Model || meta.swarm_model;
            if (model) params.model = model;

            const steps = swarmParams.steps || meta.steps;
            if (steps) params.steps = parseInt(steps, 10);

            const cfg = swarmParams.cfgscale || swarmParams.cfg_scale || swarmParams.cfg || meta.cfgscale || meta.cfg_scale;
            if (cfg) params.cfgscale = parseFloat(cfg);

            const seed = swarmParams.seed || meta.seed;
            if (seed !== undefined) params.seed = parseInt(seed, 10);

            const width = swarmParams.width || meta.width;
            if (width) params.width = parseInt(width, 10);

            const height = swarmParams.height || meta.height;
            if (height) params.height = parseInt(height, 10);

            const sampler = swarmParams.sampler || meta.sampler;
            if (sampler) params.sampler = sampler;

            const scheduler = swarmParams.scheduler || meta.scheduler;
            if (scheduler) params.scheduler = scheduler;

            setParams(params);
            closeSelectedImage();

            notifications.show({
                title: 'Parameters Loaded',
                message: `Loaded ${Object.keys(params).length} generation parameters.`,
                color: 'green',
            });
        } catch (error) {
            console.error('[ReuseParams] Failed to parse metadata:', error, image.metadata);
            notifications.show({
                title: 'Parse Error',
                message: 'Could not parse image metadata.',
                color: 'red',
            });
        }
    }, [closeSelectedImage, setParams]);

    const handleSaveCurrentView = useCallback(() => {
        const suggestedName = [
            preferences.starredOnly ? 'Starred' : null,
            searchQuery ? `Search: ${searchQuery.slice(0, 18)}` : null,
            currentPath || 'All History',
        ].filter(Boolean).join(' • ');
        const name = window.prompt('Name this saved view:', suggestedName || 'History View');
        if (!name?.trim()) {
            return;
        }

        const viewId = saveView({
            name: name.trim(),
            currentPath,
            query: searchQuery,
            preferences,
        });
        setActiveView(viewId);
        notifications.show({
            title: 'Saved View Created',
            message: `${name.trim()} is now available from the review bar.`,
            color: 'green',
        });
    }, [currentPath, preferences, saveView, searchQuery, setActiveView]);

    const handleApplySavedView = useCallback((viewId: string) => {
        const view = savedViews.find((entry) => entry.id === viewId);
        if (!view) {
            return;
        }

        setActiveView(view.id);
        setCurrentPath(view.currentPath);
        setSearchQuery(view.query);
        setPreferences(view.preferences);
        navigateToHistory({
            path: view.currentPath || null,
            query: view.query || null,
            sortBy: view.preferences.sortBy,
            sortReverse: view.preferences.sortReverse,
            starredOnly: view.preferences.starredOnly,
            mediaType: view.preferences.mediaType,
            currentFolderOnly: view.preferences.currentFolderOnly,
            viewId: view.id,
        });
    }, [navigateToHistory, savedViews, setActiveView, setSearchQuery]);

    const handleAddSelectedToCollection = useCallback(() => {
        if (selectedImages.length === 0) {
            return;
        }

        const name = window.prompt('Collection name:', 'Review Batch');
        if (!name?.trim()) {
            return;
        }

        addToCollection(name.trim(), selectedImages.map((image) => getHistorySelectionId(image)));
        notifications.show({
            title: 'Collection Updated',
            message: `${selectedImages.length} item(s) added to ${name.trim()}.`,
            color: 'teal',
        });
    }, [addToCollection, selectedImages]);

    const handleEdit = useCallback((image: HistoryImageItem) => {
        closeSelectedImage();
        openCanvasWorkflow({
            imageUrl: image.src,
            metadata: image.metadata,
            width: image.width,
            height: image.height,
            launchSource: 'history',
            fallbackParams: useGenerationStore.getState().params,
            initialStep: 'mask',
        });
    }, [closeSelectedImage, openCanvasWorkflow]);

    const handleUseAsInitImage = useCallback(async (image: HistoryImageItem) => {
        try {
            const initImageDataUrl = await imageUrlToDataUrl(image.src);
            setParams({ initimage: initImageDataUrl });
            setEnableInitImage(true);
            closeSelectedImage();
            navigateToGenerate();

            notifications.show({
                title: 'Init Image Set',
                message: 'Image set as init image. Ready for Img2Img generation.',
                color: 'teal',
            });
        } catch (error) {
            notifications.show({
                title: 'Init Image Failed',
                message: error instanceof Error ? error.message : 'Failed to prepare the init image.',
                color: 'red',
            });
        }
    }, [closeSelectedImage, navigateToGenerate, setEnableInitImage, setParams]);

    const handleSendToWorkflow = useCallback(async (image: HistoryImageItem) => {
        const summary = getHistoryMetadataSummary(image);
        const metadata = summary.metadataObject ?? {};
        const paramsSource = (metadata.sui_image_params as Record<string, unknown> | undefined)
            || (metadata.swarm as Record<string, unknown> | undefined)
            || metadata;

        let initImageDataUrl: string | null = null;
        try {
            initImageDataUrl = await imageUrlToDataUrl(image.src);
        } catch {
            initImageDataUrl = null;
        }

        setWorkflowHandoff({
            source: 'history',
            templateId: initImageDataUrl ? 'image-to-image' : 'text-to-image',
            params: {
                prompt: summary.prompt || String(paramsSource.prompt || ''),
                negativeprompt: String(paramsSource.negativeprompt || paramsSource.negative_prompt || ''),
                model: summary.model || String(paramsSource.model || ''),
                steps: typeof paramsSource.steps === 'number' ? paramsSource.steps : undefined,
                cfgscale: typeof paramsSource.cfgscale === 'number' ? paramsSource.cfgscale : undefined,
                width: image.width ?? undefined,
                height: image.height ?? undefined,
                initimage: initImageDataUrl || undefined,
            },
            imageSrc: initImageDataUrl,
            note: `Promoted from history item ${getHistoryFilename(image)}`,
        });
        navigateToWorkflows({ mode: 'wizard' });
        notifications.show({
            title: 'Sent To Workflow',
            message: 'The selected history item is ready in the guided workflow workspace.',
            color: 'teal',
        });
    }, [navigateToWorkflows, setWorkflowHandoff]);

    const handleLoadMore = useCallback(async () => {
        if (!historyHasMore || historyLoadingMore) {
            return;
        }
        await historyQueryResult.fetchNextPage();
    }, [historyHasMore, historyLoadingMore, historyQueryResult.fetchNextPage]);

    const handleBulkDelete = useCallback(async () => {
        if (selectedImages.length === 0) {
            return;
        }

        try {
            for (const image of selectedImages) {
                await swarmClient.deleteImage(getHistoryRelativePath(image));
            }

            clearSelection();
            await historyQueryResult.refetch();

            notifications.show({
                title: 'Deleted',
                message: `${selectedImages.length} item${selectedImages.length > 1 ? 's' : ''} deleted.`,
                color: 'green',
            });
        } catch (error) {
            console.error('Failed to delete selected history items:', error);
            notifications.show({
                title: 'Error',
                message: 'Failed to delete some selected items.',
                color: 'red',
            });
        }
    }, [selectedImages, clearSelection, historyQueryResult.refetch]);

    const handleBulkStar = useCallback(async (star: boolean) => {
        if (selectedImages.length === 0) {
            return;
        }

        try {
            for (const image of selectedImages) {
                if (image.starred !== star) {
                    await swarmClient.toggleImageStar(getHistoryRelativePath(image));
                }
            }

            await historyQueryResult.refetch();

            notifications.show({
                title: star ? 'Starred' : 'Unstarred',
                message: `${selectedImages.length} item${selectedImages.length > 1 ? 's' : ''} updated.`,
                color: 'blue',
            });
        } catch (error) {
            console.error('Failed to update selected history items:', error);
            notifications.show({
                title: 'Error',
                message: 'Failed to update some selected items.',
                color: 'red',
            });
        }
    }, [selectedImages, historyQueryResult.refetch]);

    const handleBulkDownload = useCallback(() => {
        if (selectedImages.length === 0) {
            return;
        }

        for (const image of selectedImages) {
            const link = document.createElement('a');
            link.href = image.src;
            link.download = getHistoryFilename(image);
            link.rel = 'noopener';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        notifications.show({
            title: 'Download Started',
            message: `Started ${selectedImages.length} download${selectedImages.length > 1 ? 's' : ''}.`,
            color: 'blue',
        });
    }, [selectedImages]);

    const selectedLineage = useMemo(() => {
        const source = selectedImage || selectedImages[0] || null;
        if (!source) {
            return null;
        }

        const summary = getHistoryMetadataSummary(source);
        return {
            imageId: getHistorySelectionId(source),
            prompt: summary.prompt,
            model: summary.model,
            seed: summary.seed,
            resolution: summary.resolution,
        };
    }, [selectedImage, selectedImages]);

    useEffect(() => {
        navigateToHistory({
            path: currentPath || null,
            query: searchQuery || null,
            sortBy: preferences.sortBy,
            sortReverse: preferences.sortReverse,
            starredOnly: preferences.starredOnly,
            mediaType: preferences.mediaType,
            currentFolderOnly: preferences.currentFolderOnly,
            image: selectedImage ? getHistoryRelativePath(selectedImage) : null,
            viewId: activeViewId,
        });
    }, [
        activeViewId,
        currentPath,
        navigateToHistory,
        preferences.currentFolderOnly,
        preferences.mediaType,
        preferences.sortBy,
        preferences.sortReverse,
        preferences.starredOnly,
        searchQuery,
        selectedImage,
    ]);

    const handleExportZip = useCallback(async () => {
        const hasSelection = selectedImages.length > 0;
        const hasResults = visibleImages.length > 0;

        if (!hasSelection && !hasResults) {
            return;
        }

        try {
            const response = await swarmClient.exportHistoryZip(hasSelection
                ? { paths: selectedImages.map((image) => getHistoryRelativePath(image)) }
                : {
                    path: historyQuery.path,
                    recursive: historyQuery.recursive,
                    depth: historyQuery.depth,
                    query: historyQuery.query,
                    sortBy: historyQuery.sortBy,
                    sortReverse: historyQuery.sortReverse,
                    starredOnly: historyQuery.starredOnly,
                    mediaType: historyQuery.mediaType as HistoryMediaType,
                });

            if (!response.url) {
                throw new Error('Export completed without a download URL.');
            }

            window.open(resolveAssetUrl(response.url), '_blank', 'noopener,noreferrer');

            notifications.show({
                title: 'Export Ready',
                message: `Prepared ZIP with ${response.count ?? (hasSelection ? selectedImages.length : historyTotalCount)} item${(response.count ?? 1) === 1 ? '' : 's'}.`,
                color: 'green',
            });
        } catch (error) {
            console.error('Failed to export history ZIP:', error);
            notifications.show({
                title: 'Export Failed',
                message: error instanceof Error ? error.message : 'Failed to create export ZIP.',
                color: 'red',
            });
        }
    }, [historyQuery, historyTotalCount, selectedImages, visibleImages.length]);

    const handleCompare = useCallback(() => {
        if (selectedImages.length !== 2) {
            return;
        }

        if (!selectedImages.every((image) => isImageMedia(image))) {
            notifications.show({
                title: 'Compare Unavailable',
                message: 'Comparison currently supports image files only.',
                color: 'yellow',
            });
            return;
        }

        setComparisonImages([selectedImages[0], selectedImages[1]]);
        setComparisonModal(true);
    }, [selectedImages]);

    const getBreadcrumbs = useCallback(() => {
        const parts = currentPath.split('/').filter(Boolean);
        const items = [
            <Anchor key="root" size="sm" onClick={() => handleBreadcrumbClick(-1)} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <IconHome size={14} style={{ marginRight: 4 }} /> Root
            </Anchor>,
        ];

        parts.forEach((part, index) => {
            items.push(
                <Anchor key={`${part}-${index}`} size="sm" onClick={() => handleBreadcrumbClick(index)} style={{ cursor: 'pointer' }}>
                    {part}
                </Anchor>
            );
        });

        return items;
    }, [currentPath, handleBreadcrumbClick]);

    const renderImageCard = useCallback((image: HistoryImageItem, index: number) => {
        const selectionId = getHistorySelectionId(image);
        const canUseImageActions = canGenerate && isImageMedia(image);

        return (
            <ImageCard
                key={selectionId}
                image={image}
                onSelect={() => setSelectedImage(image)}
                onToggleStar={canStar ? () => toggleStar(image) : undefined}
                onDelete={canDelete ? () => deleteImage(image) : undefined}
                isHovered={hoveredIndex === index}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
                isSelectable={isSelectionMode}
                isSelected={isSelected(selectionId)}
                onSelectionToggle={(event) => handleSelectionToggle(selectionId, event)}
                onReuseParams={canUseImageActions ? () => handleReuseParams(image) : undefined}
                onUseAsInitImage={canUseImageActions ? () => handleUseAsInitImage(image) : undefined}
                onUpscale={canUseImageActions ? () => handleUpscale(image.src, image.metadata) : undefined}
            />
        );
    }, [
        canDelete,
        canGenerate,
        canStar,
        deleteImage,
        handleReuseParams,
        handleSelectionToggle,
        handleUpscale,
        handleUseAsInitImage,
        hoveredIndex,
        isSelected,
        isSelectionMode,
        toggleStar,
    ]);

    const showEmptyState = !historyLoading && visibleImages.length === 0 && historyFolders.length === 0;

    return (
        <PageScaffold
            header={
                <>
                    <SectionHero
                        className="fx-reveal fx-gradient-sweep"
                        title="History"
                        subtitle="Browse your full generation history with server-side search, sorting, and export."
                        badges={[
                            {
                                label: historyHasMore
                                    ? `${visibleImages.length}/${historyTotalCount} loaded`
                                    : `${historyTotalCount} items`,
                                tone: 'secondary',
                            },
                            ...(preferences.starredOnly ? [{ label: 'starred only', tone: 'warning' as const }] : []),
                            ...(isSelectionMode ? [{ label: `${selectionCount} selected`, tone: 'success' as const }] : []),
                        ]}
                        rightSection={
                            <Group wrap="wrap" gap="xs" justify="flex-end">
                                <SwarmSegmentedControl
                                    value={preferences.viewMode}
                                    onChange={(value) => updatePreferences({ viewMode: value as HistoryPreferences['viewMode'] })}
                                    data={[
                                        { value: 'gallery', label: <Group gap={4}><IconLayoutGrid size={14} /> Gallery</Group> },
                                        { value: 'folders', label: <Group gap={4}><IconFolder size={14} /> Folders</Group> },
                                    ]}
                                />
                                {!isSelectionMode ? (
                                    <SwarmButton
                                        tone="secondary"
                                        emphasis="ghost"
                                        size="xs"
                                        leftSection={<IconCheckbox size={16} />}
                                        onClick={enterSelectionMode}
                                    >
                                        Select
                                    </SwarmButton>
                                ) : (
                                    <Group gap="xs">
                                        <Tooltip label="Select All Visible">
                                            <SwarmActionIcon
                                                tone="secondary"
                                                emphasis="ghost"
                                                label="Select all visible history items"
                                                onClick={() => selectAll(allImageIds)}
                                            >
                                                <IconSelectAll size={18} />
                                            </SwarmActionIcon>
                                        </Tooltip>
                                        {canStar && (
                                            <>
                                                <Tooltip label="Star Selected">
                                                    <SwarmActionIcon
                                                        tone="warning"
                                                        emphasis="ghost"
                                                        label="Star selected items"
                                                        onClick={() => handleBulkStar(true)}
                                                        disabled={selectionCount === 0}
                                                    >
                                                        <IconStar size={18} />
                                                    </SwarmActionIcon>
                                                </Tooltip>
                                                <Tooltip label="Unstar Selected">
                                                    <SwarmActionIcon
                                                        tone="secondary"
                                                        emphasis="ghost"
                                                        label="Unstar selected items"
                                                        onClick={() => handleBulkStar(false)}
                                                        disabled={selectionCount === 0}
                                                    >
                                                        <IconStar size={18} />
                                                    </SwarmActionIcon>
                                                </Tooltip>
                                            </>
                                        )}
                                        {canDelete && (
                                            <Tooltip label="Delete Selected">
                                                <SwarmActionIcon
                                                    tone="danger"
                                                    emphasis="ghost"
                                                    label="Delete selected items"
                                                    onClick={handleBulkDelete}
                                                    disabled={selectionCount === 0}
                                                >
                                                    <IconTrash size={18} />
                                                </SwarmActionIcon>
                                            </Tooltip>
                                        )}
                                        <Tooltip label="Download Selected">
                                            <SwarmActionIcon
                                                tone="primary"
                                                emphasis="ghost"
                                                label="Download selected items"
                                                onClick={handleBulkDownload}
                                                disabled={selectionCount === 0}
                                            >
                                                <IconDownload size={18} />
                                            </SwarmActionIcon>
                                        </Tooltip>
                                        <Tooltip label={selectionCount > 0 ? 'Export Selected as ZIP' : 'Export Filtered Result as ZIP'}>
                                            <SwarmActionIcon
                                                tone="primary"
                                                emphasis="ghost"
                                                label="Export history ZIP"
                                                onClick={handleExportZip}
                                                disabled={selectionCount === 0 && visibleImages.length === 0}
                                            >
                                                <IconDownload size={18} />
                                            </SwarmActionIcon>
                                        </Tooltip>
                                        <Tooltip label="Compare (Select 2 Images)">
                                            <SwarmActionIcon
                                                tone="primary"
                                                emphasis="ghost"
                                                label="Compare selected items"
                                                onClick={handleCompare}
                                                disabled={selectionCount !== 2}
                                            >
                                                <IconColumns size={18} />
                                            </SwarmActionIcon>
                                        </Tooltip>
                                        <SwarmButton
                                            tone="secondary"
                                            emphasis="ghost"
                                            size="xs"
                                            leftSection={<IconX size={16} />}
                                            onClick={exitSelectionMode}
                                        >
                                            Exit
                                        </SwarmButton>
                                    </Group>
                                )}
                                <Tooltip label="Refresh History">
                                    <SwarmActionIcon
                                        tone="secondary"
                                        emphasis="ghost"
                                        label="Refresh history"
                                        onClick={() => void historyQueryResult.refetch()}
                                    >
                                        <IconRefresh size={18} />
                                    </SwarmActionIcon>
                                </Tooltip>
                                {canOpenFolder && (
                                    <Tooltip label="Open Image Folder in File Explorer">
                                        <SwarmActionIcon
                                            tone="secondary"
                                            emphasis="ghost"
                                            label="Open image folder in file explorer"
                                            onClick={() => {
                                                const target = selectedImage || visibleImages[0];
                                                if (target) {
                                                    void openFolder(target.src);
                                                }
                                            }}
                                            disabled={visibleImages.length === 0}
                                        >
                                            <IconFolderOpen size={18} />
                                        </SwarmActionIcon>
                                    </Tooltip>
                                )}
                                {canImport && (
                                    <Tooltip label="Import Image to History">
                                        <SwarmActionIcon
                                            tone="primary"
                                            emphasis="ghost"
                                            label="Import image into history"
                                            onClick={handleImportImage}
                                        >
                                            <IconUpload size={18} />
                                        </SwarmActionIcon>
                                    </Tooltip>
                                )}
                                <SwarmButton
                                    tone="secondary"
                                    emphasis="soft"
                                    size="xs"
                                    leftSection={<IconFolder size={16} />}
                                    onClick={handleUseFolderForNextBatch}
                                    disabled={!currentPath || isReservedHistoryFolderPath(currentPath)}
                                >
                                    Use Folder For Next Batch
                                </SwarmButton>
                                <SwarmButton
                                    tone="secondary"
                                    emphasis="soft"
                                    size="xs"
                                    onClick={handleSaveCurrentView}
                                >
                                    Save View
                                </SwarmButton>
                                <SwarmButton
                                    tone="secondary"
                                    emphasis="soft"
                                    size="xs"
                                    onClick={handleAddSelectedToCollection}
                                    disabled={selectionCount === 0}
                                >
                                    Add To Collection
                                </SwarmButton>
                                <SwarmButton
                                    tone="secondary"
                                    emphasis="soft"
                                    size="xs"
                                    onClick={() => setLineageModalOpen(true)}
                                    disabled={!selectedLineage}
                                >
                                    Lineage
                                </SwarmButton>
                            </Group>
                        }
                    />

                    <Paper mt="xs" p="sm" radius="md" withBorder>
                        <Group wrap="wrap" gap="sm">
                            <TextInput
                                placeholder="Search path, prompt, model, seed, resolution, or metadata..."
                                leftSection={<IconSearch size={16} />}
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.currentTarget.value)}
                                style={{ flex: 1, minWidth: 260 }}
                            />
                            <SwarmSegmentedControl
                                value={preferences.sortBy}
                                onChange={(value) => updatePreferences({ sortBy: value as HistoryPreferences['sortBy'] })}
                                data={[
                                    { value: 'Date', label: 'Date' },
                                    { value: 'Name', label: 'Name' },
                                ]}
                            />
                            <Tooltip label={preferences.sortReverse ? 'Ascending' : 'Descending'}>
                                <SwarmActionIcon
                                    tone="secondary"
                                    emphasis="ghost"
                                    label="Toggle sort direction"
                                    onClick={() => updatePreferences({ sortReverse: !preferences.sortReverse })}
                                >
                                    {preferences.sortReverse ? <IconArrowUp size={18} /> : <IconArrowDown size={18} />}
                                </SwarmActionIcon>
                            </Tooltip>
                            <Select
                                value={preferences.mediaType}
                                onChange={(value) => updatePreferences({ mediaType: (value || 'all') as HistoryMediaType })}
                                data={[
                                    { value: 'all', label: 'All Media' },
                                    { value: 'image', label: 'Images' },
                                    { value: 'video', label: 'Videos' },
                                    { value: 'audio', label: 'Audio' },
                                    { value: 'html', label: 'HTML' },
                                ]}
                                style={{ minWidth: 160 }}
                            />
                            <Chip
                                checked={preferences.starredOnly}
                                onChange={(checked) => updatePreferences({ starredOnly: checked })}
                            >
                                Starred Only
                            </Chip>
                            {preferences.viewMode === 'gallery' && (
                                <Chip
                                    checked={preferences.currentFolderOnly}
                                    onChange={(checked) => updatePreferences({ currentFolderOnly: checked })}
                                    disabled={!currentPath}
                                >
                                    Current Folder Only
                                </Chip>
                            )}
                        </Group>
                    </Paper>

                    {savedViews.length > 0 && (
                        <Paper mt="xs" p="sm" radius="md" withBorder>
                            <Group gap="xs" wrap="wrap">
                                <Text size="xs" fw={700} tt="uppercase" c="dimmed">
                                    Saved Views
                                </Text>
                                {savedViews.slice(0, 8).map((view) => (
                                    <Badge
                                        key={view.id}
                                        variant={activeViewId === view.id ? 'filled' : 'light'}
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => handleApplySavedView(view.id)}
                                    >
                                        {view.name}
                                    </Badge>
                                ))}
                            </Group>
                        </Paper>
                    )}

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={handleFileSelected}
                    />

                    {(preferences.viewMode === 'folders' || currentPath) && (
                        <Breadcrumbs separator="/" mt="xs" px="xs">
                            {getBreadcrumbs()}
                        </Breadcrumbs>
                    )}
                </>
            }
        >
            <div style={{ height: '100%', overflow: 'hidden', padding: 16 }}>
                {historyLoading ? (
                    <SkeletonGrid count={12} columns={6} imageHeight={180} />
                ) : historyError && visibleImages.length === 0 ? (
                    <Center h="100%">
                        <Stack align="center" gap="sm">
                            <Text c="red.4">{historyError}</Text>
                            <SwarmButton tone="secondary" onClick={() => void historyQueryResult.refetch()}>
                                Retry
                            </SwarmButton>
                        </Stack>
                    </Center>
                ) : (
                    <Stack gap="md" style={{ height: '100%' }}>
                        {preferences.viewMode === 'folders' && historyFolders.length > 0 && (
                            <Stack gap="xs">
                                <Text size="sm" fw={600} tt="uppercase" style={{ color: 'var(--theme-gray-1)' }}>
                                    Folders
                                </Text>
                                <Grid gutter="xs">
                                    {historyFolders.map((folder) => (
                                        <Grid.Col key={folder} span={{ base: 6, xs: 4, sm: 3, md: 2 }}>
                                            <Card
                                                component="button"
                                                type="button"
                                                className="swarm-folder-tile"
                                                padding="sm"
                                                radius="sm"
                                                withBorder
                                                style={{
                                                    cursor: 'pointer',
                                                    backgroundColor: 'var(--theme-gray-7)',
                                                }}
                                                onClick={() => handleFolderClick(folder)}
                                            >
                                                <Group gap="xs">
                                                    <IconFolderFilled size={20} color="var(--theme-brand)" />
                                                    <Text size="sm" style={{ color: 'var(--theme-gray-1)' }} truncate>{folder}</Text>
                                                </Group>
                                            </Card>
                                        </Grid.Col>
                                    ))}
                                </Grid>
                            </Stack>
                        )}

                        {showEmptyState ? (
                            <Center style={{ flex: 1 }}>
                                <Stack align="center" gap="sm">
                                    <Text style={{ color: 'var(--theme-gray-2)' }}>
                                        {debouncedSearchQuery ? 'No history items matched the current filters.' : 'No history items found.'}
                                    </Text>
                                    {(debouncedSearchQuery || preferences.starredOnly || preferences.mediaType !== 'all') && (
                                        <SwarmButton
                                            tone="secondary"
                                            emphasis="ghost"
                                            onClick={() => {
                                                setSearchQuery('');
                                                updatePreferences({
                                                    starredOnly: false,
                                                    mediaType: 'all',
                                                });
                                            }}
                                        >
                                            Clear Filters
                                        </SwarmButton>
                                    )}
                                </Stack>
                            </Center>
                        ) : (
                            <>
                                <div style={{ flex: 1, minHeight: 0 }}>
                                    <VirtualGrid
                                        items={visibleImages}
                                        columns={{ base: 2, xs: 3, sm: 4, md: 5, lg: 6 }}
                                        rowHeight={220}
                                        containerHeight="100%"
                                        gap={16}
                                        overscan={4}
                                        emptyState={
                                            <Center h={220}>
                                                <Text style={{ color: 'var(--theme-gray-2)' }}>No items to display</Text>
                                            </Center>
                                        }
                                        renderItem={(image, index) => renderImageCard(image, index)}
                                    />
                                </div>

                                {(historyHasMore || historyLoadingMore || historyTruncated) && (
                                    <Center pt="xs">
                                        <SwarmButton
                                            tone="secondary"
                                            emphasis="ghost"
                                            leftSection={historyLoadingMore ? <Loader size={14} /> : <IconRefresh size={14} />}
                                            onClick={() => void handleLoadMore()}
                                            disabled={historyLoadingMore}
                                        >
                                            {historyLoadingMore ? 'Loading...' : 'Load More'}
                                        </SwarmButton>
                                    </Center>
                                )}
                            </>
                        )}
                    </Stack>
                )}
            </div>

            <ImageDetailModal
                image={selectedImage}
                onClose={closeSelectedImage}
                onToggleStar={canStar ? (image) => { void toggleStar(image); } : undefined}
                onDelete={canDelete ? (image) => { void deleteImage(image); closeSelectedImage(); } : undefined}
                onUpscale={canGenerate ? handleUpscale : undefined}
                onReuseParams={canGenerate ? (image) => handleReuseParams(image as HistoryImageItem) : undefined}
                onEdit={canGenerate ? (image) => handleEdit(image as HistoryImageItem) : undefined}
                onUseAsInitImage={canGenerate ? (image) => handleUseAsInitImage(image as HistoryImageItem) : undefined}
            />

            <ImageUpscaler
                opened={upscaleModal}
                onClose={() => setUpscaleModal(false)}
                imagePath={upscaleImage}
                imageMetadata={upscaleImageMetadata}
                onUpscaleComplete={() => {
                    notifications.show({
                        title: 'Upscale Complete',
                        message: 'Image has been upscaled successfully.',
                        color: 'green',
                    });
                    void historyQueryResult.refetch();
                }}
            />

            <ImageComparison
                leftImage={comparisonImages[0]}
                rightImage={comparisonImages[1]}
                opened={comparisonModal}
                onClose={() => setComparisonModal(false)}
            />

            <Modal
                opened={lineageModalOpen}
                onClose={() => setLineageModalOpen(false)}
                title="Generation Lineage"
                size="md"
            >
                {selectedLineage ? (
                    <Stack gap="sm">
                        <Text size="sm" c="dimmed">
                            Trace the selected item back into the generate and workflow surfaces.
                        </Text>
                        <Paper p="sm" withBorder>
                            <Text size="xs" fw={700} tt="uppercase" c="dimmed">Model</Text>
                            <Text>{selectedLineage.model || 'Unknown'}</Text>
                        </Paper>
                        <Paper p="sm" withBorder>
                            <Text size="xs" fw={700} tt="uppercase" c="dimmed">Prompt</Text>
                            <Text>{selectedLineage.prompt || 'No prompt metadata available'}</Text>
                        </Paper>
                        <Group grow>
                            <Paper p="sm" withBorder>
                                <Text size="xs" fw={700} tt="uppercase" c="dimmed">Seed</Text>
                                <Text>{selectedLineage.seed || 'Unknown'}</Text>
                            </Paper>
                            <Paper p="sm" withBorder>
                                <Text size="xs" fw={700} tt="uppercase" c="dimmed">Resolution</Text>
                                <Text>{selectedLineage.resolution || 'Unknown'}</Text>
                            </Paper>
                        </Group>
                        <Group justify="flex-end">
                            <SwarmButton
                                tone="secondary"
                                emphasis="ghost"
                                onClick={() => setLineageModalOpen(false)}
                            >
                                Close
                            </SwarmButton>
                            {selectedImage && (
                                <SwarmButton
                                    tone="secondary"
                                    emphasis="soft"
                                    onClick={() => {
                                        void handleSendToWorkflow(selectedImage);
                                        setLineageModalOpen(false);
                                    }}
                                >
                                    Send To Workflow
                                </SwarmButton>
                            )}
                            {selectedImage && (
                                <SwarmButton
                                    tone="primary"
                                    onClick={() => {
                                        void handleUseAsInitImage(selectedImage);
                                        setLineageModalOpen(false);
                                    }}
                                >
                                    Send To Generate
                                </SwarmButton>
                            )}
                        </Group>
                    </Stack>
                ) : (
                    <Text c="dimmed">Select an image to inspect lineage.</Text>
                )}
            </Modal>
        </PageScaffold>
    );
}
