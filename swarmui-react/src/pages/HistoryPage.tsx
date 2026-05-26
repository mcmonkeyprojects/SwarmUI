import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense, type ChangeEvent } from 'react';
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
    Breadcrumbs,
    Anchor,
    Select,
    Chip,
    Paper,
    Modal,
} from '@mantine/core';
import {
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
import { ErrorBoundary, type ErrorBoundaryFallbackState } from '../components/ErrorBoundary';
import { ImageCard } from '../components/ImageCard';
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
import { SectionHero, SwarmActionIcon, SwarmButton, SwarmSearchInput, SwarmSegmentedControl, SwarmTooltip } from '../components/ui';
import { useDebouncedState } from '../hooks/useDebounce';
import { useMotionPerformancePolicy } from '../hooks/useMotionPerformancePolicy';
import { queryClient, queryKeys } from '../api/queryClient';
import { isHistoryRouteStateEqual, normalizeHistoryRouteState, serializeHistoryRouteState } from '../routing/appRoute';
import {
    DEFAULT_HISTORY_PREFERENCES,
    HISTORY_PAGE_SIZE,
    getHistoryFilename,
    getHistoryMetadataSummary,
    getHistoryRelativePath,
    getHistorySelectionId,
    isImageMedia,
    mergeHistoryItems,
    readHistoryPreferences,
    resolveHistoryItems,
    writeHistoryPreferences,
    type HistoryPreferences,
} from '../features/history/historyUtils';
import { useHistoryWorkspaceStore } from '../stores/historyWorkspaceStore';
import { useCreativeWorkspaceStore } from '../stores/creativeWorkspaceStore';
import { useWorkflowWorkspaceStore } from '../stores/workflowWorkspaceStore';

const ImageUpscaler = lazy(() =>
    import('../components/ImageUpscaler').then((module) => ({ default: module.ImageUpscaler }))
);
const ImageDetailModal = lazy(() =>
    import('../components/ImageDetailModal').then((module) => ({ default: module.ImageDetailModal }))
);
const ImageComparison = lazy(() =>
    import('../components/ImageComparison').then((module) => ({ default: module.ImageComparison }))
);

interface HistoryPageProps {
    routeState?: HistoryRouteState;
}

interface HistoryRecoveryState {
    title: string;
    message: string;
    tone: 'yellow' | 'orange';
}

interface HistoryPageContentProps extends HistoryPageProps {
    recoveryKey: number;
}

export function HistoryPage({ routeState }: HistoryPageProps) {
    const navigateToHistory = useNavigationStore((state) => state.navigateToHistory);
    const [recoveryKey, setRecoveryKey] = useState(0);

    const requestRemount = useCallback(() => {
        setRecoveryKey((value) => value + 1);
    }, []);

    const handleResetHistoryView = useCallback(() => {
        navigateToHistory({
            path: null,
            query: null,
            sortBy: DEFAULT_HISTORY_PREFERENCES.sortBy,
            sortReverse: DEFAULT_HISTORY_PREFERENCES.sortReverse,
            starredOnly: DEFAULT_HISTORY_PREFERENCES.starredOnly,
            mediaType: DEFAULT_HISTORY_PREFERENCES.mediaType,
            currentFolderOnly: DEFAULT_HISTORY_PREFERENCES.currentFolderOnly,
            image: null,
            viewId: null,
        });
    }, [navigateToHistory]);

    const renderHistoryFallback = useCallback((fallbackState: ErrorBoundaryFallbackState) => (
        <Center h="100%" p="xl">
            <Paper p="xl" radius="lg" withBorder maw={720}>
                <Stack gap="md">
                    <Stack gap="xs">
                        <Text fw={700} size="lg">History needs to recover</Text>
                        <Text c="dimmed" size="sm">
                            History hit an unexpected render problem while restoring the current view. You can retry the page,
                            reset the History filters and route, or reload the application if the same view keeps failing.
                        </Text>
                        <Text size="xs" c="dimmed">
                            {fallbackState.error?.toString() || 'Unknown History error'}
                        </Text>
                    </Stack>
                    <Group gap="sm" wrap="wrap">
                        <SwarmButton tone="primary" onClick={fallbackState.tryAgain}>
                            Retry History
                        </SwarmButton>
                        <SwarmButton
                            tone="secondary"
                            emphasis="soft"
                            onClick={() => {
                                handleResetHistoryView();
                                fallbackState.tryAgain();
                            }}
                        >
                            Reset History View
                        </SwarmButton>
                        <SwarmButton tone="secondary" emphasis="ghost" onClick={fallbackState.copyDetails}>
                            Copy Crash Details
                        </SwarmButton>
                        <SwarmButton tone="secondary" emphasis="ghost" onClick={fallbackState.reload}>
                            Reload Application
                        </SwarmButton>
                    </Group>
                </Stack>
            </Paper>
        </Center>
    ), [handleResetHistoryView]);

    return (
        <ErrorBoundary onRecover={requestRemount} renderFallback={renderHistoryFallback}>
            <HistoryPageContent key={recoveryKey} routeState={routeState} recoveryKey={recoveryKey} />
        </ErrorBoundary>
    );
}

function HistoryPageContent({ routeState, recoveryKey }: HistoryPageContentProps) {
    const { setParams } = useGenerationStore();
    const { setEnableInitImage } = useInitImageToggle();
    const openCanvasWorkflow = useCanvasWorkflowStore((state) => state.openSession);
    const { navigateToGenerate, navigateToHistory } = useNavigationStore();
    const setWorkflowHandoff = useWorkflowWorkspaceStore((state) => state.setHandoff);
    const navigateToWorkflows = useNavigationStore((state) => state.navigateToWorkflows);
    const permissions = useSessionStore((state) => state.permissions);
    const generationPhase = useWebSocketStore((state) => state.generation.phase);
    const generatedImageCount = useWebSocketStore((state) => state.generation.images.length);
    const { savedViews, activeViewId, saveView, setActiveView, addToCollection } = useHistoryWorkspaceStore();
    const { activeProjectId, ensureActiveProject, createReviewSet } = useCreativeWorkspaceStore();
    const initialRouteState = normalizeHistoryRouteState(routeState);

    const [preferences, setPreferences] = useState<HistoryPreferences>(() => ({
        ...DEFAULT_HISTORY_PREFERENCES,
        ...readHistoryPreferences(),
        sortBy: initialRouteState.sortBy ?? DEFAULT_HISTORY_PREFERENCES.sortBy,
        sortReverse: initialRouteState.sortReverse ?? DEFAULT_HISTORY_PREFERENCES.sortReverse,
        starredOnly: initialRouteState.starredOnly ?? DEFAULT_HISTORY_PREFERENCES.starredOnly,
        mediaType: initialRouteState.mediaType ?? DEFAULT_HISTORY_PREFERENCES.mediaType,
        currentFolderOnly: initialRouteState.currentFolderOnly ?? DEFAULT_HISTORY_PREFERENCES.currentFolderOnly,
    }));
    const [currentPath, setCurrentPath] = useState(initialRouteState.path || '');
    const [selectedImage, setSelectedImage] = useState<HistoryImageItem | null>(null);
    const [searchQuery, setSearchQuery, debouncedSearchQuery] = useDebouncedState(initialRouteState.query || '', 250);
    const [upscaleModal, setUpscaleModal] = useState(false);
    const [upscaleImage, setUpscaleImage] = useState('');
    const [upscaleImageMetadata, setUpscaleImageMetadata] = useState<string | Record<string, unknown> | null>(null);
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const [comparisonModal, setComparisonModal] = useState(false);
    const [comparisonImages, setComparisonImages] = useState<[HistoryImageItem | null, HistoryImageItem | null]>([null, null]);
    const [lineageModalOpen, setLineageModalOpen] = useState(false);
    const [historyRecoveryState, setHistoryRecoveryState] = useState<HistoryRecoveryState | null>(null);
    const [historyRecoveryNonce, setHistoryRecoveryNonce] = useState(0);

    const completedGenerationRef = useRef(0);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const lastHistoryStallNotificationRef = useRef(0);
    const routeWriteSuppressedRef = useRef(false);
    const routeWriteResumeTimeoutRef = useRef<number | null>(null);
    const lastAppliedRouteStateKeyRef = useRef<string | null>(null);
    const historyFetchStartedAtRef = useRef<number | null>(null);

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

    const historyListQueryKey = useMemo(
        () => ['history', 'list', historyQuery, recoveryKey, historyRecoveryNonce] as const,
        [historyQuery, historyRecoveryNonce, recoveryKey]
    );

    const historyQueryResult = useInfiniteQuery({
        queryKey: historyListQueryKey,
        initialPageParam: null as string | null,
        placeholderData: () => undefined,
        queryFn: async ({ pageParam }) => swarmClient.listImagesV2({
            ...historyQuery,
            cursor: (pageParam as string | null) ?? null,
        }),
        getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
        staleTime: 2 * 60 * 1000,
        gcTime: 20 * 60 * 1000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });

    const historyDataPages = historyQueryResult.data?.pages;
    const historyPages = useMemo(() => historyDataPages ?? [], [historyDataPages]);
    const refetchHistory = historyQueryResult.refetch;
    const fetchNextHistoryPage = historyQueryResult.fetchNextPage;
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
    const motionPolicy = useMotionPerformancePolicy({
        isGenerating: generationPhase !== 'idle' && generationPhase !== 'complete',
        itemCount: visibleImages.length,
        largeListThreshold: 24,
    });

    useEffect(() => {
        writeHistoryPreferences(preferences);
    }, [preferences]);

    const updatePreferences = useCallback((next: Partial<HistoryPreferences>) => {
        setPreferences((prev) => {
            for (const key of Object.keys(next) as Array<keyof HistoryPreferences>) {
                if (next[key] !== undefined && next[key] !== prev[key]) {
                    return { ...prev, ...next };
                }
            }
            return prev;
        });
    }, []);

    const localRouteState = useMemo<HistoryRouteState>(() => ({
        path: currentPath || null,
        query: searchQuery || null,
        sortBy: preferences.sortBy,
        sortReverse: preferences.sortReverse,
        starredOnly: preferences.starredOnly,
        mediaType: preferences.mediaType,
        currentFolderOnly: preferences.currentFolderOnly,
        image: selectedImage ? getHistoryRelativePath(selectedImage) : null,
        viewId: activeViewId,
    }), [
        activeViewId,
        currentPath,
        preferences.currentFolderOnly,
        preferences.mediaType,
        preferences.sortBy,
        preferences.sortReverse,
        preferences.starredOnly,
        searchQuery,
        selectedImage,
    ]);
    const normalizedRouteState = useMemo(() => normalizeHistoryRouteState(routeState), [routeState]);
    const comparableLocalRouteState = useMemo<HistoryRouteState>(() => ({
        ...localRouteState,
        image: null,
    }), [localRouteState]);
    const comparableNormalizedRouteState = useMemo<HistoryRouteState>(() => ({
        ...normalizedRouteState,
        image: null,
    }), [normalizedRouteState]);
    const comparableNormalizedRouteStateKey = useMemo(
        () => serializeHistoryRouteState(comparableNormalizedRouteState),
        [comparableNormalizedRouteState]
    );

    useEffect(() => {
        queueMicrotask(() => {
            clearSelection();
            setSelectedImage(null);
        });
    }, [clearSelection, historyListQueryKey]);

    useEffect(() => {
        if (
            generationPhase === 'complete'
            && generatedImageCount > 0
            && generatedImageCount !== completedGenerationRef.current
            && document.visibilityState === 'visible'
            && !historyQueryResult.isFetching
        ) {
            completedGenerationRef.current = generatedImageCount;
            void refetchHistory();
        }
    }, [generationPhase, generatedImageCount, historyQueryResult.isFetching, refetchHistory]);

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
            void refetchHistory();
        },
        onDeleted: () => {
            setSelectedImage(null);
            clearSelection();
            void queryClient.invalidateQueries({ queryKey: queryKeys.images.all });
            void refetchHistory();
        },
        onImageAdded: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.images.all });
            void refetchHistory();
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
            queueMicrotask(() => {
                setSelectedImage(match);
            });
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

    useEffect(() => {
        if (routeWriteResumeTimeoutRef.current !== null) {
            window.clearTimeout(routeWriteResumeTimeoutRef.current);
            routeWriteResumeTimeoutRef.current = null;
        }

        if (lastAppliedRouteStateKeyRef.current === comparableNormalizedRouteStateKey) {
            return;
        }
        lastAppliedRouteStateKeyRef.current = comparableNormalizedRouteStateKey;

        if (isHistoryRouteStateEqual(comparableNormalizedRouteState, comparableLocalRouteState)) {
            routeWriteSuppressedRef.current = false;
            return;
        }

        routeWriteSuppressedRef.current = true;
        let cancelled = false;

        queueMicrotask(() => {
            if (cancelled) {
                return;
            }

            if (normalizedRouteState.path !== (currentPath || null)) {
                setCurrentPath(normalizedRouteState.path || '');
            }
            if (normalizedRouteState.query !== (searchQuery || null)) {
                setSearchQuery(normalizedRouteState.query || '');
            }
            if ((normalizedRouteState.viewId || null) !== activeViewId) {
                setActiveView(normalizedRouteState.viewId || null);
            }

            setPreferences((prev) => {
                const nextPreferences = {
                    ...prev,
                    sortBy: normalizedRouteState.sortBy ?? prev.sortBy,
                    sortReverse: normalizedRouteState.sortReverse ?? prev.sortReverse,
                    starredOnly: normalizedRouteState.starredOnly ?? prev.starredOnly,
                    mediaType: normalizedRouteState.mediaType ?? prev.mediaType,
                    currentFolderOnly: normalizedRouteState.currentFolderOnly ?? prev.currentFolderOnly,
                };
                if (
                    nextPreferences.sortBy === prev.sortBy
                    && nextPreferences.sortReverse === prev.sortReverse
                    && nextPreferences.starredOnly === prev.starredOnly
                    && nextPreferences.mediaType === prev.mediaType
                    && nextPreferences.currentFolderOnly === prev.currentFolderOnly
                ) {
                    return prev;
                }
                return nextPreferences;
            });

            routeWriteResumeTimeoutRef.current = window.setTimeout(() => {
                routeWriteSuppressedRef.current = false;
                routeWriteResumeTimeoutRef.current = null;
            }, 0);
        });

        return () => {
            cancelled = true;
            if (routeWriteResumeTimeoutRef.current !== null) {
                window.clearTimeout(routeWriteResumeTimeoutRef.current);
                routeWriteResumeTimeoutRef.current = null;
            }
            routeWriteSuppressedRef.current = false;
        };
    }, [
        activeViewId,
        comparableLocalRouteState,
        comparableNormalizedRouteState,
        comparableNormalizedRouteStateKey,
        currentPath,
        normalizedRouteState.currentFolderOnly,
        normalizedRouteState.mediaType,
        normalizedRouteState.path,
        normalizedRouteState.query,
        normalizedRouteState.sortBy,
        normalizedRouteState.sortReverse,
        normalizedRouteState.starredOnly,
        normalizedRouteState.viewId,
        setActiveView,
        setSearchQuery,
        searchQuery,
    ]);

    useEffect(() => {
        if (!historyQueryResult.isFetching) {
            historyFetchStartedAtRef.current = null;
            return;
        }

        if (historyFetchStartedAtRef.current === null) {
            historyFetchStartedAtRef.current = performance.now();
        }

        const softTimeoutId = window.setTimeout(() => {
            const startedAt = historyFetchStartedAtRef.current;
            const elapsedSeconds = startedAt === null ? 8 : Math.max(8, Math.round((performance.now() - startedAt) / 1000));
            const message = `History has been updating for ${elapsedSeconds} seconds. Retry the request if the list is stale, or reset sort if this started after changing direction.`;
            setHistoryRecoveryState({
                title: 'History is taking longer than expected',
                message,
                tone: 'yellow',
            });
            notifications.show({
                title: 'History is still loading',
                message,
                color: 'yellow',
            });
        }, 8000);
        const hardTimeoutId = window.setTimeout(() => {
            const startedAt = historyFetchStartedAtRef.current;
            const elapsedSeconds = startedAt === null ? 16 : Math.max(16, Math.round((performance.now() - startedAt) / 1000));
            const message = `History still looks stuck after ${elapsedSeconds} seconds. A retry starts a fresh request, and Reset History View clears filters and route state if the current view keeps hanging.`;
            setHistoryRecoveryState({
                title: 'History may be stuck',
                message,
                tone: 'orange',
            });
        }, 16000);

        return () => {
            window.clearTimeout(softTimeoutId);
            window.clearTimeout(hardTimeoutId);
        };
    }, [historyQueryResult.isFetching, historyListQueryKey]);

    useEffect(() => {
        if (historyQueryResult.isFetching || historyError) {
            return;
        }

        const timeoutId = window.setTimeout(() => setHistoryRecoveryState(null), 0);
        return () => window.clearTimeout(timeoutId);
    }, [historyError, historyQueryResult.isFetching, historyListQueryKey]);

    useEffect(() => {
        let expected = performance.now() + 2000;

        const intervalId = window.setInterval(() => {
            const now = performance.now();
            const delay = now - expected;
            expected = now + 2000;

            if (document.visibilityState !== 'visible' || delay < 5000) {
                return;
            }

            const lastNotificationAt = lastHistoryStallNotificationRef.current;
            if (now - lastNotificationAt < 30000) {
                return;
            }

            lastHistoryStallNotificationRef.current = now;
            const message = `History recovered after a ${Math.round(delay / 1000)} second UI pause. The list was refreshed in case the previous request was interrupted.`;
            setHistoryRecoveryState({
                title: 'History recovered after a long pause',
                message,
                tone: 'yellow',
            });
            notifications.show({
                title: 'History recovered',
                message,
                color: 'yellow',
            });
            void refetchHistory();
        }, 2000);

        return () => window.clearInterval(intervalId);
    }, [refetchHistory]);

    const handleRetryHistory = useCallback(async () => {
        setHistoryRecoveryState(null);
        historyFetchStartedAtRef.current = performance.now();
        await queryClient.cancelQueries({ queryKey: historyListQueryKey, exact: true });
        queryClient.removeQueries({ queryKey: historyListQueryKey, exact: true });
        setHistoryRecoveryNonce((value) => value + 1);
    }, [historyListQueryKey]);

    const handleResetHistorySort = useCallback(() => {
        setHistoryRecoveryState(null);
        setActiveView(null);
        updatePreferences({
            sortBy: DEFAULT_HISTORY_PREFERENCES.sortBy,
            sortReverse: DEFAULT_HISTORY_PREFERENCES.sortReverse,
        });
        setHistoryRecoveryNonce((value) => value + 1);
    }, [setActiveView, updatePreferences]);

    const handleResetHistoryView = useCallback(async () => {
        setHistoryRecoveryState(null);
        setSelectedImage(null);
        clearSelection();
        setActiveView(null);
        setCurrentPath('');
        setSearchQuery('');
        setPreferences((prev) => ({
            ...DEFAULT_HISTORY_PREFERENCES,
            viewMode: prev.viewMode,
        }));
        await queryClient.cancelQueries({ queryKey: historyListQueryKey, exact: true });
        queryClient.removeQueries({ queryKey: historyListQueryKey, exact: true });
        setHistoryRecoveryNonce((value) => value + 1);
    }, [clearSelection, historyListQueryKey, setActiveView, setSearchQuery]);

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

    const handleCreateReviewSet = useCallback(() => {
        if (selectedImages.length === 0) {
            return;
        }
        const projectId = activeProjectId ?? ensureActiveProject();
        const name = window.prompt('Review set name:', 'History Review Set');
        if (!name?.trim()) {
            return;
        }
        createReviewSet({
            name: name.trim(),
            projectId,
            description: 'Created from selected History items.',
            items: selectedImages.map((image) => {
                const summary = getHistoryMetadataSummary(image);
                return {
                    imageId: getHistorySelectionId(image),
                    imageSrc: image.src,
                    state: 'shortlisted' as const,
                    rating: null,
                    note: '',
                    provenance: {
                        source: 'history' as const,
                        projectId,
                        prompt: summary.prompt,
                        model: summary.model,
                        parentImageId: getHistorySelectionId(image),
                        capturedAt: Date.now(),
                    },
                };
            }),
        });
        notifications.show({
            title: 'Review Set Created',
            message: `${selectedImages.length} item(s) added to ${name.trim()}.`,
            color: 'teal',
        });
    }, [activeProjectId, createReviewSet, ensureActiveProject, selectedImages]);

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
        await fetchNextHistoryPage();
    }, [fetchNextHistoryPage, historyHasMore, historyLoadingMore]);

    const handleBulkDelete = useCallback(async () => {
        if (selectedImages.length === 0) {
            return;
        }

        try {
            for (const image of selectedImages) {
                await swarmClient.deleteImage(getHistoryRelativePath(image));
            }

            clearSelection();
            await refetchHistory();

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
    }, [selectedImages, clearSelection, refetchHistory]);

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

            await refetchHistory();

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
    }, [selectedImages, refetchHistory]);

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
        if (normalizedRouteState.image && !selectedImage) {
            return;
        }
        if (routeWriteSuppressedRef.current) {
            return;
        }
        if (isHistoryRouteStateEqual(normalizedRouteState, localRouteState)) {
            return;
        }

        navigateToHistory(localRouteState);
    }, [localRouteState, navigateToHistory, normalizedRouteState, selectedImage]);

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
                enableMotion={motionPolicy.enableItemMotion}
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
        motionPolicy.enableItemMotion,
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
                                        <SwarmTooltip label="Select All Visible">
                                            <SwarmActionIcon
                                                tone="secondary"
                                                emphasis="ghost"
                                                label="Select all visible history items"
                                                onClick={() => selectAll(allImageIds)}
                                            >
                                                <IconSelectAll size={18} />
                                            </SwarmActionIcon>
                                        </SwarmTooltip>
                                        {canStar && (
                                            <>
                                                <SwarmTooltip label="Star Selected">
                                                    <SwarmActionIcon
                                                        tone="warning"
                                                        emphasis="ghost"
                                                        label="Star selected items"
                                                        onClick={() => handleBulkStar(true)}
                                                        disabled={selectionCount === 0}
                                                    >
                                                        <IconStar size={18} />
                                                    </SwarmActionIcon>
                                                </SwarmTooltip>
                                                <SwarmTooltip label="Unstar Selected">
                                                    <SwarmActionIcon
                                                        tone="secondary"
                                                        emphasis="ghost"
                                                        label="Unstar selected items"
                                                        onClick={() => handleBulkStar(false)}
                                                        disabled={selectionCount === 0}
                                                    >
                                                        <IconStar size={18} />
                                                    </SwarmActionIcon>
                                                </SwarmTooltip>
                                            </>
                                        )}
                                        {canDelete && (
                                            <SwarmTooltip label="Delete Selected">
                                                <SwarmActionIcon
                                                    tone="danger"
                                                    emphasis="ghost"
                                                    label="Delete selected items"
                                                    onClick={handleBulkDelete}
                                                    disabled={selectionCount === 0}
                                                >
                                                    <IconTrash size={18} />
                                                </SwarmActionIcon>
                                            </SwarmTooltip>
                                        )}
                                        <SwarmTooltip label="Download Selected">
                                            <SwarmActionIcon
                                                tone="primary"
                                                emphasis="ghost"
                                                label="Download selected items"
                                                onClick={handleBulkDownload}
                                                disabled={selectionCount === 0}
                                            >
                                                <IconDownload size={18} />
                                            </SwarmActionIcon>
                                        </SwarmTooltip>
                                        <SwarmTooltip label="Compare (Select 2 Images)">
                                            <SwarmActionIcon
                                                tone="primary"
                                                emphasis="ghost"
                                                label="Compare selected items"
                                                onClick={handleCompare}
                                                disabled={selectionCount !== 2}
                                            >
                                                <IconColumns size={18} />
                                            </SwarmActionIcon>
                                        </SwarmTooltip>
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
                                <SwarmTooltip label="Refresh History">
                                    <SwarmActionIcon
                                        tone="secondary"
                                        emphasis="ghost"
                                        label="Refresh history"
                                        onClick={() => void refetchHistory()}
                                    >
                                        <IconRefresh size={18} />
                                    </SwarmActionIcon>
                                </SwarmTooltip>
                                {canOpenFolder && (
                                    <SwarmTooltip label="Open Image Folder in File Explorer">
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
                                    </SwarmTooltip>
                                )}
                                {canImport && (
                                    <SwarmTooltip label="Import Image to History">
                                        <SwarmActionIcon
                                            tone="primary"
                                            emphasis="ghost"
                                            label="Import image into history"
                                            onClick={handleImportImage}
                                        >
                                            <IconUpload size={18} />
                                        </SwarmActionIcon>
                                    </SwarmTooltip>
                                )}
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
                                    tone="primary"
                                    emphasis="soft"
                                    size="xs"
                                    onClick={handleCreateReviewSet}
                                    disabled={selectionCount === 0}
                                >
                                    Review Set
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
                            <SwarmSearchInput
                                placeholder="Search path, prompt, model, seed, resolution, or metadata..."
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.currentTarget.value)}
                                style={{ flex: 1, minWidth: 260 }}
                                visual="glitch"
                            />
                            <SwarmSegmentedControl
                                value={preferences.sortBy}
                                onChange={(value) => updatePreferences({ sortBy: value as HistoryPreferences['sortBy'] })}
                                data={[
                                    { value: 'Date', label: 'Date' },
                                    { value: 'Name', label: 'Name' },
                                ]}
                            />
                            <SwarmTooltip label={preferences.sortReverse ? 'Ascending' : 'Descending'}>
                                <SwarmActionIcon
                                    tone="secondary"
                                    emphasis="ghost"
                                    label="Toggle sort direction"
                                    onClick={() => updatePreferences({ sortReverse: !preferences.sortReverse })}
                                >
                                    {preferences.sortReverse ? <IconArrowUp size={18} /> : <IconArrowDown size={18} />}
                                </SwarmActionIcon>
                            </SwarmTooltip>
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
                            <SwarmButton tone="secondary" onClick={() => void handleRetryHistory()}>
                                Retry
                            </SwarmButton>
                        </Stack>
                    </Center>
                ) : (
                    <Stack gap="md" style={{ height: '100%' }}>
                        {historyRecoveryState && (
                            <Paper p="sm" radius="md" withBorder>
                                <Stack gap="sm">
                                    <Stack gap={2}>
                                        <Text size="sm" fw={600} c={historyRecoveryState.tone === 'orange' ? 'orange.3' : 'yellow.3'}>
                                            {historyRecoveryState.title}
                                        </Text>
                                        <Text size="sm" c="dimmed">
                                            {historyRecoveryState.message}
                                        </Text>
                                    </Stack>
                                    <Group gap="xs" wrap="wrap">
                                        <SwarmButton tone="secondary" emphasis="ghost" size="xs" onClick={() => void handleRetryHistory()}>
                                            Retry Request
                                        </SwarmButton>
                                        <SwarmButton tone="secondary" emphasis="ghost" size="xs" onClick={handleResetHistorySort}>
                                            Reset Sort
                                        </SwarmButton>
                                        <SwarmButton tone="secondary" emphasis="ghost" size="xs" onClick={() => void handleResetHistoryView()}>
                                            Reset History View
                                        </SwarmButton>
                                    </Group>
                                </Stack>
                            </Paper>
                        )}
                        {preferences.viewMode === 'folders' && historyFolders.length > 0 && (
                            <Stack gap="xs">
                                <Text size="sm" fw={600} tt="uppercase" style={{ color: 'var(--theme-gray-1)' }}>
                                    Folders
                                </Text>
                                <Grid gap="xs">
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

            <Suspense fallback={null}>
                {(selectedImage || upscaleModal || comparisonModal) && (
                    <>
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
                                void refetchHistory();
                            }}
                        />

                        <ImageComparison
                            leftImage={comparisonImages[0]}
                            rightImage={comparisonImages[1]}
                            opened={comparisonModal}
                            onClose={() => setComparisonModal(false)}
                        />
                    </>
                )}
            </Suspense>

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
