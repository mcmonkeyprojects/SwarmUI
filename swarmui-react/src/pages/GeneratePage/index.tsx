import { useCallback, useDeferredValue, useEffect, useMemo, useRef, lazy, Suspense, memo } from 'react';
import {
    Box,
    Modal,
    Loader,
    Drawer,
    Stack,
    Group,
    Text,
    TextInput,
    Textarea,
    Badge,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useShallow } from 'zustand/react/shallow';
import {
    useActiveLoras,
    useActiveWildcards,
    useSelectedBackend,
    useModeToggles,
    useResetGeneration,
    useGenerationStore,
} from '../../store/generationStore';
import { useFavoritesStore } from '../../stores/favoritesStore';
import { useGenerationDiagnosticsStore } from '../../stores/generationDiagnosticsStore';
import { useQueueStore } from '../../stores/queue';
import { useCanvasWorkflowStore } from '../../stores/canvasWorkflowStore';
import { useKeyboardShortcuts, KEYBOARD_SHORTCUTS } from '../../hooks/useKeyboardShortcuts';
import { useGenerationHandlers } from '../../hooks/useGenerationHandlers';
import { useResizablePanel } from '../../hooks/useResizablePanel';
import { ResizeHandle, SwarmButton } from '../../components/ui';
import { usePromptBuilderStore } from '../../stores/promptBuilderStore';
import {
    compilePromptBuilder,
    upsertManagedBlock,
} from '../../features/promptBuilder';
import { buildCanvasApplyPatch, buildCanvasPrompt } from '../../features/canvasWorkflow/compat';
import { useGenerateWorkspaceActions, useGenerateWorkspaceLayout } from '../../stores/layoutStore';
import { imageUrlToDataUrl } from '../../utils/imageData';
import {
    useGeneratePageController,
    useGenerateTransientUiState,
    useModalState,
    useParameterForm,
} from './hooks';
import { useAllModelData } from '../../hooks/useModels';
import { DEFAULT_FORM_VALUES } from './hooks/useParameterForm';
import { getModelMediaCapabilities } from '../../utils/modelCapabilities';
import type { ImageListItem } from '../../api/types';
import type { EmbeddingInsertRequest } from '../../components/EmbeddingBrowser';
import type { AssistantApplyPatch } from '../../types/assistant';
import { useAssistantStore } from '../../stores/assistantStore';
import { applyAssistantPatchToParams } from '../../utils/assistantApply';
import { useGenerationProductStore } from '../../stores/generationProductStore';
import { validateGeneration } from '../../features/generation/productTypes';
import { WorkspaceExperiencePanel } from './components/WorkspaceExperiencePanel';
import { GenerateStageHeader } from './components/GenerateStageHeader';
import { CanvasGenerationResultWatcher } from './components/CanvasGenerationResultWatcher';
import {
    GeneratePerformanceMilestones,
    type GenerateDeferredDataset,
} from './components/GeneratePerformanceMilestones';
import { useNavigationStore, type GenerateRouteState, type GenerateWorkspaceMode } from '../../stores/navigationStore';
import { useWorkflowWorkspaceStore } from '../../stores/workflowWorkspaceStore';

const LoRABrowser = lazy(() =>
    import('../../components/LoRABrowser').then((module) => ({ default: module.LoRABrowser }))
);
const ModelBrowser = lazy(() =>
    import('../../components/ModelBrowser').then((module) => ({ default: module.ModelBrowser }))
);
const EmbeddingBrowser = lazy(() =>
    import('../../components/EmbeddingBrowser').then((module) => ({ default: module.EmbeddingBrowser }))
);
const GenerationDiagnosticsModal = lazy(() =>
    import('../../components/generation/GenerationDiagnosticsModal').then((module) => ({ default: module.GenerationDiagnosticsModal }))
);
const ScheduleJobModal = lazy(() =>
    import('../../components/ScheduleJobModal').then((module) => ({ default: module.ScheduleJobModal }))
);
const HistoryPanel = lazy(() =>
    import('../../components/HistoryPanel').then((module) => ({ default: module.HistoryPanel }))
);
const GenerateAssistantPanel = lazy(() =>
    import('../../components/GenerateAssistantPanel').then((module) => ({ default: module.GenerateAssistantPanel }))
);
const ImageComparison = lazy(() =>
    import('../../components/ImageComparison').then((module) => ({ default: module.ImageComparison }))
);
const WorkspaceSidebar = lazy(() =>
    import('./components/WorkspaceSidebar').then((module) => ({ default: module.WorkspaceSidebar }))
);
const WorkspaceModeDeck = lazy(() =>
    import('./components/WorkspaceModeDeck').then((module) => ({ default: module.WorkspaceModeDeck }))
);
const VideoSidebar = lazy(() =>
    import('./components/VideoSidebar').then((module) => ({ default: module.VideoSidebar }))
);
const LiveGenerationCanvasStage = lazy(() =>
    import('./components/LiveGenerationCanvasStage').then((module) => ({ default: module.LiveGenerationCanvasStage }))
);
const GalleryPanel = lazy(() =>
    import('../../components/generation/GalleryPanel').then((module) => ({ default: module.GalleryPanel }))
);

const ModalLoader = () => (
    <Box style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
        <Loader size="lg" />
    </Box>
);

const WorkspaceShellLoader = memo(function WorkspaceShellLoader() {
    return (
        <Box
            style={{
                minHeight: 320,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <Loader size="lg" />
        </Box>
    );
});

const PanelLoader = memo(function PanelLoader() {
    return (
        <Box
            style={{
                minHeight: 240,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <Loader size="md" />
        </Box>
    );
});

interface GeneratePageProps {
    routeState?: GenerateRouteState;
}

export const GeneratePage = memo(function GeneratePage({ routeState }: GeneratePageProps) {
    const { activeLoras, setLoras } = useActiveLoras();
    const { wildcardText, setWildcardText } = useActiveWildcards();
    const { selectedBackend, setSelectedBackend } = useSelectedBackend();
    const resetStore = useResetGeneration();

    const {
        enableInitImage,
        setEnableInitImage,
        enableRefiner,
        setEnableRefiner,
        enableControlNet,
        setEnableControlNet,
        enableVideo,
        setEnableVideo,
        enableVariation,
        setEnableVariation,
    } = useModeToggles();

    const { addFavorite, removeFavorite, isFavorite } = useFavoritesStore(useShallow((state) => ({
        addFavorite: state.addFavorite,
        removeFavorite: state.removeFavorite,
        isFavorite: state.isFavorite,
    })));
    const hasDiagnosticIssue = useGenerationDiagnosticsStore((state) => state.entries[0]?.status === 'error');
    const addQueueJob = useQueueStore((state) => state.addJob);
    const pendingCanvasGenerateRequest = useCanvasWorkflowStore((state) => state.pendingGenerateRequest);
    const awaitingCanvasResult = useCanvasWorkflowStore((state) => state.awaitingResult);
    const awaitingCanvasImageCount = useCanvasWorkflowStore((state) => state.awaitingResultImageCount);
    const consumeCanvasGenerateRequest = useCanvasWorkflowStore((state) => state.consumeGenerateRequest);
    const markCanvasAwaitingResult = useCanvasWorkflowStore((state) => state.markAwaitingResult);
    const setCanvasPendingResult = useCanvasWorkflowStore((state) => state.setPendingResult);
    const setCanvasFallbackParams = useCanvasWorkflowStore((state) => state.setFallbackParams);
    const canvasSessionOpen = useCanvasWorkflowStore((state) => state.isOpen);
    const isGeneratePageActive = useNavigationStore((state) => state.currentPage === 'generate');
    const workspaceLayout = useGenerateWorkspaceLayout();
    const workspaceActions = useGenerateWorkspaceActions();
    const assistantPanelOpen = useAssistantStore((state) => state.panelOpen);
    const setAssistantPanelOpen = useAssistantStore((state) => state.setPanelOpen);
    const setGenerateModeRoute = useNavigationStore((state) => state.setGenerateMode);
    const navigateToWorkflows = useNavigationStore((state) => state.navigateToWorkflows);
    const setWorkflowHandoff = useWorkflowWorkspaceStore((state) => state.setHandoff);
    const {
        currentMode,
        activeRecipeId,
        recipes,
        lastSnapshot,
        lastIssues,
        setCurrentMode,
        applyRecipe,
        setActiveRecipe,
        saveRecipe,
        captureSnapshot,
        setIssues,
    } = useGenerationProductStore(useShallow((state) => ({
        currentMode: state.currentMode,
        activeRecipeId: state.activeRecipeId,
        recipes: state.recipes,
        lastSnapshot: state.lastSnapshot,
        lastIssues: state.lastIssues,
        setCurrentMode: state.setCurrentMode,
        applyRecipe: state.applyRecipe,
        setActiveRecipe: state.setActiveRecipe,
        saveRecipe: state.saveRecipe,
        captureSnapshot: state.captureSnapshot,
        setIssues: state.setIssues,
    })));
    const modals = useModalState();
    const paramForm = useParameterForm();
    const formValues = paramForm.form.values;
    const latestFormValuesRef = useRef(formValues);

    useEffect(() => {
        latestFormValuesRef.current = formValues;
    }, [formValues]);

    const {
        routeEnteredAt,
        supplementalDataReady,
        usesAdvancedRail,
        shouldLoadVaeData,
        shouldLoadControlNetData,
        shouldLoadUpscalerData,
        shouldLoadEmbeddings,
        shouldLoadWildcardData,
    } = useGeneratePageController({
        currentMode,
        openInspectorSections: workspaceLayout.openInspectorSections,
        openQuickModules: workspaceLayout.openQuickModules,
        embeddingModalOpened: modals.embeddingModalOpened,
        enableControlNet,
        enableRefiner,
    });

    const dataLoaders = useAllModelData({
        autoRefreshBackends: isGeneratePageActive,
        scopes: {
            models: true,
            backends: true,
            vaes: shouldLoadVaeData,
            controlnets: shouldLoadControlNetData,
            upscalers: shouldLoadUpscalerData,
            embeddings: shouldLoadEmbeddings,
            wildcards: shouldLoadWildcardData,
        },
    });

    const validationValues = useMemo(() => ({
        model: formValues.model,
        prompt: formValues.prompt,
        scheduler: formValues.scheduler,
        controlnetimageinput: formValues.controlnetimageinput,
        videomodel: formValues.videomodel,
        text2videoframes: formValues.text2videoframes,
        initimage: formValues.initimage,
    }), [
        formValues.controlnetimageinput,
        formValues.initimage,
        formValues.model,
        formValues.prompt,
        formValues.scheduler,
        formValues.text2videoframes,
        formValues.videomodel,
    ]);
    const selectedModelName = typeof formValues.model === 'string' ? formValues.model : '';
    const promptValue = typeof formValues.prompt === 'string' ? formValues.prompt : '';
    const negativePromptValue = typeof formValues.negativeprompt === 'string' ? formValues.negativeprompt : '';

    const selectedModel = useMemo(
        () => dataLoaders.models.find((model) => model.name === selectedModelName) ?? null,
        [dataLoaders.models, selectedModelName]
    );
    const issues = useMemo(() => validateGeneration(validationValues, {
        selectedBackend,
        enableControlNet,
        enableVideo,
        enableInitImage,
    }), [
        enableControlNet,
        enableInitImage,
        enableVideo,
        selectedBackend,
        validationValues,
    ]);

    const handleEmbeddingInsert = ({ embeddingText, targetField }: EmbeddingInsertRequest) => {
        const currentValue = (paramForm.form.values[targetField] as string | undefined) || '';
        if (currentValue.includes(embeddingText)) {
            notifications.show({
                title: 'Embedding Already Present',
                message: `${embeddingText} is already in the ${targetField === 'prompt' ? 'positive' : 'negative'} prompt.`,
                color: 'yellow',
            });
            return;
        }

        const nextValue = currentValue.trim()
            ? `${embeddingText} ${currentValue.trim()}`
            : embeddingText;

        paramForm.form.setFieldValue(targetField, nextValue);
    };
    const modelMediaCapabilities = useMemo(
        () => getModelMediaCapabilities(selectedModel),
        [selectedModel]
    );
    const previousModelSupportRef = useRef(modelMediaCapabilities.supportsVideo);

    const {
        generating,
        generatedImages,
        currentImageIndex,
        handleGenerate,
        handleInterrupt,
        setCurrentImageIndex,
        goToNextImage,
        goToPrevImage,
        setGeneratedImages,
        removeSessionImage,
    } = useGenerationHandlers({
        featureToggles: {
            enableInitImage,
            enableRefiner,
            enableControlNet,
            enableVideo,
            enableVariation,
        },
        mediaCapabilities: modelMediaCapabilities,
    });
    const deferredDatasets = useMemo<GenerateDeferredDataset[]>(() => ([
        {
            key: 'vaes',
            enabled: shouldLoadVaeData,
            loading: dataLoaders.loadingStates.vaes,
        },
        {
            key: 'controlnets',
            enabled: shouldLoadControlNetData,
            loading: dataLoaders.loadingStates.controlnets,
        },
        {
            key: 'upscalers',
            enabled: shouldLoadUpscalerData,
            loading: dataLoaders.loadingStates.upscalers,
        },
        {
            key: 'embeddings',
            enabled: shouldLoadEmbeddings,
            loading: dataLoaders.loadingStates.embeddings,
        },
        {
            key: 'wildcards',
            enabled: shouldLoadWildcardData,
            loading: dataLoaders.loadingStates.wildcards,
        },
    ]), [
        dataLoaders.loadingStates.controlnets,
        dataLoaders.loadingStates.embeddings,
        dataLoaders.loadingStates.upscalers,
        dataLoaders.loadingStates.vaes,
        dataLoaders.loadingStates.wildcards,
        shouldLoadControlNetData,
        shouldLoadEmbeddings,
        shouldLoadUpscalerData,
        shouldLoadVaeData,
        shouldLoadWildcardData,
    ]);

    const getCanvasActionContext = useCallback(() => {
        const values = latestFormValuesRef.current;
        return {
            prompt: values.prompt || '',
            model: typeof values.model === 'string' ? values.model : undefined,
            generationParams: values,
        };
    }, []);

    const {
        presetName,
        setPresetName,
        presetDescription,
        setPresetDescription,
        diagnosticsModalOpen,
        setDiagnosticsModalOpen,
        galleryDrawerOpen,
        setGalleryDrawerOpen,
        galleryPinned,
        setGalleryPinned,
        comparisonOpen,
        setComparisonOpen,
    } = useGenerateTransientUiState();

    const isGalleryDrawer = useMediaQuery('(max-width: 1199px)');
    const isStacked = useMediaQuery('(max-width: 959px)');

    const sidebarPanel = useResizablePanel({
        initialSize: workspaceLayout.sidebarWidth,
        minSize: 320,
        maxSize: 560,
        direction: 'horizontal',
        onResize: workspaceActions.setSidebarWidth,
    });
    const galleryPanel = useResizablePanel({
        initialSize: workspaceLayout.galleryWidth,
        minSize: 260,
        maxSize: 420,
        direction: 'horizontal',
        onResize: workspaceActions.setGalleryWidth,
    });

    useEffect(() => {
        const previouslySupportedVideo = previousModelSupportRef.current;

        if (previouslySupportedVideo && !modelMediaCapabilities.supportsVideo) {
            if (enableVideo) {
                setEnableVideo(false);
            }

            paramForm.form.setValues({
                ...paramForm.form.values,
                videomodel: DEFAULT_FORM_VALUES.videomodel,
                videoframes: DEFAULT_FORM_VALUES.videoframes,
                videosteps: DEFAULT_FORM_VALUES.videosteps,
                videocfg: DEFAULT_FORM_VALUES.videocfg,
                videofps: DEFAULT_FORM_VALUES.videofps,
                videoformat: DEFAULT_FORM_VALUES.videoformat,
                videoboomerang: DEFAULT_FORM_VALUES.videoboomerang,
                text2videoframes: DEFAULT_FORM_VALUES.text2videoframes,
                text2videofps: DEFAULT_FORM_VALUES.text2videofps,
                text2videoformat: DEFAULT_FORM_VALUES.text2videoformat,
            });
        } else if (modelMediaCapabilities.supportsVideo) {
            if (!modelMediaCapabilities.supportsImageToVideo) {
                paramForm.form.setValues({
                    ...paramForm.form.values,
                    videomodel: DEFAULT_FORM_VALUES.videomodel,
                    videoframes: DEFAULT_FORM_VALUES.videoframes,
                    videosteps: DEFAULT_FORM_VALUES.videosteps,
                    videocfg: DEFAULT_FORM_VALUES.videocfg,
                    videofps: DEFAULT_FORM_VALUES.videofps,
                    videoformat: DEFAULT_FORM_VALUES.videoformat,
                    videoboomerang: DEFAULT_FORM_VALUES.videoboomerang,
                });
            }

            if (!modelMediaCapabilities.supportsTextToVideo) {
                paramForm.form.setValues({
                    ...paramForm.form.values,
                    text2videoframes: DEFAULT_FORM_VALUES.text2videoframes,
                    text2videofps: DEFAULT_FORM_VALUES.text2videofps,
                    text2videoformat: DEFAULT_FORM_VALUES.text2videoformat,
                });
            }
        }

        previousModelSupportRef.current = modelMediaCapabilities.supportsVideo;
    }, [
        enableVideo,
        modelMediaCapabilities.supportsImageToVideo,
        modelMediaCapabilities.supportsTextToVideo,
        modelMediaCapabilities.supportsVideo,
        paramForm.form,
        setEnableVideo,
    ]);

    useEffect(() => {
        const refinerUpscale = typeof paramForm.form.values.refinerupscale === 'number'
            ? paramForm.form.values.refinerupscale
            : 1;
        const hasRefinerModel = typeof paramForm.form.values.refinermodel === 'string'
            && paramForm.form.values.refinermodel.trim().length > 0;
        if (!enableRefiner && (refinerUpscale > 1 || hasRefinerModel)) {
            setEnableRefiner(true);
        }
    }, [
        enableRefiner,
        paramForm.form.values.refinerupscale,
        paramForm.form.values.refinermodel,
        setEnableRefiner,
    ]);

    const handleGenerateWithBuilder = useCallback((values: typeof paramForm.form.values, options?: { forceEnableRefiner?: boolean }) => {
        const preflightIssues = validateGeneration(values, {
            selectedBackend,
            enableControlNet,
            enableVideo,
            enableInitImage,
        });
        setIssues(preflightIssues);

        const blockingIssue = preflightIssues.find((issue) => issue.severity === 'blocking');
        if (blockingIssue) {
            notifications.show({
                title: 'Generation Blocked',
                message: blockingIssue.message,
                color: 'red',
            });
            return;
        }

        const builderState = usePromptBuilderStore.getState();
        const shouldCompileFromState =
            (builderState.regions.length > 0 || builderState.segments.length > 0 || !!builderState.lastCompiledBlockHash)
            && builderState.syncState !== 'manual_override';

        let effectiveValues = values;
        if (shouldCompileFromState) {
            const compiled = compilePromptBuilder({
                regions: builderState.regions,
                segments: builderState.segments,
            });
            const promptWithManagedBlock = upsertManagedBlock(values.prompt || '', compiled.managedBlock);
            effectiveValues = { ...values, prompt: promptWithManagedBlock };
            if (promptWithManagedBlock !== promptValue) {
                paramForm.form.setFieldValue('prompt', promptWithManagedBlock);
            }
            builderState.markSynced(compiled.managedBlock, compiled.blockHash);
        } else if (
            (builderState.regions.length > 0 || builderState.segments.length > 0)
            && builderState.syncState === 'manual_override'
        ) {
            notifications.show({
                title: 'Prompt Builder Manual Override',
                message: 'Using manually edited builder block text for this generation.',
                color: 'yellow',
            });
        }

        const requestedRefinerUpscale = typeof effectiveValues.refinerupscale === 'number'
            ? effectiveValues.refinerupscale
            : 1;
        const requestedRefinerControl = effectiveValues.refinercontrolpercentage
            ?? effectiveValues.refinercontrol
            ?? 0;
        const requestedRefinerModel = typeof effectiveValues.refinermodel === 'string'
            ? effectiveValues.refinermodel.trim()
            : '';
        const shouldPrepareRefiner = enableRefiner
            || requestedRefinerUpscale !== 1
            || requestedRefinerControl > 0
            || requestedRefinerModel.length > 0
            || options?.forceEnableRefiner === true;

        if (shouldPrepareRefiner) {
            const refinerControl = effectiveValues.refinercontrolpercentage
                ?? effectiveValues.refinercontrol
                ?? 0;
            effectiveValues = {
                ...effectiveValues,
                refinerupscale: effectiveValues.refinerupscale ?? 1,
                refinerupscalemethod: effectiveValues.refinerupscalemethod || 'pixel-lanczos',
                refinermethod: effectiveValues.refinermethod || 'PostApply',
                refinercontrol: refinerControl,
                refinercontrolpercentage: refinerControl,
            };
        }

        handleGenerate(effectiveValues, options);
    }, [
        enableControlNet,
        enableInitImage,
        enableRefiner,
        enableVideo,
        handleGenerate,
        paramForm,
        promptValue,
        selectedBackend,
        setIssues,
    ]);

    const handleGenerateAndUpscale = () => {
        const currentValues = paramForm.form.values;
        const nextValues = {
            ...currentValues,
            refinerupscale: 2,
            refinerupscalemethod: currentValues.refinerupscalemethod || 'pixel-lanczos',
            refinermethod: 'PostApply',
            refinercontrol: 0,
            refinercontrolpercentage: 0,
        };

        setEnableRefiner(true);
        paramForm.form.setValues(nextValues);
        handleGenerateWithBuilder(nextValues, { forceEnableRefiner: true });
    };

    const applyAssistantPatch = (patch: AssistantApplyPatch) => {
        const nextValues = applyAssistantPatchToParams(paramForm.form.values, patch);
        paramForm.form.setValues(nextValues);

        notifications.show({
            title: 'Assistant Suggestions Applied',
            message: 'The selected assistant draft was applied to your current generation form.',
            color: 'teal',
        });
    };

    const applyAssistantPatchAndGenerate = (patch: AssistantApplyPatch) => {
        const nextValues = applyAssistantPatchToParams(paramForm.form.values, patch);
        applyAssistantPatch(patch);
        handleGenerateWithBuilder(nextValues);
    };

    useEffect(() => {
        if (!canvasSessionOpen) {
            return;
        }
        setCanvasFallbackParams(paramForm.form.values);
    }, [canvasSessionOpen, paramForm.form.values, setCanvasFallbackParams]);

    useEffect(() => {
        if (!pendingCanvasGenerateRequest) {
            return;
        }

        const payload = pendingCanvasGenerateRequest.payload;
        const currentValues = paramForm.form.values;
        const patch = buildCanvasApplyPatch(payload);
        const nextValues = {
            ...currentValues,
            ...patch,
            images: 1,
            prompt: buildCanvasPrompt(currentValues.prompt || '', payload),
        };

        consumeCanvasGenerateRequest(pendingCanvasGenerateRequest.id);
        paramForm.form.setValues(nextValues);
        useGenerationStore.getState().setParams(nextValues);
        setCanvasFallbackParams(nextValues);

        if (patch.initimage) {
            setEnableInitImage(true);
        }

        if (typeof nextValues.model !== 'string' || !nextValues.model.trim()) {
            markCanvasAwaitingResult(false);
            notifications.show({
                title: 'Model Required',
                message: 'Select a model before running the canvas generation step.',
                color: 'yellow',
            });
            return;
        }

        markCanvasAwaitingResult(true, generatedImages.length);
        handleGenerateWithBuilder(nextValues);
    }, [
        consumeCanvasGenerateRequest,
        generatedImages.length,
        handleGenerateWithBuilder,
        markCanvasAwaitingResult,
        paramForm.form,
        pendingCanvasGenerateRequest,
        setCanvasFallbackParams,
        setEnableInitImage,
    ]);

    useKeyboardShortcuts({
        isGenerating: generating,
        onGenerate: () => handleGenerateWithBuilder(formValues),
        onStop: handleInterrupt,
        onNextImage: goToNextImage,
        onPrevImage: goToPrevImage,
        onFirstImage: () => setCurrentImageIndex(0),
        onLastImage: () => setCurrentImageIndex(generatedImages.length - 1),
        onToggleFavorite: () => {
            const currentImage = generatedImages[currentImageIndex];
            if (currentImage) {
                if (isFavorite(currentImage)) {
                    removeFavorite(currentImage);
                } else {
                    addFavorite({
                        path: currentImage,
                        timestamp: Date.now(),
                        prompt: promptValue,
                        model: selectedModelName,
                    });
                }
            }
        },
    });

    const handleSavePreset = async () => {
        if (!presetName.trim()) {
            notifications.show({
                title: 'Error',
                message: 'Please enter a preset name',
                color: 'red',
            });
            return;
        }

        paramForm.setPresetName(presetName);
        paramForm.setPresetDescription(presetDescription);
        const success = await paramForm.handleSavePreset();

        if (success) {
            setPresetName('');
            setPresetDescription('');
            modals.closeSavePresetModal();
        }
    };

    const handleResetWorkspace = () => {
        resetStore();
        paramForm.resetForm();
        workspaceActions.setOpenQuickModules([]);
        workspaceActions.setOpenInspectorSections([]);
        workspaceActions.setLastInspectorJumpTarget(null);
        workspaceActions.setFocusMode(false);
    };

    const handleSelectGalleryImage = (_image: string, index: number) => {
        setCurrentImageIndex(index);
        if (isGalleryDrawer) {
            setGalleryDrawerOpen(false);
        }
    };

    const handleDeleteGalleryImage = (index: number) => {
        const nextIndex = index >= generatedImages.length - 1
            ? Math.max(0, currentImageIndex - 1)
            : currentImageIndex > index
                ? currentImageIndex - 1
                : currentImageIndex;

        removeSessionImage(index);
        setCurrentImageIndex(nextIndex);
    };

    const handleUseAsInitImage = async (imageUrl: string) => {
        try {
            const initImageDataUrl = await imageUrlToDataUrl(imageUrl);
            paramForm.form.setFieldValue('initimage', initImageDataUrl);
            setEnableInitImage(true);
            notifications.show({
                title: 'Init Image Set',
                message: 'Image set as init image for Img2Img generation.',
                color: 'teal',
            });
        } catch (error) {
            notifications.show({
                title: 'Init Image Failed',
                message: error instanceof Error ? error.message : 'Failed to prepare the init image.',
                color: 'red',
            });
        }
    };

    const handleReorderGalleryImages = (images: string[]) => {
        const currentSelection = generatedImages[currentImageIndex] || null;

        setGeneratedImages(images);

        if (!currentSelection) {
            return;
        }

        const nextIndex = images.indexOf(currentSelection);
        if (nextIndex >= 0) {
            setCurrentImageIndex(nextIndex);
        }
    };

    const showSidebar = !workspaceLayout.focusMode;
    const showGalleryRail = galleryPinned && usesAdvancedRail && !workspaceLayout.focusMode && !isGalleryDrawer;
    const supportingSidebarWidth = currentMode === 'quick' ? 336 : 352;
    const resolvedSidebarWidth = usesAdvancedRail ? workspaceLayout.sidebarWidth : supportingSidebarWidth;
    const selectedGalleryImage = generatedImages[currentImageIndex] || null;
    const deferredGalleryImages = useDeferredValue(generatedImages);
    const galleryImages = generating ? deferredGalleryImages : generatedImages;
    const galleryPreviewImage = useMemo(() => {
        if (!selectedGalleryImage) {
            return null;
        }
        if (galleryImages.includes(selectedGalleryImage)) {
            return selectedGalleryImage;
        }
        return galleryImages[galleryImages.length - 1] || null;
    }, [galleryImages, selectedGalleryImage]);
    const activeRecipe = useMemo(
        () => recipes.find((recipe) => recipe.id === activeRecipeId) ?? null,
        [activeRecipeId, recipes]
    );
    const recipeDiffCount = useMemo(() => {
        if (!activeRecipe) {
            return 0;
        }

        return Object.entries(activeRecipe.params).reduce((count, [key, value]) => (
            paramForm.form.values[key] !== value ? count + 1 : count
        ), 0);
    }, [activeRecipe, paramForm.form.values]);
    const comparisonImages = useMemo<[ImageListItem | null, ImageListItem | null]>(() => {
        const recent = generatedImages.slice(-2);
        if (recent.length < 2) {
            return [null, null] as const;
        }

        return recent.map((src, index) => ({
            src,
            metadata: null,
            starred: false,
            canonical_src: src,
            preview_src: src,
            media_type: 'image' as const,
            created_at: generatedImages.length - recent.length + index,
            prompt_preview: null,
            model: selectedModelName || null,
            width: null,
            height: null,
            seed: null,
        })) as [ImageListItem, ImageListItem];
    }, [generatedImages, selectedModelName]);
    const modeStageCopy = currentMode === 'quick'
        ? 'A minimal run path with the canvas front and center.'
        : currentMode === 'guided'
            ? 'Curated controls on the left, with the stage ready for review and iteration.'
            : currentMode === 'video'
                ? 'Focused video generation with text-to-video and image-to-video controls.'
                : 'Full studio workspace with the canvas leading and support tools around it.';
    const stageHeaderCopy = generating
        ? 'Generation in progress. Live preview and detailed status are shown on the canvas.'
        : modeStageCopy;

    useEffect(() => {
        if (!routeState?.mode) {
            return;
        }

        if (routeState.mode !== currentMode) {
            setCurrentMode(routeState.mode);
        }
    }, [currentMode, routeState?.mode, setCurrentMode]);

    useEffect(() => {
        if (!routeState?.recipe || routeState.recipe === activeRecipeId) {
            return;
        }

        const recipe = applyRecipe(routeState.recipe);
        if (!recipe) {
            return;
        }

        paramForm.form.setValues({
            ...paramForm.form.values,
            ...recipe.params,
            prompt: recipe.promptTemplate || promptValue,
        });
    }, [activeRecipeId, applyRecipe, paramForm.form, promptValue, routeState?.recipe]);

    const issuesSignature = useMemo(
        () => issues.map((issue) => `${issue.id}:${issue.severity}:${issue.message}`).join('|'),
        [issues]
    );
    const lastIssuesSignatureRef = useRef<string>('');

    useEffect(() => {
        if (lastIssuesSignatureRef.current === issuesSignature) {
            return;
        }

        lastIssuesSignatureRef.current = issuesSignature;
        setIssues(issues);
    }, [issues, issuesSignature, setIssues]);

    useEffect(() => {
        let idleHandle: number | null = null;
        const snapshotId = window.setTimeout(() => {
            const runCapture = () => {
                captureSnapshot({
                    id: 'last-session',
                    capturedAt: Date.now(),
                    mode: currentMode,
                    params: formValues,
                    openQuickModules: workspaceLayout.openQuickModules,
                    openInspectorSections: workspaceLayout.openInspectorSections,
                    galleryDensity: workspaceLayout.galleryDensity,
                    sidebarWidth: workspaceLayout.sidebarWidth,
                    galleryWidth: workspaceLayout.galleryWidth,
                    sessionImages: generatedImages,
                });
            };

            if ('requestIdleCallback' in window) {
                idleHandle = window.requestIdleCallback(runCapture, { timeout: 1000 });
                return;
            }

            runCapture();
        }, 750);

        return () => {
            window.clearTimeout(snapshotId);
            if (idleHandle !== null && 'cancelIdleCallback' in window) {
                window.cancelIdleCallback(idleHandle);
            }
        };
    }, [
        captureSnapshot,
        currentMode,
        formValues,
        generatedImages,
        workspaceLayout.galleryDensity,
        workspaceLayout.galleryWidth,
        workspaceLayout.openInspectorSections,
        workspaceLayout.openQuickModules,
        workspaceLayout.sidebarWidth,
    ]);

    const handleModeChange = (mode: GenerateWorkspaceMode) => {
        setCurrentMode(mode);
        setGenerateModeRoute(mode);
    };

    const handleRecipeApply = (recipeId: string | null) => {
        if (!recipeId) {
            setActiveRecipe(null);
            return;
        }

        const recipe = applyRecipe(recipeId);
        if (!recipe) {
            return;
        }

        paramForm.form.setValues({
            ...paramForm.form.values,
            ...recipe.params,
            prompt: recipe.promptTemplate || promptValue,
        });
        setGenerateModeRoute(recipe.mode);
        notifications.show({
            title: 'Recipe Applied',
            message: `Loaded ${recipe.name} into the current workspace.`,
            color: 'teal',
        });
    };

    const handleSaveRecipe = () => {
        const recipeName = window.prompt('Name this recipe:', selectedModelName
            ? `${selectedModelName} Recipe`
            : 'New Recipe');

        if (!recipeName?.trim()) {
            return;
        }

        const recipeId = saveRecipe({
            name: recipeName.trim(),
            description: `Saved from the ${currentMode} workspace.`,
            mode: currentMode,
            promptTemplate: promptValue,
            params: {
                ...formValues,
                prompt: undefined,
                negativeprompt: undefined,
            },
            tags: [currentMode, selectedModelName || 'unassigned-model'],
        });

        setActiveRecipe(recipeId);
        notifications.show({
            title: 'Recipe Saved',
            message: `${recipeName.trim()} is ready to reuse from the workspace deck.`,
            color: 'green',
        });
    };

    const handleRestoreSnapshot = () => {
        if (!lastSnapshot) {
            return;
        }

        paramForm.form.setValues({
            ...paramForm.form.values,
            ...lastSnapshot.params,
        });
        workspaceActions.setOpenQuickModules(lastSnapshot.openQuickModules);
        workspaceActions.setOpenInspectorSections(lastSnapshot.openInspectorSections);
        workspaceActions.setGalleryDensity(lastSnapshot.galleryDensity);
        workspaceActions.setSidebarWidth(lastSnapshot.sidebarWidth);
        workspaceActions.setGalleryWidth(lastSnapshot.galleryWidth);
        setGeneratedImages(lastSnapshot.sessionImages);
        handleModeChange(lastSnapshot.mode);

        notifications.show({
            title: 'Workspace Restored',
            message: 'Your last saved session layout and generation state have been restored.',
            color: 'blue',
        });
    };

    const handlePromoteToWorkflow = () => {
        setWorkflowHandoff({
            source: 'generate',
            templateId: currentMode === 'quick' ? 'text-to-image' : null,
            params: formValues,
            imageSrc: enableInitImage ? String(formValues.initimage || '') || null : null,
            note: activeRecipe ? `Promoted from recipe ${activeRecipe.name}` : 'Promoted from Generate workspace',
        });
        navigateToWorkflows({ mode: 'wizard' });
        notifications.show({
            title: 'Sent To Workflow',
            message: 'The current setup is ready in the workflow workspace.',
            color: 'teal',
        });
    };

    return (
        <Box
            className={[
                'generate-studio',
                workspaceLayout.focusMode ? 'generate-studio--focus' : '',
                isGalleryDrawer ? 'generate-studio--gallery-drawer' : '',
                isStacked ? 'generate-studio--stacked' : '',
            ].filter(Boolean).join(' ')}
            style={{
                height: 'var(--app-content-height)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            }}
        >
            <CanvasGenerationResultWatcher
                awaitingCanvasResult={awaitingCanvasResult}
                awaitingCanvasImageCount={awaitingCanvasImageCount}
                generating={generating}
                generatedImages={generatedImages}
                markCanvasAwaitingResult={markCanvasAwaitingResult}
                setCanvasPendingResult={setCanvasPendingResult}
            />
            <GeneratePerformanceMilestones
                routeEnteredAt={routeEnteredAt}
                loadingModels={dataLoaders.loadingModels}
                loadingBackends={dataLoaders.loadingBackends}
                supplementalDataReady={supplementalDataReady}
                deferredDatasets={deferredDatasets}
            />
            <WorkspaceExperiencePanel
                mode={currentMode}
                onModeChange={handleModeChange}
                recipes={recipes}
                activeRecipeId={activeRecipeId}
                onApplyRecipe={handleRecipeApply}
                onSaveRecipe={handleSaveRecipe}
                onPromoteWorkflow={handlePromoteToWorkflow}
                lastSnapshot={lastSnapshot}
                onRestoreSnapshot={handleRestoreSnapshot}
                issues={lastIssues}
                selectedModel={selectedModelName}
                backendCount={dataLoaders.backends.length}
                diffCount={recipeDiffCount}
            />
            <Box className="generate-studio__workspace">
                {showSidebar && (
                    <>
                        <Box
                            className={[
                                'generate-studio__sidebar-shell',
                                'surface-table',
                                usesAdvancedRail ? '' : 'generate-studio__sidebar-shell--supporting',
                            ].filter(Boolean).join(' ')}
                            style={isStacked ? {
                                flex: '0 0 auto',
                                width: '100%',
                                minHeight: usesAdvancedRail ? 320 : 280,
                                maxHeight: usesAdvancedRail ? '45%' : '40%',
                            } : {
                                flex: `0 0 ${resolvedSidebarWidth}px`,
                                minWidth: resolvedSidebarWidth,
                                maxWidth: resolvedSidebarWidth,
                            }}
                        >
                            <Suspense fallback={<WorkspaceShellLoader />}>
                                {currentMode === 'video' ? (
                                    <VideoSidebar
                                        form={paramForm.form}
                                        onGenerate={handleGenerateWithBuilder}
                                        models={dataLoaders.models}
                                        loadingModels={dataLoaders.loadingModels}
                                        loadingModel={paramForm.loadingModel}
                                        onModelSelect={paramForm.handleModelSelect}
                                        modelMediaCapabilities={modelMediaCapabilities}
                                        generating={generating}
                                        onStop={handleInterrupt}
                                        onOpenSchedule={modals.openScheduleModal}
                                        onOpenHistory={modals.openHistoryDrawer}
                                        initImagePreview={
                                            paramForm.form.values.initimage || paramForm.initImagePreview || null
                                        }
                                        onInitImageUpload={paramForm.handleInitImageUpload}
                                        onClearInitImage={paramForm.clearInitImage}
                                        activeLoras={activeLoras}
                                        onLoraChange={paramForm.handleLoraChange}
                                        onOpenLoraBrowser={modals.openLoraModal}
                                    />
                                ) : usesAdvancedRail ? (
                                    <WorkspaceSidebar
                                        form={paramForm.form}
                                        onGenerate={handleGenerateWithBuilder}
                                        onResetWorkspace={handleResetWorkspace}
                                        presets={paramForm.presets || []}
                                        onLoadPreset={paramForm.handleLoadPreset}
                                        onOpenSaveModal={modals.openSavePresetModal}
                                        onDeletePreset={paramForm.handleDeletePreset}
                                        onDuplicatePreset={paramForm.handleDuplicatePreset}
                                        onOpenHistory={modals.openHistoryDrawer}
                                        backends={dataLoaders.backends}
                                        backendOptions={dataLoaders.backendOptions}
                                        selectedBackend={selectedBackend}
                                        onBackendChange={setSelectedBackend}
                                        loadingBackends={dataLoaders.loadingBackends}
                                        activeLoras={activeLoras}
                                        onLoraChange={paramForm.handleLoraChange}
                                        onOpenLoraBrowser={modals.openLoraModal}
                                        onOpenEmbeddingBrowser={modals.openEmbeddingModal}
                                        onOpenModelBrowser={modals.openModelBrowser}
                                        generating={generating}
                                        onStop={handleInterrupt}
                                        onOpenSchedule={modals.openScheduleModal}
                                        onGenerateAndUpscale={handleGenerateAndUpscale}
                                        enableRefiner={enableRefiner}
                                        setEnableRefiner={setEnableRefiner}
                                        enableInitImage={enableInitImage}
                                        setEnableInitImage={setEnableInitImage}
                                        initImagePreview={paramForm.form.values.initimage || paramForm.initImagePreview}
                                        onInitImageUpload={paramForm.handleInitImageUpload}
                                        onClearInitImage={paramForm.clearInitImage}
                                        enableVariation={enableVariation}
                                        setEnableVariation={setEnableVariation}
                                        enableControlNet={enableControlNet}
                                        setEnableControlNet={setEnableControlNet}
                                        enableVideo={enableVideo}
                                        setEnableVideo={setEnableVideo}
                                        modelMediaCapabilities={modelMediaCapabilities}
                                        models={dataLoaders.models}
                                        loadingModels={dataLoaders.loadingModels}
                                        loadingModel={paramForm.loadingModel}
                                        onModelSelect={paramForm.handleModelSelect}
                                        vaeOptions={dataLoaders.vaeOptions}
                                        loadingVAEs={dataLoaders.loadingVAEs}
                                        controlNetOptions={dataLoaders.controlNetOptions}
                                        loadingControlNets={dataLoaders.loadingControlNets}
                                        onRefreshControlNets={dataLoaders.loadControlNets}
                                        upscaleModels={dataLoaders.upscaleModels}
                                        embeddingOptions={dataLoaders.embeddingOptions}
                                        wildcardOptions={dataLoaders.wildcardOptions}
                                        wildcardText={wildcardText}
                                        onWildcardTextChange={setWildcardText}
                                        quickModules={workspaceLayout.openQuickModules}
                                        onQuickModulesChange={workspaceActions.setOpenQuickModules}
                                        inspectorSections={workspaceLayout.openInspectorSections}
                                        onInspectorSectionsChange={workspaceActions.setOpenInspectorSections}
                                        lastInspectorJumpTarget={workspaceLayout.lastInspectorJumpTarget}
                                        onLastInspectorJumpTargetChange={workspaceActions.setLastInspectorJumpTarget}
                                    />
                                ) : (
                                    <WorkspaceModeDeck
                                        mode={currentMode as Extract<GenerateWorkspaceMode, 'quick' | 'guided'>}
                                        form={paramForm.form}
                                        onGenerate={handleGenerateWithBuilder}
                                        backends={dataLoaders.backends}
                                        backendOptions={dataLoaders.backendOptions}
                                        selectedBackend={selectedBackend}
                                        onBackendChange={setSelectedBackend}
                                        loadingBackends={dataLoaders.loadingBackends}
                                        models={dataLoaders.models}
                                        loadingModels={dataLoaders.loadingModels}
                                        loadingModel={paramForm.loadingModel}
                                        onModelSelect={paramForm.handleModelSelect}
                                        generating={generating}
                                        onStop={handleInterrupt}
                                        onOpenSchedule={modals.openScheduleModal}
                                        onGenerateAndUpscale={handleGenerateAndUpscale}
                                        onOpenHistory={modals.openHistoryDrawer}
                                        onOpenModelBrowser={modals.openModelBrowser}
                                        onOpenLoraBrowser={modals.openLoraModal}
                                        onOpenEmbeddingBrowser={modals.openEmbeddingModal}
                                        onPromoteWorkflow={handlePromoteToWorkflow}
                                        enableRefiner={enableRefiner}
                                        setEnableRefiner={setEnableRefiner}
                                        enableInitImage={enableInitImage}
                                        setEnableInitImage={setEnableInitImage}
                                        enableVariation={enableVariation}
                                        setEnableVariation={setEnableVariation}
                                        enableControlNet={enableControlNet}
                                        setEnableControlNet={setEnableControlNet}
                                        enableVideo={enableVideo}
                                        setEnableVideo={setEnableVideo}
                                        modelMediaCapabilities={modelMediaCapabilities}
                                        activeRecipe={activeRecipe}
                                        issues={issues}
                                    />
                                )}
                            </Suspense>
                        </Box>
                        {!isStacked && usesAdvancedRail && (
                            <ResizeHandle
                                direction="horizontal"
                                onPointerDown={sidebarPanel.handlePointerDown}
                                onNudge={sidebarPanel.nudgeSize}
                                isResizing={sidebarPanel.isResizing}
                            />
                        )}
                    </>
                )}

                <Box className="generate-studio__stage-column">
                    <Box className="generate-studio__stage-header">
                        <GenerateStageHeader
                            currentMode={currentMode}
                            generating={generating}
                            selectedBackend={selectedBackend}
                            selectedModelName={selectedModelName}
                            generatedImageCount={generatedImages.length}
                            stageHeaderCopy={stageHeaderCopy}
                            isGalleryDrawer={isGalleryDrawer}
                            usesAdvancedRail={usesAdvancedRail}
                            showGalleryRail={showGalleryRail}
                            focusMode={workspaceLayout.focusMode}
                            assistantPanelOpen={assistantPanelOpen}
                            onOpenGalleryDrawer={() => setGalleryDrawerOpen(true)}
                            onToggleGalleryPinned={() => setGalleryPinned((value) => !value)}
                            onToggleFocusMode={workspaceActions.toggleFocusMode}
                            onOpenComparison={() => setComparisonOpen(true)}
                            onToggleAssistantPanel={() => setAssistantPanelOpen(!assistantPanelOpen)}
                            onOpenDiagnostics={() => setDiagnosticsModalOpen(true)}
                            onOpenShortcuts={modals.openShortcutsModal}
                            onPromoteToWorkflow={handlePromoteToWorkflow}
                        />
                    </Box>

                    <Box className="generate-studio__stage-body">
                        <Suspense fallback={<PanelLoader />}>
                            <LiveGenerationCanvasStage
                                selectedImage={generatedImages[currentImageIndex] || null}
                                totalImages={generatedImages.length}
                                currentImageIndex={currentImageIndex}
                                onPrevImage={goToPrevImage}
                                onNextImage={goToNextImage}
                                isFavorite={isFavorite}
                                onAddFavorite={addFavorite}
                                onRemoveFavorite={removeFavorite}
                                onShowShortcuts={modals.openShortcutsModal}
                                onShowDiagnostics={() => setDiagnosticsModalOpen(true)}
                                hasDiagnosticIssue={hasDiagnosticIssue}
                                getImageActionContext={getCanvasActionContext}
                                showWorkspaceTools={false}
                                workspaceMode={currentMode}
                                selectedModel={selectedModelName}
                                selectedBackend={selectedBackend}
                                generationParams={formValues}
                            />
                        </Suspense>
                    </Box>
                </Box>

                {showGalleryRail && (
                    <>
                        <ResizeHandle
                            direction="horizontal"
                            onPointerDown={galleryPanel.handlePointerDown}
                            onNudge={galleryPanel.nudgeSize}
                            isResizing={galleryPanel.isResizing}
                        />
                        <Box
                            className="generate-studio__gallery-shell generate-studio__gallery-shell--supporting surface-table"
                            style={{
                                flex: `0 0 ${workspaceLayout.galleryWidth}px`,
                                minWidth: workspaceLayout.galleryWidth,
                                maxWidth: workspaceLayout.galleryWidth,
                            }}
                        >
                            <Suspense fallback={<PanelLoader />}>
                                <GalleryPanel
                                    generatedImages={galleryImages}
                                    previewImage={galleryPreviewImage}
                                    generating={generating}
                                    density={workspaceLayout.galleryDensity}
                                    onDensityChange={workspaceActions.setGalleryDensity}
                                    onSelectImage={handleSelectGalleryImage}
                                    onDeleteImage={handleDeleteGalleryImage}
                                    onReorderImages={handleReorderGalleryImages}
                                    onUseAsInitImage={handleUseAsInitImage}
                                />
                            </Suspense>
                        </Box>
                    </>
                )}
            </Box>

            {Boolean(isGalleryDrawer && galleryDrawerOpen) && (
                <Drawer
                    opened
                    onClose={() => setGalleryDrawerOpen(false)}
                    title="Session Gallery"
                    padding="md"
                    size={isStacked ? '100%' : 'md'}
                    position="right"
                    overlayProps={{ backgroundOpacity: 0.5, blur: 6 }}
                >
                    <Box className="generate-studio__gallery-drawer-body">
                        <Suspense fallback={<PanelLoader />}>
                            <GalleryPanel
                                generatedImages={galleryImages}
                                previewImage={galleryPreviewImage}
                                generating={generating}
                                density={workspaceLayout.galleryDensity}
                                onDensityChange={workspaceActions.setGalleryDensity}
                                onSelectImage={handleSelectGalleryImage}
                                onDeleteImage={handleDeleteGalleryImage}
                                onReorderImages={handleReorderGalleryImages}
                                onUseAsInitImage={handleUseAsInitImage}
                            />
                        </Suspense>
                    </Box>
                </Drawer>
            )}

            {diagnosticsModalOpen && (
                <Suspense
                    fallback={(
                        <Modal opened onClose={() => setDiagnosticsModalOpen(false)} title="Generation Diagnostics" size="xl" centered>
                            <ModalLoader />
                        </Modal>
                    )}
                >
                    <GenerationDiagnosticsModal
                        opened={diagnosticsModalOpen}
                        onClose={() => setDiagnosticsModalOpen(false)}
                    />
                </Suspense>
            )}

            {modals.savePresetModal && (
                <Modal
                    opened
                    onClose={() => {
                        modals.closeSavePresetModal();
                        setPresetName('');
                        setPresetDescription('');
                    }}
                    title="Save Parameter Preset"
                >
                    <Stack gap="md">
                        <TextInput
                            label="Preset Name"
                            placeholder="My Custom Preset"
                            required
                            value={presetName}
                            onChange={(event) => setPresetName(event.currentTarget.value)}
                        />
                        <Textarea
                            label="Description (Optional)"
                            placeholder="Describe what this preset is for..."
                            minRows={2}
                            value={presetDescription}
                            onChange={(event) => setPresetDescription(event.currentTarget.value)}
                        />
                        <Text size="xs" c="invokeGray.3">
                            This will save all current parameters except prompt and negative prompt.
                        </Text>
                        <Group justify="flex-end">
                            <SwarmButton
                                tone="secondary"
                                emphasis="ghost"
                                onClick={() => {
                                    modals.closeSavePresetModal();
                                    setPresetName('');
                                    setPresetDescription('');
                                }}
                            >
                                Cancel
                            </SwarmButton>
                            <SwarmButton tone="primary" emphasis="solid" onClick={handleSavePreset}>
                                Save Preset
                            </SwarmButton>
                        </Group>
                    </Stack>
                </Modal>
            )}

            {modals.shortcutsModalOpen && (
                <Modal
                    opened
                    onClose={modals.closeShortcutsModal}
                    title="Keyboard Shortcuts"
                    size="sm"
                >
                    <Stack gap="sm">
                        {KEYBOARD_SHORTCUTS.map((shortcut) => (
                            <Group key={shortcut.key} justify="space-between">
                                <Badge variant="outline" color="invokeGray" size="lg">
                                    {shortcut.key}
                                </Badge>
                                <Text size="sm" c="invokeGray.1">
                                    {shortcut.action}
                                </Text>
                            </Group>
                        ))}
                    </Stack>
                </Modal>
            )}

            {modals.loraModalOpened && (
                <Suspense fallback={<ModalLoader />}>
                    <LoRABrowser
                        opened={modals.loraModalOpened}
                        onClose={modals.closeLoraModal}
                        selectedLoras={activeLoras}
                        onLoraChange={(newLoras) => {
                            setLoras(newLoras);
                            const loraNames = newLoras.map((lora) => lora.lora).join(',');
                            const loraWeights = newLoras.map((lora) => lora.weight).join(',');
                            paramForm.form.setFieldValue('loras', loraNames);
                            paramForm.form.setFieldValue('loraweights', loraWeights);
                        }}
                        onAddToPrompt={(text) => {
                            const currentPrompt = promptValue;
                            const separator = currentPrompt.endsWith(' ') || currentPrompt === '' ? '' : ' ';
                            paramForm.form.setFieldValue('prompt', currentPrompt + separator + text);
                        }}
                    />
                </Suspense>
            )}

            {modals.embeddingModalOpened && (
                <Suspense fallback={<ModalLoader />}>
                    <EmbeddingBrowser
                        opened={modals.embeddingModalOpened}
                        onClose={modals.closeEmbeddingModal}
                        onSelectEmbedding={handleEmbeddingInsert}
                    />
                </Suspense>
            )}

            {modals.modelBrowserOpened && (
                <Suspense fallback={<ModalLoader />}>
                    <ModelBrowser
                        opened={modals.modelBrowserOpened}
                        onClose={modals.closeModelBrowser}
                        selectedModel={selectedModelName}
                        onModelSelect={paramForm.handleModelSelect}
                        onClearModel={() => paramForm.form.setFieldValue('model', '')}
                    />
                </Suspense>
            )}

            {modals.historyDrawerOpened && (
                <Drawer
                    opened
                    onClose={modals.closeHistoryDrawer}
                    title="Generation History"
                    padding="md"
                    size="md"
                    position="right"
                    overlayProps={{ backgroundOpacity: 0.5, blur: 4 }}
                >
                    <Suspense fallback={<ModalLoader />}>
                        <HistoryPanel
                            onLoad={(entry) => {
                                paramForm.form.setValues({
                                    ...formValues,
                                    ...entry.params,
                                    prompt: entry.prompt,
                                    negativeprompt: entry.negativePrompt,
                                    model: entry.model,
                                });
                                modals.closeHistoryDrawer();
                            }}
                        />
                    </Suspense>
                </Drawer>
            )}

            {modals.scheduleModalOpen && (
                <Suspense
                    fallback={(
                        <Modal opened onClose={modals.closeScheduleModal} title="Add to Queue" size="md" centered>
                            <ModalLoader />
                        </Modal>
                    )}
                >
                    <ScheduleJobModal
                        opened={modals.scheduleModalOpen}
                        onClose={modals.closeScheduleModal}
                        onSchedule={(options) => {
                            addQueueJob(formValues, {
                                name: options.name,
                                priority: options.priority,
                                scheduledAt: options.scheduledAt,
                                tags: options.tags,
                                provenance: {
                                    source: 'generate',
                                    recipeId: activeRecipeId || undefined,
                                    recipeName: recipes.find((recipe) => recipe.id === activeRecipeId)?.name,
                                    workspaceMode: currentMode,
                                },
                            });
                            notifications.show({
                                title: options.scheduledAt ? 'Job Scheduled' : 'Added to Queue',
                                message: options.scheduledAt
                                    ? `Job scheduled for ${new Date(options.scheduledAt).toLocaleString()}`
                                    : `Job added to queue with ${options.priority} priority`,
                                color: 'green',
                            });
                        }}
                        params={formValues}
                    />
                </Suspense>
            )}

            {assistantPanelOpen && (
                <Suspense
                    fallback={(
                        <Drawer
                            opened
                            onClose={() => setAssistantPanelOpen(false)}
                            title="Prompt Assistant"
                            position="right"
                            size="lg"
                            padding="md"
                            overlayProps={{ backgroundOpacity: 0.45, blur: 6 }}
                        >
                            <ModalLoader />
                        </Drawer>
                    )}
                >
                    <GenerateAssistantPanel
                        opened={assistantPanelOpen}
                        onClose={() => setAssistantPanelOpen(false)}
                        context={{
                            prompt: promptValue,
                            negativePrompt: negativePromptValue,
                            model: selectedModelName,
                            activeLoras: activeLoras.map((item) => item.lora),
                            activeEmbeddings: Array.isArray(paramForm.form.values['embeddings'])
                                ? (paramForm.form.values['embeddings'] as string[])
                                : [],
                            activeWildcards: Array.isArray(paramForm.form.values['active_wildcards'])
                                ? (paramForm.form.values['active_wildcards'] as string[])
                                : [],
                            featureFlags: [
                                ...(enableInitImage ? ['Init Image'] : []),
                                ...(enableRefiner ? ['Refiner'] : []),
                                ...(enableControlNet ? ['ControlNet'] : []),
                                ...(enableVideo ? ['Video'] : []),
                                ...(enableVariation ? ['Variation'] : []),
                            ],
                        }}
                        onApplyPatch={applyAssistantPatch}
                        onApplyAndGenerate={applyAssistantPatchAndGenerate}
                    />
                </Suspense>
            )}

            {comparisonOpen && (
                <Suspense
                    fallback={(
                        <Modal opened onClose={() => setComparisonOpen(false)} size="90vw" centered withCloseButton={false}>
                            <ModalLoader />
                        </Modal>
                    )}
                >
                    <ImageComparison
                        leftImage={comparisonImages[0]}
                        rightImage={comparisonImages[1]}
                        opened={comparisonOpen}
                        onClose={() => setComparisonOpen(false)}
                    />
                </Suspense>
            )}
        </Box>
    );
});

GeneratePage.displayName = 'GeneratePage';
