import {
    memo,
    useEffect,
    useState,
    useCallback,
    useMemo,
    useRef,
    type ChangeEvent,
    type MouseEvent,
} from 'react';
import { Box, Stack, Paper, Group, Text, Tooltip, Divider, ScrollArea, Badge, ColorInput, Collapse, Textarea, Select, Progress } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
    IconArrowBackUp,
    IconArrowForwardUp,
    IconBrush,
    IconCheck,
    IconChevronDown,
    IconChevronUp,
    IconClipboard,
    IconCrop,
    IconEraser,
    IconEye,
    IconEyeOff,
    IconHandStop,
    IconLayersIntersect,
    IconPaint,
    IconPhotoPlus,
    IconSettings,
    IconSparkles,
    IconSquare,
    IconSwitchHorizontal,
    IconTargetArrow,
    IconTrash,
    IconX,
    IconZoomIn,
    IconZoomOut,
} from '@tabler/icons-react';
import { swarmClient } from '../../api/client';
import type { GenerateParams, Model } from '../../api/types';
import { useCanvasEditor } from '../../hooks/useCanvasEditor';
import { useBackends } from '../../hooks/useModels';
import { useCanvasEditorStore, type CanvasSelection, type CanvasTool } from '../../stores/canvasEditorStore';
import { usePromptBuilderStore } from '../../stores/promptBuilderStore';
import { compilePromptBuilder, normalizedRegionToPixels, type CanvasApplyPayload } from '../../features/promptBuilder';
import { RegionalPromptEditor } from './RegionalPromptEditor';
import { SegmentRulesPanel } from './SegmentRulesPanel';
import { OutpaintControls } from './OutpaintControls';
import type { CanvasWorkflowResult, CanvasWorkflowStep } from '../../stores/canvasWorkflowStore';
import { SwarmActionIcon, SwarmButton, SwarmSlider } from '../ui';

interface CanvasEditorProps {
    imageUrl: string;
    width?: number;
    height?: number;
    onMaskChange?: (maskDataUrl: string | null) => void;
    onClose?: () => void;
    onApply?: (payload: CanvasApplyPayload) => void;
    mode?: 'inpaint' | 'outpaint' | 'regional' | 'workflow';
    workflowStep?: CanvasWorkflowStep;
    onWorkflowStepChange?: (step: CanvasWorkflowStep) => void;
    onApplyToGenerate?: (payload: CanvasApplyPayload) => void;
    onGenerateFromCanvas?: (payload: CanvasApplyPayload) => void;
    onGenerateWithInvoke?: (payload: CanvasApplyPayload) => void;
    invokeGenerationBusy?: boolean;
    invokeGenerationAvailable?: boolean;
    models?: Model[];
    loadingModels?: boolean;
    selectedModel?: string;
    detectedModel?: string | null;
    loadingModel?: boolean;
    modelLoadProgress?: number;
    modelLoadingCount?: number;
    modelLoadProgressEstimated?: boolean;
    modelLoadError?: string | null;
    onModelSelect?: (modelName: string | null) => void;
    onOpenUpscaler?: () => void;
    pendingResult?: CanvasWorkflowResult | null;
    onUsePendingResult?: () => void;
    onContinueRefining?: () => void;
    clearMaskVersion?: number;
    sam2BaseParams?: Partial<GenerateParams>;
}

interface SamPoint {
    x: number;
    y: number;
}

const TOOLS: { id: CanvasTool; icon: typeof IconBrush; label: string; shortcut: string }[] = [
    { id: 'brush', icon: IconBrush, label: 'Brush', shortcut: 'B' },
    { id: 'eraser', icon: IconEraser, label: 'Eraser', shortcut: 'E' },
    { id: 'pan', icon: IconHandStop, label: 'Pan', shortcut: 'H' },
    { id: 'select', icon: IconSquare, label: 'Select', shortcut: 'S' },
    { id: 'region', icon: IconLayersIntersect, label: 'Region', shortcut: 'R' },
    { id: 'crop', icon: IconCrop, label: 'Move Layer', shortcut: 'C' },
    { id: 'sam2points', icon: IconTargetArrow, label: 'SAM2 Points', shortcut: 'Y' },
    { id: 'sam2bbox', icon: IconSquare, label: 'SAM2 BBox', shortcut: 'U' },
];

const FOCUSED_WORKFLOW_TOOLS = new Set<CanvasTool>(['select', 'brush', 'eraser', 'pan']);
const FOCUSED_WORKFLOW_ALLOWED_TOOLS = new Set<CanvasTool>(['select', 'brush', 'eraser', 'pan', 'sam2bbox', 'sam2points']);
const BRUSH_SIZES = [5, 10, 25, 50, 100, 200];
const REGION_INFO = 'var(--theme-info)';
const REGION_WARNING = 'var(--theme-warning)';
const WORKFLOW_STEPS: Array<{
    id: CanvasWorkflowStep;
    label: string;
    helper: string;
}> = [
    { id: 'source', label: '1. Source', helper: 'Extend the canvas, move the base image, and import overlay layers before masking.' },
    { id: 'mask', label: '2. Mask', helper: 'Use selection to constrain brush, erase, fill, invert, and SAM2-assisted masking.' },
    { id: 'regions', label: '3. Regions', helper: 'Draw and label prompt regions for separate characters, clothing, or background areas.' },
    { id: 'segments', label: '4. Segments', helper: 'Use segment helpers for face, hair, clothing, or background cleanup.' },
    { id: 'generate', label: '5. Generate', helper: 'Sync back to Generate, run the inpaint step, or continue refining from the new result.' },
];
const TOOL_GUIDANCE: Record<CanvasTool, {
    title: string;
    description: string;
    recipeLabel: string;
    steps: string[];
    followUp: string;
}> = {
    brush: {
        title: 'Brush',
        description: 'Paint mask where you want the model to change or refine the image.',
        recipeLabel: 'Masking Recipe',
        steps: ['1. Paint only the areas you want regenerated.', '2. Use this after SAM2 to add missing mask coverage.', '3. Generate once the mask matches the change you want.'],
        followUp: 'When the mask looks right, use Generate Actions to send it back to Generate.',
    },
    eraser: {
        title: 'Eraser',
        description: 'Remove mask from places you do not want changed.',
        recipeLabel: 'Cleanup Recipe',
        steps: ['1. Erase mask from areas you want protected.', '2. Use this after SAM2 or Brush to clean edges.', '3. Switch back to Brush if you still need more masked area.'],
        followUp: 'Switch back to Brush once the protected areas are clear.',
    },
    pan: {
        title: 'Pan',
        description: 'Move around the workspace without editing the image or mask.',
        recipeLabel: 'Navigation Recipe',
        steps: ['1. Zoom in on the detail you want to inspect.', '2. Pan to the exact area.', '3. Switch back to an editing tool when you are ready to change something.'],
        followUp: 'Return to Brush, Select, Region, or SAM2 when you are ready to edit.',
    },
    select: {
        title: 'Select Box',
        description: 'Create a temporary working area that limits brush, fill, invert, and SAM2 actions.',
        recipeLabel: 'Selection Recipe',
        steps: ['1. Draw a box over the area you want to work on.', '2. Run SAM2 or paint inside that box only.', '3. Clear the selection when you want to return to the full image.'],
        followUp: 'Clear the selection when you want to edit the full canvas again.',
    },
    region: {
        title: 'Region Box',
        description: 'Draw prompt-controlled areas, then describe what each box is and what should appear inside it.',
        recipeLabel: 'Regional Prompt Recipe',
        steps: ['1. Draw a box over the part of the image you want to guide.', '2. Name what that area is in the Region card.', '3. Describe what you want added, changed, or emphasized in that area.'],
        followUp: 'Use Region Label for what it is, and Region Prompt for what should be added or changed.',
    },
    crop: {
        title: 'Move Layer',
        description: 'Reposition the base image or any imported overlay layer inside the workspace.',
        recipeLabel: 'Composition Recipe',
        steps: ['1. Extend the canvas if you need more room.', '2. Move the base image or an imported layer into place.', '3. Start masking only after the composition is where you want it.'],
        followUp: 'Use this before masking so the composition is in the right place.',
    },
    sam2points: {
        title: 'SAM2 Points',
        description: 'Use point prompts to automatically create a mask from the image content.',
        recipeLabel: 'SAM2 Recipe',
        steps: ['1. Optional: use Select first to limit the area.', '2. Left click what should be included and right click what should be excluded.', '3. Clean the resulting mask with Brush or Eraser.'],
        followUp: 'SAM2 only builds the mask. Afterward, use Brush/Eraser to clean it up or Region boxes to describe the content.',
    },
    sam2bbox: {
        title: 'SAM2 BBox',
        description: 'Drag a box around an object to ask SAM2 for a mask inside that box.',
        recipeLabel: 'SAM2 Recipe',
        steps: ['1. Optional: use Select first to limit the area.', '2. Drag a box around the object you want masked.', '3. Clean the resulting mask with Brush or Eraser.'],
        followUp: 'After the mask appears, switch to Brush/Eraser for cleanup or Region boxes for text guidance.',
    },
};

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function normalizeSelectionRect(selection: CanvasSelection | null): CanvasSelection | null {
    if (!selection || selection.width <= 0 || selection.height <= 0) {
        return null;
    }
    return {
        x: Math.round(selection.x),
        y: Math.round(selection.y),
        width: Math.max(1, Math.round(selection.width)),
        height: Math.max(1, Math.round(selection.height)),
    };
}

function pointInsideSelection(point: SamPoint, selection: CanvasSelection | null): boolean {
    if (!selection) {
        return true;
    }
    return point.x >= selection.x
        && point.x <= selection.x + selection.width
        && point.y >= selection.y
        && point.y <= selection.y + selection.height;
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new window.Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
        image.src = src;
    });
}

function fileToDataUrl(file: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error ?? new Error('Failed to read file.'));
        reader.readAsDataURL(file);
    });
}

function stripPlaceholderModelValue(params: GenerateParams, key: string): void {
    const value = params[key];
    if (typeof value !== 'string') {
        return;
    }
    const normalized = value.trim().toLowerCase();
    if (!normalized || normalized === 'automatic' || normalized === 'none') {
        delete params[key];
    }
}

export const CanvasEditor = memo(function CanvasEditor({
    imageUrl,
    onMaskChange,
    onClose,
    onApply,
    mode = 'inpaint',
    workflowStep = 'source',
    onWorkflowStepChange,
    onApplyToGenerate,
    onGenerateFromCanvas,
    onGenerateWithInvoke,
    invokeGenerationBusy = false,
    invokeGenerationAvailable = false,
    models = [],
    loadingModels = false,
    selectedModel = '',
    detectedModel = null,
    loadingModel = false,
    modelLoadProgress = 0,
    modelLoadingCount = 0,
    modelLoadProgressEstimated = false,
    modelLoadError = null,
    onModelSelect,
    onOpenUpscaler,
    pendingResult,
    onUsePendingResult,
    onContinueRefining,
    clearMaskVersion = 0,
    sam2BaseParams,
}: CanvasEditorProps) {
    const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);
    const [loadedImageUrl, setLoadedImageUrl] = useState<string | null>(null);
    const [layerImageMap, setLayerImageMap] = useState<Record<string, HTMLImageElement>>({});
    const [sam2Available, setSam2Available] = useState<boolean | null>(null);
    const [sam2Busy, setSam2Busy] = useState(false);
    const [sam2MaskReady, setSam2MaskReady] = useState(false);
    const [sam2Points, setSam2Points] = useState<{ positive: SamPoint[]; negative: SamPoint[] }>({ positive: [], negative: [] });
    const [sam2BoxStart, setSam2BoxStart] = useState<SamPoint | null>(null);
    const [sam2BoxDraft, setSam2BoxDraft] = useState<CanvasSelection | null>(null);
    const [editPrompt, setEditPrompt] = useState('');
    const [advancedToolsOpen, setAdvancedToolsOpen] = useState(false);

    const previousLayoutRef = useRef<{ width: number; height: number; offsetX: number; offsetY: number } | null>(null);
    const autoFilledSelectionRef = useRef<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const {
        currentTool,
        setTool,
        brushSettings,
        setBrushSettings,
        zoom,
        panX,
        panY,
        zoomIn,
        zoomOut,
        maskOpacity,
        setMaskOpacity,
        maskColor,
        setMaskColor,
        showMask,
        toggleMaskVisibility,
        activeRegionId,
        showRegions,
        canvasWidth,
        canvasHeight,
        originalWidth,
        originalHeight,
        imageOffsetX,
        imageOffsetY,
        openEditor,
        imageLayers,
        activeImageLayerId,
        setActiveImageLayer,
        addImageLayer,
        updateImageLayer,
        removeImageLayer,
        reorderImageLayer,
        clearImageLayers,
        selection,
        clearSelection,
    } = useCanvasEditorStore();

    const regions = usePromptBuilderStore((state) => state.regions);
    const segments = usePromptBuilderStore((state) => state.segments);
    const syncState = usePromptBuilderStore((state) => state.syncState);
    const setSourceContext = usePromptBuilderStore((state) => state.setSourceContext);
    const applyFromCanvas = usePromptBuilderStore((state) => state.applyFromCanvas);
    const activeRegion = regions.find((region) => region.id === activeRegionId) ?? null;
    const activeLayer = imageLayers.find((layer) => layer.id === activeImageLayerId) ?? null;
    const backendsQuery = useBackends();

    const {
        canvasRef,
        maskCanvasRef,
        containerRef,
        canUndo,
        canRedo,
        startDrawing,
        draw,
        stopDrawing,
        clearMask,
        fillMask,
        invertMask,
        getMaskDataUrl,
        getCompositeImageDataUrl,
        applyMaskImage,
        undo,
        redo,
        handleWheel,
        handlePanStart,
        handlePan,
        handlePanEnd,
        isPanning,
        regionDraft,
        selectionDraft,
        getCanvasPoint,
    } = useCanvasEditor();

    const isWorkflowMode = mode === 'workflow';
    const isFocusedWorkflowMode = isWorkflowMode;
    const supportsPromptBuilder = mode === 'regional' || isWorkflowMode;
    const imageLoaded = imageElement !== null && loadedImageUrl === imageUrl;
    const activeSelectionRect = normalizeSelectionRect(selection);
    const selectionRect = normalizeSelectionRect(selectionDraft ?? selection);
    const title = isFocusedWorkflowMode ? 'Change Area' : isWorkflowMode ? 'Canvas Workflow' : mode === 'outpaint' ? 'Outpaint Editor' : mode === 'regional' ? 'Regional Prompt Editor' : 'Inpaint Editor';
    const hasOutpaintCanvas = canvasWidth !== originalWidth || canvasHeight !== originalHeight || imageOffsetX !== 0 || imageOffsetY !== 0;
    const showOutpaintControls = mode === 'outpaint' || (isWorkflowMode && workflowStep === 'source') || hasOutpaintCanvas;
    const layerRows = [{ id: null, name: 'Base Image', visible: true, opacity: 1, x: imageOffsetX, y: imageOffsetY, width: originalWidth, height: originalHeight }, ...imageLayers];
    const regionSummary = activeRegion?.label?.trim() || activeRegion?.prompt.trim().split(/\s+/).slice(0, 3).join(' ') || null;
    const activeWorkflowStep = WORKFLOW_STEPS.find((step) => step.id === workflowStep) ?? WORKFLOW_STEPS[0];
    const currentToolGuidance = TOOL_GUIDANCE[currentTool];
    const primaryWorkflowAction = isWorkflowMode
        ? (() => {
            switch (workflowStep) {
                case 'source':
                    return { label: 'Start Masking', step: 'mask' as CanvasWorkflowStep };
                case 'mask':
                    return { label: 'Review Regions', step: 'regions' as CanvasWorkflowStep };
                case 'regions':
                    return { label: 'Open Segment Assist', step: 'segments' as CanvasWorkflowStep };
                case 'segments':
                    return { label: 'Review Generate Actions', step: 'generate' as CanvasWorkflowStep };
                default:
                    return null;
            }
        })()
        : null;
    const visibleTools = isFocusedWorkflowMode
        ? TOOLS.filter((tool) => FOCUSED_WORKFLOW_TOOLS.has(tool.id))
        : TOOLS;
    const autoGenerateLabel = invokeGenerationAvailable ? 'Generate with InvokeAI' : 'Generate Edit';
    const autoGenerateHelp = invokeGenerationAvailable
        ? 'InvokeAI is connected, so this edit can run directly from Canvas.'
        : 'Uses the normal Generate setup with the selected model.';
    const modelOptions = useMemo(() => {
        const options = models.map((model) => {
            const label = model.title && model.title !== model.name
                ? `${model.title} (${model.name})`
                : model.name;
            return {
                value: model.name,
                label: model.loaded ? label : `${label} - load`,
            };
        });
        const selected = selectedModel.trim();
        if (selected && !options.some((option) => option.value === selected)) {
            options.unshift({
                value: selected,
                label: detectedModel === selected ? `${selected} - from metadata` : selected,
            });
        }
        return options;
    }, [detectedModel, models, selectedModel]);
    const selectedModelValue = selectedModel.trim() || null;
    const modelProgressValue = modelLoadProgressEstimated && modelLoadProgress <= 0
        ? 100
        : Math.max(0, Math.min(100, modelLoadProgress));

    const clearSam2State = useCallback(() => {
        setSam2Points({ positive: [], negative: [] });
        setSam2BoxStart(null);
        setSam2BoxDraft(null);
    }, []);

    const handleClearMask = useCallback(() => {
        clearMask();
        setSam2MaskReady(false);
    }, [clearMask]);

    const handleClearArea = useCallback(() => {
        clearMask();
        clearSelection();
        clearSam2State();
        autoFilledSelectionRef.current = null;
        setSam2MaskReady(false);
    }, [clearMask, clearSam2State, clearSelection]);

    const handleAutoSelectArea = useCallback(() => {
        setTool(sam2Available ? 'sam2bbox' : 'select');
    }, [sam2Available, setTool]);

    const handlePromoteSam2ToRegions = useCallback(() => {
        setTool('region');
        onWorkflowStepChange?.('regions');
    }, [onWorkflowStepChange, setTool]);

    const handleReviewGenerateStep = useCallback(() => {
        onWorkflowStepChange?.('generate');
    }, [onWorkflowStepChange]);

    const handleImportImage = useCallback(async (src: string, suggestedName?: string) => {
        try {
            const image = await loadImageElement(src);
            const targetSelection = normalizeSelectionRect(selection);
            const nextX = targetSelection
                ? clamp(targetSelection.x + (targetSelection.width - image.width) / 2, 0, Math.max(0, canvasWidth - image.width))
                : clamp((canvasWidth - image.width) / 2, 0, Math.max(0, canvasWidth - image.width));
            const nextY = targetSelection
                ? clamp(targetSelection.y + (targetSelection.height - image.height) / 2, 0, Math.max(0, canvasHeight - image.height))
                : clamp((canvasHeight - image.height) / 2, 0, Math.max(0, canvasHeight - image.height));
            addImageLayer({
                src,
                name: suggestedName || `Layer ${imageLayers.length + 1}`,
                x: nextX,
                y: nextY,
                width: image.width,
                height: image.height,
                visible: true,
                opacity: 1,
            });
            setTool('crop');
            notifications.show({ title: 'Image Layer Added', message: 'The pasted image was added as a movable layer.', color: 'green' });
        } catch (error) {
            notifications.show({ title: 'Import Failed', message: error instanceof Error ? error.message : 'Could not import that image.', color: 'red' });
        }
    }, [addImageLayer, canvasHeight, canvasWidth, imageLayers.length, selection, setTool]);

    const handlePasteClipboardImage = useCallback(async () => {
        if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
            notifications.show({ title: 'Clipboard Unavailable', message: 'Use Ctrl+V while the editor is open if direct clipboard reads are blocked.', color: 'yellow' });
            return;
        }
        try {
            const items = await navigator.clipboard.read();
            for (const item of items) {
                const imageType = item.types.find((type) => type.startsWith('image/'));
                if (!imageType) {
                    continue;
                }
                const blob = await item.getType(imageType);
                await handleImportImage(await fileToDataUrl(blob), 'Clipboard Layer');
                return;
            }
            notifications.show({ title: 'No Image Found', message: 'The clipboard did not contain an image.', color: 'yellow' });
        } catch (error) {
            notifications.show({ title: 'Paste Failed', message: error instanceof Error ? error.message : 'Could not read from the clipboard.', color: 'red' });
        }
    }, [handleImportImage]);

    const handleFileInputChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.currentTarget.files?.[0];
        if (!file) {
            return;
        }
        try {
            await handleImportImage(await fileToDataUrl(file), file.name.replace(/\.[^.]+$/, '') || 'Imported Layer');
        } finally {
            event.currentTarget.value = '';
        }
    }, [handleImportImage]);

    useEffect(() => {
        previousLayoutRef.current = null;
        autoFilledSelectionRef.current = null;
        setEditPrompt('');
        setAdvancedToolsOpen(false);
        clearSam2State();
        setSam2MaskReady(false);
        const img = new window.Image();
        let retried = false;
        img.onload = () => {
            setImageElement(img);
            setLoadedImageUrl(imageUrl);
            openEditor(imageUrl, img.width, img.height);
            if (isFocusedWorkflowMode) {
                setTool('select');
            }
        };
        img.onerror = () => {
            if (!retried) {
                retried = true;
                img.crossOrigin = 'anonymous';
                img.src = imageUrl;
            } else {
                console.error('Failed to load image:', imageUrl);
            }
        };
        img.src = imageUrl;
    }, [clearSam2State, imageUrl, isFocusedWorkflowMode, openEditor, setTool]);

    useEffect(() => {
        let cancelled = false;
        const loadLayers = async () => {
            const nextMap: Record<string, HTMLImageElement> = {};
            for (const layer of imageLayers) {
                try {
                    nextMap[layer.id] = await loadImageElement(layer.src);
                } catch (error) {
                    console.warn('Failed to load canvas layer', layer.id, error);
                }
            }
            if (!cancelled) {
                setLayerImageMap(nextMap);
            }
        };
        void loadLayers();
        return () => {
            cancelled = true;
        };
    }, [imageLayers]);

    useEffect(() => {
        if (backendsQuery.error) {
            setSam2Available(null);
            return;
        }
        if (!backendsQuery.data) {
            return;
        }
        setSam2Available(
            backendsQuery.data.some(
                (backend) =>
                    Array.isArray((backend as { features?: unknown }).features)
                    && ((backend as { features?: unknown[] }).features ?? []).includes('sam2')
            )
        );
    }, [backendsQuery.data, backendsQuery.error]);

    useEffect(() => {
        if (!imageLoaded) {
            return;
        }
        setSourceContext({ imageUrl, imageWidth: canvasWidth, imageHeight: canvasHeight });
    }, [canvasHeight, canvasWidth, imageLoaded, imageUrl, setSourceContext]);

    useEffect(() => {
        if (!imageElement || !canvasRef.current || !maskCanvasRef.current) {
            return;
        }
        const canvas = canvasRef.current;
        const maskCanvas = maskCanvasRef.current;
        const previousLayout = previousLayoutRef.current;
        let previousMaskCanvas: HTMLCanvasElement | null = null;
        if (previousLayout && maskCanvas.width > 0 && maskCanvas.height > 0) {
            previousMaskCanvas = document.createElement('canvas');
            previousMaskCanvas.width = maskCanvas.width;
            previousMaskCanvas.height = maskCanvas.height;
            previousMaskCanvas.getContext('2d')?.drawImage(maskCanvas, 0, 0);
        }
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const canvasContext = canvas.getContext('2d');
        if (canvasContext) {
            canvasContext.clearRect(0, 0, canvas.width, canvas.height);
            canvasContext.drawImage(imageElement, imageOffsetX, imageOffsetY);
            for (const layer of imageLayers) {
                if (!layer.visible || !layerImageMap[layer.id]) {
                    continue;
                }
                canvasContext.save();
                canvasContext.globalAlpha = layer.opacity;
                canvasContext.drawImage(layerImageMap[layer.id], layer.x, layer.y, layer.width, layer.height);
                canvasContext.restore();
            }
        }
        maskCanvas.width = canvasWidth;
        maskCanvas.height = canvasHeight;
        const maskContext = maskCanvas.getContext('2d');
        if (maskContext) {
            maskContext.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
            if (previousMaskCanvas && previousLayout) {
                maskContext.drawImage(previousMaskCanvas, imageOffsetX - previousLayout.offsetX, imageOffsetY - previousLayout.offsetY);
            }
        }
        previousLayoutRef.current = { width: canvasWidth, height: canvasHeight, offsetX: imageOffsetX, offsetY: imageOffsetY };
    }, [canvasHeight, canvasWidth, canvasRef, imageElement, imageLayers, imageOffsetX, imageOffsetY, layerImageMap, maskCanvasRef]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }
            switch (e.key.toLowerCase()) {
                case 'b': setTool('brush'); break;
                case 'e': setTool('eraser'); break;
                case 'h':
                case ' ': setTool('pan'); break;
                case 's': setTool('select'); break;
                case 'r':
                    if (!isFocusedWorkflowMode || advancedToolsOpen) {
                        setTool('region');
                    }
                    break;
                case 'c':
                    if (!isFocusedWorkflowMode || advancedToolsOpen) {
                        setTool('crop');
                    }
                    break;
                case 'y':
                    if (!isFocusedWorkflowMode || advancedToolsOpen) {
                        setTool('sam2points');
                    }
                    break;
                case 'u':
                    if (!isFocusedWorkflowMode || advancedToolsOpen) {
                        setTool('sam2bbox');
                    }
                    break;
                case 'z':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        if (e.shiftKey) {
                            redo();
                        } else {
                            undo();
                        }
                    }
                    break;
                case '[': setBrushSettings({ size: Math.max(1, brushSettings.size - 10) }); break;
                case ']': setBrushSettings({ size: Math.min(200, brushSettings.size + 10) }); break;
                case 'delete':
                case 'backspace':
                    if (activeImageLayerId) {
                        removeImageLayer(activeImageLayerId);
                    } else if (selectionRect) {
                        handleClearMask();
                    }
                    break;
                case 'escape':
                    clearSelection();
                    clearSam2State();
                    onClose?.();
                    break;
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeImageLayerId, advancedToolsOpen, brushSettings.size, clearSam2State, clearSelection, handleClearMask, isFocusedWorkflowMode, onClose, redo, removeImageLayer, selectionRect, setBrushSettings, setTool, undo]);

    useEffect(() => {
        const handlePaste = async (event: ClipboardEvent) => {
            const items = Array.from(event.clipboardData?.items ?? []);
            const imageItem = items.find((item) => item.type.startsWith('image/'));
            const file = imageItem?.getAsFile();
            if (!file) {
                return;
            }
            event.preventDefault();
            await handleImportImage(await fileToDataUrl(file), 'Clipboard Layer');
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [handleImportImage]);

    useEffect(() => {
        if (!clearMaskVersion) {
            return;
        }
        const maskCanvas = maskCanvasRef.current;
        const maskContext = maskCanvas?.getContext('2d');
        if (maskCanvas && maskContext) {
            maskContext.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
        }
        clearSam2State();
        clearSelection();
        autoFilledSelectionRef.current = null;
        setEditPrompt('');
        setSam2MaskReady(false);
    }, [clearMaskVersion, clearSam2State, clearSelection, maskCanvasRef]);

    useEffect(() => {
        if (isFocusedWorkflowMode && !advancedToolsOpen && !FOCUSED_WORKFLOW_ALLOWED_TOOLS.has(currentTool)) {
            setTool('select');
        }
    }, [advancedToolsOpen, currentTool, isFocusedWorkflowMode, setTool]);

    useEffect(() => {
        if (!isFocusedWorkflowMode || currentTool !== 'select' || !activeSelectionRect) {
            return;
        }
        const selectionKey = `${activeSelectionRect.x}:${activeSelectionRect.y}:${activeSelectionRect.width}:${activeSelectionRect.height}`;
        if (autoFilledSelectionRef.current === selectionKey) {
            return;
        }
        autoFilledSelectionRef.current = selectionKey;
        fillMask();
        setTool('brush');
        notifications.show({
            title: 'Area Marked',
            message: 'The boxed area is ready to edit. Brush or erase if you want to refine it.',
            color: 'green',
        });
    }, [activeSelectionRect, currentTool, fillMask, isFocusedWorkflowMode, setTool]);

    const buildApplyPayload = useCallback((): CanvasApplyPayload => {
        const maskDataUrl = getMaskDataUrl();
        const compiled = supportsPromptBuilder
            ? compilePromptBuilder({ regions, segments })
            : { managedBlock: '', blockHash: '', managedLines: [], hasContent: false, regionCount: 0, segmentCount: 0 };
        return {
            mode: mode === 'workflow' ? 'regional' : mode,
            sourceImageUrl: imageUrl,
            sourceImageWidth: canvasWidth,
            sourceImageHeight: canvasHeight,
            editPrompt: editPrompt.trim() || undefined,
            initImageDataUrl: getCompositeImageDataUrl() ?? undefined,
            maskDataUrl: maskDataUrl,
            hasMask: !!maskDataUrl,
            hasOutpaintCanvas: hasOutpaintCanvas || imageLayers.length > 0,
            regions,
            segments,
            managedBlock: compiled.managedBlock,
            managedBlockHash: compiled.blockHash,
            syncState: supportsPromptBuilder ? 'synced' : syncState,
        };
    }, [canvasHeight, canvasWidth, editPrompt, getCompositeImageDataUrl, getMaskDataUrl, hasOutpaintCanvas, imageLayers.length, imageUrl, mode, regions, segments, supportsPromptBuilder, syncState]);

    const handleApply = useCallback(() => {
        const payload = buildApplyPayload();
        onMaskChange?.(payload.maskDataUrl);
        if (supportsPromptBuilder) {
            applyFromCanvas(payload);
        }
        onApply?.(payload);
        return payload;
    }, [applyFromCanvas, buildApplyPayload, onApply, onMaskChange, supportsPromptBuilder]);

    const handleWorkflowAction = useCallback((action: 'apply' | 'generate' | 'invoke') => {
        const payload = handleApply();
        if (action === 'apply') {
            onApplyToGenerate?.(payload);
        } else if (action === 'generate') {
            onGenerateFromCanvas?.(payload);
        } else {
            onGenerateWithInvoke?.(payload);
        }
    }, [handleApply, onApplyToGenerate, onGenerateFromCanvas, onGenerateWithInvoke]);

    const handlePrimaryGenerate = useCallback(() => {
        const payload = handleApply();
        if (!payload.maskDataUrl) {
            notifications.show({
                title: 'Mark an Area First',
                message: 'Drag a box or paint the area you want changed before generating.',
                color: 'yellow',
            });
            return;
        }
        if (!payload.editPrompt?.trim()) {
            notifications.show({
                title: 'Describe the Change',
                message: 'Write what should change in the marked area before generating.',
                color: 'yellow',
            });
            return;
        }
        if (invokeGenerationAvailable) {
            onGenerateWithInvoke?.(payload);
            return;
        }
        onGenerateFromCanvas?.(payload);
    }, [handleApply, invokeGenerationAvailable, onGenerateFromCanvas, onGenerateWithInvoke]);

    const buildSam2BaseParams = useCallback((targetSelection: CanvasSelection | null): GenerateParams | null => {
        const initimage = getCompositeImageDataUrl(targetSelection);
        if (!initimage) {
            return null;
        }
        const resolvedModel = typeof sam2BaseParams?.model === 'string' ? sam2BaseParams.model.trim() : '';
        const resolvedVae = typeof sam2BaseParams?.vae === 'string' ? sam2BaseParams.vae : undefined;
        const nextParams: GenerateParams = {
            model: resolvedModel,
            initimage,
            prompt: '',
            images: 1,
            width: targetSelection ? targetSelection.width : canvasWidth,
            height: targetSelection ? targetSelection.height : canvasHeight,
            donotsave: true,
        };
        if (resolvedVae) {
            nextParams.vae = resolvedVae;
            stripPlaceholderModelValue(nextParams, 'vae');
        }
        if (typeof nextParams.model !== 'string' || !nextParams.model.trim()) {
            notifications.show({
                title: 'Model Required',
                message: 'Select a model on Generate before using the SAM2 tools.',
                color: 'yellow',
            });
            return null;
        }
        return nextParams;
    }, [canvasHeight, canvasWidth, getCompositeImageDataUrl, sam2BaseParams]);

    const requestSam2Mask = useCallback(async (params: GenerateParams, targetSelection: CanvasSelection | null) => {
        setSam2Busy(true);
        try {
            const imageUrlResult = await new Promise<string>((resolve, reject) => {
                let finished = false;
                const socket = swarmClient.generateImage(params, {
                    onImage: (data) => {
                        if (finished || typeof data.image !== 'string') {
                            return;
                        }
                        finished = true;
                        try {
                            socket.close();
                        } catch {
                            // The request already has the image, so a late socket close failure can be ignored.
                        }
                        resolve(data.image);
                    },
                    onDataError: (message) => {
                        if (!finished) {
                            finished = true;
                            reject(new Error(message || 'SAM2 request failed.'));
                        }
                    },
                    onError: () => {
                        if (!finished) {
                            finished = true;
                            reject(new Error('The SAM2 request could not reach the backend.'));
                        }
                    },
                    onComplete: () => {
                        if (!finished) {
                            finished = true;
                            reject(new Error('The SAM2 request completed without returning a mask image.'));
                        }
                    },
                });
            });
            applyMaskImage(await loadImageElement(imageUrlResult), targetSelection);
            setSam2MaskReady(true);
            notifications.show({ title: 'SAM2 Mask Updated', message: 'The mask was updated from the SAM2 result.', color: 'green' });
        } catch (error) {
            notifications.show({ title: 'SAM2 Failed', message: error instanceof Error ? error.message : 'Could not generate a SAM2 mask.', color: 'red' });
        } finally {
            setSam2Busy(false);
        }
    }, [applyMaskImage]);

    const queueSam2PointsRequest = useCallback(async (nextPoints: { positive: SamPoint[]; negative: SamPoint[] }) => {
        if (nextPoints.positive.length === 0) {
            notifications.show({ title: 'SAM2 Needs a Positive Point', message: 'Add at least one positive point first.', color: 'yellow' });
            return;
        }
        const targetSelection = normalizeSelectionRect(selection);
        const baseParams = buildSam2BaseParams(targetSelection);
        if (!baseParams) {
            return;
        }
        const offsetX = targetSelection?.x ?? 0;
        const offsetY = targetSelection?.y ?? 0;
        await requestSam2Mask({
            ...baseParams,
            sampositivepoints: JSON.stringify(nextPoints.positive.map((point) => ({ x: Math.round(point.x - offsetX), y: Math.round(point.y - offsetY) }))),
            samnegativepoints: nextPoints.negative.length > 0 ? JSON.stringify(nextPoints.negative.map((point) => ({ x: Math.round(point.x - offsetX), y: Math.round(point.y - offsetY) }))) : undefined,
        }, targetSelection);
    }, [buildSam2BaseParams, requestSam2Mask, selection]);

    const queueSam2BboxRequest = useCallback(async (bbox: CanvasSelection) => {
        const targetSelection = normalizeSelectionRect(selection);
        const baseParams = buildSam2BaseParams(targetSelection);
        if (!baseParams) {
            return;
        }
        const offsetX = targetSelection?.x ?? 0;
        const offsetY = targetSelection?.y ?? 0;
        await requestSam2Mask({
            ...baseParams,
            sambbox: JSON.stringify([
                Math.round(bbox.x - offsetX),
                Math.round(bbox.y - offsetY),
                Math.round(bbox.x + bbox.width - offsetX),
                Math.round(bbox.y + bbox.height - offsetY),
            ]),
        }, targetSelection);
    }, [buildSam2BaseParams, requestSam2Mask, selection]);

    const handleSam2PointMouseDown = useCallback((e: MouseEvent) => {
        if (sam2Busy) {
            return;
        }
        if (e.button !== 0 && e.button !== 2) {
            return;
        }
        if (sam2Available === false) {
            notifications.show({ title: 'SAM2 Unavailable', message: 'This backend does not currently report SAM2 support.', color: 'yellow' });
            return;
        }
        const point = getCanvasPoint(e);
        if (!pointInsideSelection(point, selectionRect)) {
            return;
        }
        e.preventDefault();
        const isNegative = e.button === 2;
        const nextPoints = {
            positive: isNegative ? sam2Points.positive : [...sam2Points.positive, point],
            negative: isNegative ? [...sam2Points.negative, point] : sam2Points.negative,
        };
        setSam2Points(nextPoints);
        void queueSam2PointsRequest(nextPoints);
    }, [getCanvasPoint, queueSam2PointsRequest, sam2Available, sam2Busy, sam2Points, selectionRect]);

    const handleCanvasMouseDown = useCallback((e: MouseEvent<HTMLDivElement>) => {
        handlePanStart(e);
        if (currentTool === 'pan') {
            return;
        }
        if (currentTool === 'sam2points') {
            handleSam2PointMouseDown(e);
            return;
        }
        if (currentTool === 'sam2bbox') {
            if (sam2Busy) {
                return;
            }
            if (e.button !== 0) {
                return;
            }
            const point = getCanvasPoint(e);
            if (!pointInsideSelection(point, selectionRect)) {
                return;
            }
            setSam2BoxStart(point);
            setSam2BoxDraft({ x: point.x, y: point.y, width: 0, height: 0 });
            return;
        }
        startDrawing(e);
    }, [currentTool, getCanvasPoint, handlePanStart, handleSam2PointMouseDown, sam2Busy, selectionRect, startDrawing]);

    const handleCanvasMouseMove = useCallback((e: MouseEvent<HTMLDivElement>) => {
        handlePan(e);
        if (currentTool === 'pan') {
            return;
        }
        if (currentTool === 'sam2bbox' && sam2BoxStart) {
            const point = getCanvasPoint(e);
            const minX = selectionRect ? clamp(Math.min(sam2BoxStart.x, point.x), selectionRect.x, selectionRect.x + selectionRect.width) : Math.min(sam2BoxStart.x, point.x);
            const minY = selectionRect ? clamp(Math.min(sam2BoxStart.y, point.y), selectionRect.y, selectionRect.y + selectionRect.height) : Math.min(sam2BoxStart.y, point.y);
            const maxX = selectionRect ? clamp(Math.max(sam2BoxStart.x, point.x), selectionRect.x, selectionRect.x + selectionRect.width) : Math.max(sam2BoxStart.x, point.x);
            const maxY = selectionRect ? clamp(Math.max(sam2BoxStart.y, point.y), selectionRect.y, selectionRect.y + selectionRect.height) : Math.max(sam2BoxStart.y, point.y);
            setSam2BoxDraft({ x: minX, y: minY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) });
            return;
        }
        draw(e);
    }, [currentTool, draw, getCanvasPoint, handlePan, sam2BoxStart, selectionRect]);

    const handleCanvasMouseUp = useCallback(() => {
        handlePanEnd();
        if (currentTool === 'sam2bbox') {
            const bbox = normalizeSelectionRect(sam2BoxDraft);
            setSam2BoxStart(null);
            setSam2BoxDraft(null);
            if (bbox && bbox.width >= 2 && bbox.height >= 2) {
                void queueSam2BboxRequest(bbox);
            }
            return;
        }
        stopDrawing();
    }, [currentTool, handlePanEnd, queueSam2BboxRequest, sam2BoxDraft, stopDrawing]);

    const cursor = isPanning ? 'grabbing' : currentTool === 'pan' ? 'grab' : currentTool === 'crop' ? 'move' : 'crosshair';
    const pendingResultLabel = pendingResult?.source === 'upscale' ? 'Upscale' : pendingResult?.source === 'invoke' ? 'InvokeAI' : 'Generate';
    const pendingResultColor = pendingResult?.source === 'upscale' ? 'teal' : pendingResult?.source === 'invoke' ? 'violet' : 'green';

    return (
        <Box style={{ position: 'fixed', inset: 0, backgroundColor: 'color-mix(in srgb, var(--theme-gray-9) 92%, black)', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
            <Paper p="xs" radius={0} style={{ borderBottom: '1px solid var(--mantine-color-invokeGray-7)', backgroundColor: 'var(--mantine-color-invokeGray-9)' }}>
                <Group justify="space-between">
                    <Group gap="md">
                        <Text fw={600} c="invokeGray.0">{title}</Text>
                        <Text size="sm" c="invokeGray.4">{Math.round(zoom * 100)}%</Text>
                        {selectionRect && <Badge color="blue" variant="light">Selection {selectionRect.width} x {selectionRect.height}</Badge>}
                        {isWorkflowMode && <Badge color="invokeBrand" variant="light">Workflow</Badge>}
                    </Group>
                    <Group gap="xs">
                        <SwarmButton emphasis="soft" tone="secondary" size="xs" leftSection={<IconX size={14} />} onClick={onClose}>Cancel</SwarmButton>
                        <SwarmButton emphasis="solid" size="xs" leftSection={<IconCheck size={14} />} onClick={handleApply}>{isWorkflowMode ? 'Sync Workspace' : 'Apply Mask'}</SwarmButton>
                    </Group>
                </Group>
            </Paper>
            <Box style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                <Paper p="xs" radius={0} style={{ width: 48, borderRight: '1px solid var(--mantine-color-invokeGray-7)', backgroundColor: 'var(--mantine-color-invokeGray-9)' }}>
                    <Stack gap="xs" align="center">
                        {visibleTools.map((tool) => (
                            <Tooltip key={tool.id} label={`${tool.label} (${tool.shortcut})`} position="right">
                                <SwarmActionIcon size="lg" emphasis={currentTool === tool.id ? 'solid' : 'ghost'} tone={currentTool === tool.id ? 'primary' : 'secondary'} label={`${tool.label} tool`} onClick={() => setTool(tool.id)}>
                                    <tool.icon size={20} />
                                </SwarmActionIcon>
                            </Tooltip>
                        ))}
                        <Divider w="100%" my="xs" color="invokeGray.7" />
                        <SwarmActionIcon size="lg" emphasis="ghost" tone="secondary" label="Undo" disabled={!canUndo} onClick={undo}><IconArrowBackUp size={20} /></SwarmActionIcon>
                        <SwarmActionIcon size="lg" emphasis="ghost" tone="secondary" label="Redo" disabled={!canRedo} onClick={redo}><IconArrowForwardUp size={20} /></SwarmActionIcon>
                        <Divider w="100%" my="xs" color="invokeGray.7" />
                        <SwarmActionIcon size="lg" emphasis="ghost" tone="secondary" label="Zoom in" onClick={zoomIn}><IconZoomIn size={20} /></SwarmActionIcon>
                        <SwarmActionIcon size="lg" emphasis="ghost" tone="secondary" label="Zoom out" onClick={zoomOut}><IconZoomOut size={20} /></SwarmActionIcon>
                    </Stack>
                </Paper>
                <Box
                    ref={containerRef}
                    style={{ flex: 1, overflow: 'hidden', position: 'relative', cursor, backgroundColor: 'var(--mantine-color-invokeGray-10)' }}
                    onWheel={handleWheel}
                    onContextMenu={(event) => { if (currentTool === 'sam2points') { event.preventDefault(); } }}
                    onMouseDown={handleCanvasMouseDown}
                    onMouseMove={handleCanvasMouseMove}
                    onMouseUp={handleCanvasMouseUp}
                    onMouseLeave={handleCanvasMouseUp}
                >
                    <Box style={{ position: 'absolute', transform: `translate(${panX}px, ${panY}px) scale(${zoom})`, transformOrigin: '0 0' }}>
                        <canvas ref={canvasRef} style={{ display: 'block', boxShadow: '0 0 20px color-mix(in srgb, black 50%, transparent)' }} />
                        <canvas ref={maskCanvasRef} style={{ position: 'absolute', top: 0, left: 0, opacity: showMask ? maskOpacity : 0, pointerEvents: 'none' }} />
                        {layerRows.map((layer) => (
                            <Box
                                key={layer.id ?? 'base-layer-row'}
                                style={{
                                    position: 'absolute',
                                    left: layer.x,
                                    top: layer.y,
                                    width: layer.width,
                                    height: layer.height,
                                    border: (layer.id === null ? activeImageLayerId === null : activeImageLayerId === layer.id) ? '2px solid color-mix(in srgb, var(--theme-brand) 80%, white)' : '1px solid color-mix(in srgb, var(--theme-brand) 42%, white)',
                                    pointerEvents: 'none',
                                    opacity: layer.id !== null && !layer.visible ? 0.35 : 1,
                                }}
                            />
                        ))}
                        {supportsPromptBuilder && showRegions && regions.map((region, index) => {
                            if (region.shape !== 'rectangle') {
                                return null;
                            }
                            const rect = normalizedRegionToPixels(region, canvasWidth, canvasHeight);
                            const isActive = activeRegionId === region.id;
                            const label = region.label?.trim() || region.prompt.trim().split(/\s+/).slice(0, 3).join(' ') || (region.useInpaint ? `Object ${index + 1}` : `Region ${index + 1}`);
                            return <Box key={region.id} style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.width, height: rect.height, border: `2px ${isActive ? 'solid' : 'dashed'} ${region.useInpaint ? REGION_WARNING : REGION_INFO}`, backgroundColor: region.useInpaint ? 'color-mix(in srgb, var(--theme-warning) 16%, transparent)' : 'color-mix(in srgb, var(--theme-info) 14%, transparent)', pointerEvents: 'none', opacity: region.enabled ? 1 : 0.45 }}><Box style={{ position: 'absolute', top: -18, left: 0, fontSize: 11, lineHeight: '12px', padding: '2px 4px', borderRadius: 4, color: 'var(--theme-gray-0)', background: isActive ? 'var(--theme-info)' : 'var(--theme-gray-7)', whiteSpace: 'nowrap' }}>{label}</Box></Box>;
                        })}
                        {regionDraft && <Box style={{ position: 'absolute', left: Math.min(regionDraft.x1, regionDraft.x2), top: Math.min(regionDraft.y1, regionDraft.y2), width: Math.abs(regionDraft.x2 - regionDraft.x1), height: Math.abs(regionDraft.y2 - regionDraft.y1), border: '2px dashed var(--theme-info)', backgroundColor: 'color-mix(in srgb, var(--theme-info) 12%, transparent)', pointerEvents: 'none' }} />}
                        {selectionRect && <Box style={{ position: 'absolute', left: selectionRect.x, top: selectionRect.y, width: selectionRect.width, height: selectionRect.height, border: '2px dashed color-mix(in srgb, white 85%, var(--theme-brand))', backgroundColor: 'color-mix(in srgb, var(--theme-brand) 10%, transparent)', pointerEvents: 'none' }} />}
                        {sam2BoxDraft && <Box style={{ position: 'absolute', left: sam2BoxDraft.x, top: sam2BoxDraft.y, width: sam2BoxDraft.width, height: sam2BoxDraft.height, border: '2px dashed #33ff99', backgroundColor: 'color-mix(in srgb, #33ff99 12%, transparent)', pointerEvents: 'none' }} />}
                        {sam2Points.positive.map((point, index) => <Box key={`positive-${index}`} style={{ position: 'absolute', left: point.x - 5, top: point.y - 5, width: 10, height: 10, borderRadius: 999, backgroundColor: '#33ff99', border: '2px solid black', pointerEvents: 'none' }} />)}
                        {sam2Points.negative.map((point, index) => <Box key={`negative-${index}`} style={{ position: 'absolute', left: point.x - 5, top: point.y - 5, width: 10, height: 10, borderRadius: 999, backgroundColor: '#ff3355', border: '2px solid black', pointerEvents: 'none' }} />)}
                    </Box>
                    {!imageLoaded && <Box style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}><Text c="invokeGray.3">Loading image...</Text></Box>}
                </Box>
                <Paper p="sm" radius={0} style={{ width: isFocusedWorkflowMode ? 'min(420px, 42vw)' : supportsPromptBuilder ? 420 : 320, minWidth: isFocusedWorkflowMode ? 300 : undefined, borderLeft: '1px solid var(--mantine-color-invokeGray-7)', backgroundColor: 'var(--mantine-color-invokeGray-9)' }}>
                    <ScrollArea h="100%" offsetScrollbars>
                        <Stack gap="md">
                            {isFocusedWorkflowMode && (
                                <>
                                    <Paper p="sm" radius="md" bg="invokeGray.8" withBorder>
                                        <Stack gap="sm">
                                            <Group justify="space-between" align="flex-start">
                                                <Box>
                                                    <Text size="sm" fw={700} c="invokeGray.0">Change Area</Text>
                                                    <Text size="xs" c="invokeGray.4">Mark the part to edit, describe the change, then generate.</Text>
                                                </Box>
                                                <Badge color={selectionRect ? 'green' : 'gray'} variant="light">
                                                    {selectionRect ? 'Area marked' : 'No area yet'}
                                                </Badge>
                                            </Group>
                                            <Group grow>
                                                <SwarmButton size="xs" emphasis={currentTool === 'select' ? 'solid' : 'soft'} leftSection={<IconSquare size={14} />} onClick={() => setTool('select')}>
                                                    Draw Box
                                                </SwarmButton>
                                                <SwarmButton size="xs" emphasis={currentTool === 'brush' ? 'solid' : 'soft'} tone="secondary" leftSection={<IconBrush size={14} />} onClick={() => setTool('brush')}>
                                                    Brush
                                                </SwarmButton>
                                                <SwarmButton size="xs" emphasis={currentTool === 'eraser' ? 'solid' : 'soft'} tone="secondary" leftSection={<IconEraser size={14} />} onClick={() => setTool('eraser')}>
                                                    Erase
                                                </SwarmButton>
                                            </Group>
                                            <SwarmButton
                                                size="xs"
                                                emphasis="soft"
                                                tone="secondary"
                                                leftSection={<IconTargetArrow size={14} />}
                                                disabled={sam2Busy}
                                                onClick={handleAutoSelectArea}
                                            >
                                                {sam2Available ? 'Auto Select Object' : 'Draw Area Manually'}
                                            </SwarmButton>
                                            <Text size="xs" c="invokeGray.4">
                                                Dragging a box marks that whole area for change. Brush adds area; Erase protects area.
                                            </Text>
                                        </Stack>
                                    </Paper>

                                    <Paper p="sm" radius="md" bg="invokeGray.8" withBorder>
                                        <Stack gap="sm">
                                            <Textarea
                                                label="What should change here?"
                                                description="Use plain language. The rest of the image will be treated as context."
                                                placeholder="Change the shirt to red, remove the object, fix the hand..."
                                                value={editPrompt}
                                                onChange={(event) => setEditPrompt(event.currentTarget.value)}
                                                autosize
                                                minRows={3}
                                                maxRows={6}
                                            />
                                            <Select
                                                label="Model"
                                                description={detectedModel ? `Detected from image metadata: ${detectedModel}` : 'Choose the model for this edit.'}
                                                placeholder={loadingModels ? 'Loading models...' : 'Select a model'}
                                                data={modelOptions}
                                                value={selectedModelValue}
                                                onChange={onModelSelect}
                                                searchable
                                                clearable
                                                disabled={loadingModels || !onModelSelect}
                                            />
                                            {(loadingModel || modelLoadError) && (
                                                <Stack gap={4}>
                                                    {loadingModel && (
                                                        <Progress
                                                            value={modelProgressValue}
                                                            size="xs"
                                                            color="invokeBrand"
                                                            className={modelLoadProgressEstimated ? 'swarm-progress-indeterminate' : undefined}
                                                            animated
                                                        />
                                                    )}
                                                    <Text size="xs" c={modelLoadError ? 'red.4' : 'invokeGray.4'}>
                                                        {modelLoadError
                                                            ? modelLoadError
                                                            : modelLoadingCount > 0
                                                                ? `Loading ${modelLoadingCount} model${modelLoadingCount === 1 ? '' : 's'}...`
                                                                : 'Loading selected model...'}
                                                    </Text>
                                                </Stack>
                                            )}
                                            <SwarmButton
                                                emphasis="solid"
                                                size="sm"
                                                fullWidth
                                                leftSection={<IconSparkles size={16} />}
                                                loading={invokeGenerationBusy}
                                                onClick={handlePrimaryGenerate}
                                            >
                                                {autoGenerateLabel}
                                            </SwarmButton>
                                            <Text size="xs" c="invokeGray.4">{autoGenerateHelp}</Text>
                                            <Group grow>
                                                <SwarmButton emphasis="soft" tone="secondary" size="xs" onClick={handleClearArea}>
                                                    Clear Area
                                                </SwarmButton>
                                                <SwarmButton emphasis="ghost" tone="secondary" size="xs" onClick={() => handleWorkflowAction('apply')}>
                                                    Send to Generate
                                                </SwarmButton>
                                            </Group>
                                        </Stack>
                                    </Paper>

                                    {pendingResult && (
                                        <Paper p="sm" radius="md" bg="invokeGray.8" withBorder>
                                            <Stack gap="xs">
                                                <Group justify="space-between">
                                                    <Text size="sm" fw={600} c="invokeGray.0">New Result Ready</Text>
                                                    <Badge color={pendingResultColor} variant="light">{pendingResultLabel}</Badge>
                                                </Group>
                                                <img src={pendingResult.imageUrl} alt="Pending workflow result" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--mantine-color-invokeGray-7)' }} />
                                                <Group grow>
                                                    <SwarmButton size="xs" emphasis="soft" onClick={onUsePendingResult}>Use Result</SwarmButton>
                                                    <SwarmButton size="xs" emphasis="solid" onClick={onContinueRefining}>Continue Refining</SwarmButton>
                                                </Group>
                                            </Stack>
                                        </Paper>
                                    )}

                                    <Paper p="sm" radius="md" bg="invokeGray.8" withBorder>
                                        <Stack gap="sm">
                                            <SwarmButton
                                                size="xs"
                                                emphasis="soft"
                                                tone="secondary"
                                                leftSection={<IconSettings size={14} />}
                                                onClick={() => setAdvancedToolsOpen((open) => !open)}
                                            >
                                                {advancedToolsOpen ? 'Hide Advanced Tools' : 'Show Advanced Tools'}
                                            </SwarmButton>
                                            <Collapse expanded={advancedToolsOpen}>
                                                <Stack gap="md">
                                                    <Paper p="sm" radius="md" bg="invokeGray.9">
                                                        <Stack gap="sm">
                                                            <Text size="sm" fw={600} c="invokeGray.0">Advanced Workflow</Text>
                                                            <Group gap="xs" wrap="wrap">
                                                                {WORKFLOW_STEPS.map((step) => (
                                                                    <SwarmButton
                                                                        key={step.id}
                                                                        size="compact-xs"
                                                                        emphasis={workflowStep === step.id ? 'solid' : 'soft'}
                                                                        tone={workflowStep === step.id ? 'primary' : 'secondary'}
                                                                        onClick={() => onWorkflowStepChange?.(step.id)}
                                                                    >
                                                                        {step.label}
                                                                    </SwarmButton>
                                                                ))}
                                                            </Group>
                                                            <Text size="xs" c="invokeGray.4">{activeWorkflowStep.helper}</Text>
                                                        </Stack>
                                                    </Paper>

                                                    <Paper p="sm" radius="md" bg="invokeGray.9">
                                                        <Stack gap="xs">
                                                            <Group justify="space-between">
                                                                <Text size="sm" fw={600} c="invokeGray.0">Image Layers</Text>
                                                                {imageLayers.length > 0 && <SwarmButton size="compact-xs" emphasis="ghost" tone="secondary" onClick={clearImageLayers}>Clear Overlays</SwarmButton>}
                                                            </Group>
                                                            <Group grow>
                                                                <SwarmButton size="xs" emphasis="soft" leftSection={<IconClipboard size={14} />} onClick={() => void handlePasteClipboardImage()}>Paste Clipboard</SwarmButton>
                                                                <SwarmButton size="xs" emphasis="soft" tone="secondary" leftSection={<IconPhotoPlus size={14} />} onClick={() => fileInputRef.current?.click()}>Import File</SwarmButton>
                                                            </Group>
                                                            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileInputChange} />
                                                            <Stack gap="xs">
                                                                {layerRows.map((layer, index) => <Paper key={layer.id ?? 'base-layer-item-focused'} p="xs" radius="sm" withBorder style={{ backgroundColor: (layer.id === null ? activeImageLayerId === null : activeImageLayerId === layer.id) ? 'color-mix(in srgb, var(--theme-brand) 18%, var(--mantine-color-invokeGray-8))' : 'var(--mantine-color-invokeGray-8)', cursor: 'pointer' }} onClick={() => setActiveImageLayer(layer.id)}><Group justify="space-between" wrap="nowrap"><Box style={{ minWidth: 0 }}><Text size="sm" fw={600} c="invokeGray.1" truncate>{layer.name}</Text><Text size="xs" c="invokeGray.4">{Math.round(layer.width)} x {Math.round(layer.height)} @ {Math.round(layer.x)}, {Math.round(layer.y)}</Text></Box>{layer.id !== null && <Group gap={4} wrap="nowrap"><SwarmActionIcon size="sm" emphasis="ghost" tone="secondary" label={layer.visible ? 'Hide layer' : 'Show layer'} onClick={(event) => { event.stopPropagation(); updateImageLayer(layer.id, { visible: !layer.visible }); }}>{layer.visible ? <IconEye size={14} /> : <IconEyeOff size={14} />}</SwarmActionIcon><SwarmActionIcon size="sm" emphasis="ghost" tone="secondary" label="Move layer up" disabled={index === layerRows.length - 1} onClick={(event) => { event.stopPropagation(); reorderImageLayer(layer.id, 'up'); }}><IconChevronUp size={14} /></SwarmActionIcon><SwarmActionIcon size="sm" emphasis="ghost" tone="secondary" label="Move layer down" disabled={index === 1} onClick={(event) => { event.stopPropagation(); reorderImageLayer(layer.id, 'down'); }}><IconChevronDown size={14} /></SwarmActionIcon><SwarmActionIcon size="sm" emphasis="ghost" tone="danger" label="Delete layer" onClick={(event) => { event.stopPropagation(); removeImageLayer(layer.id); }}><IconTrash size={14} /></SwarmActionIcon></Group>}</Group></Paper>)}
                                                            </Stack>
                                                        </Stack>
                                                    </Paper>

                                                    <OutpaintControls />

                                                    <Paper p="sm" radius="md" bg="invokeGray.9">
                                                        <Stack gap="xs">
                                                            <Group justify="space-between"><Text size="sm" fw={600} c="invokeGray.0">Selection + SAM2</Text><Badge color={sam2Available === false ? 'yellow' : sam2Available ? 'green' : 'gray'} variant="light">{sam2Available === false ? 'SAM2 unavailable' : sam2Available ? 'SAM2 ready' : 'SAM2 unknown'}</Badge></Group>
                                                            <Group grow>
                                                                <SwarmButton size="xs" emphasis="soft" tone={currentTool === 'sam2points' ? 'primary' : 'secondary'} disabled={sam2Busy} onClick={() => setTool('sam2points')}>SAM2 Points</SwarmButton>
                                                                <SwarmButton size="xs" emphasis="soft" tone={currentTool === 'sam2bbox' ? 'primary' : 'secondary'} disabled={sam2Busy} onClick={() => setTool('sam2bbox')}>SAM2 BBox</SwarmButton>
                                                            </Group>
                                                            <Group grow>
                                                                <SwarmButton size="xs" emphasis="ghost" tone="secondary" disabled={!selectionRect} onClick={clearSelection}>Clear Selection</SwarmButton>
                                                                <SwarmButton size="xs" emphasis="ghost" tone="secondary" disabled={sam2Points.positive.length === 0 && sam2Points.negative.length === 0 && !sam2BoxDraft} onClick={clearSam2State}>Clear SAM2 Marks</SwarmButton>
                                                            </Group>
                                                            {sam2Busy && <Text size="xs" c="invokeGray.4">Requesting a SAM2 mask from the backend...</Text>}
                                                        </Stack>
                                                    </Paper>

                                                    {supportsPromptBuilder && <><RegionalPromptEditor /><SegmentRulesPanel /></>}

                                                    <Paper p="sm" radius="md" bg="invokeGray.9">
                                                        <Stack gap="xs">
                                                            <Box><Text size="sm" fw={500} c="invokeGray.1" mb="xs">Mask Opacity: {Math.round(maskOpacity * 100)}%</Text><SwarmSlider value={maskOpacity} onChange={setMaskOpacity} min={0.1} max={1} step={0.1} /></Box>
                                                            <Box><Text size="sm" fw={500} c="invokeGray.1" mb="xs">Mask Color</Text><ColorInput value={maskColor} onChange={setMaskColor} format="hex" withPicker swatches={['#ff0000', '#ff9900', '#ffff00', '#00ff66', '#00ffff', '#3388ff', '#ff00ff']} /></Box>
                                                            <Box><Text size="sm" fw={500} c="invokeGray.1" mb="xs">Raw Mask Actions</Text><Stack gap="xs"><SwarmButton emphasis="soft" size="xs" fullWidth leftSection={<IconPaint size={14} />} onClick={fillMask}>Fill Mask</SwarmButton><SwarmButton emphasis="soft" tone="secondary" size="xs" fullWidth leftSection={<IconTrash size={14} />} onClick={handleClearMask}>{selectionRect ? 'Clear Selection Mask' : 'Clear Mask'}</SwarmButton><SwarmButton emphasis="soft" tone="secondary" size="xs" fullWidth leftSection={<IconSwitchHorizontal size={14} />} onClick={invertMask}>{selectionRect ? 'Invert Selection Mask' : 'Invert Mask'}</SwarmButton><SwarmButton emphasis="soft" tone="secondary" size="xs" fullWidth onClick={toggleMaskVisibility}>{showMask ? 'Hide Mask' : 'Show Mask'}</SwarmButton></Stack></Box>
                                                            <SwarmButton emphasis="soft" tone="secondary" size="xs" fullWidth onClick={onOpenUpscaler}>Open Upscaler</SwarmButton>
                                                        </Stack>
                                                    </Paper>
                                                </Stack>
                                            </Collapse>
                                        </Stack>
                                    </Paper>
                                </>
                            )}
                            {!isFocusedWorkflowMode && isWorkflowMode && (
                                <Paper p="sm" radius="md" bg="invokeGray.8" withBorder>
                                    <Stack gap="sm">
                                        <Text size="sm" fw={600} c="invokeGray.0">Workflow</Text>
                                        <Group gap="xs" wrap="wrap">
                                            {WORKFLOW_STEPS.map((step) => (
                                                <SwarmButton
                                                    key={step.id}
                                                    size="compact-xs"
                                                    emphasis={workflowStep === step.id ? 'solid' : 'soft'}
                                                    tone={workflowStep === step.id ? 'primary' : 'secondary'}
                                                    onClick={() => onWorkflowStepChange?.(step.id)}
                                                >
                                                    {step.label}
                                                </SwarmButton>
                                            ))}
                                        </Group>
                                        <Text size="xs" c="invokeGray.4">
                                            {activeWorkflowStep.helper}
                                            {workflowStep === 'regions' && regionSummary ? ` Active: ${regionSummary}` : ''}
                                        </Text>
                                        {primaryWorkflowAction && (
                                            <SwarmButton
                                                size="xs"
                                                emphasis="soft"
                                                tone="secondary"
                                                onClick={() => onWorkflowStepChange?.(primaryWorkflowAction.step)}
                                            >
                                                {primaryWorkflowAction.label}
                                            </SwarmButton>
                                        )}
                                    </Stack>
                                </Paper>
                            )}
                            {!isFocusedWorkflowMode && <Paper p="sm" radius="md" bg="invokeGray.8" withBorder>
                                <Stack gap="xs">
                                    <Text size="sm" fw={600} c="invokeGray.0">Mask vs Region vs Selection</Text>
                                    <Text size="xs" c="invokeGray.4"><strong>Mask:</strong> where the model is allowed to change pixels.</Text>
                                    <Text size="xs" c="invokeGray.4"><strong>Region:</strong> what should be in a named area, using prompt guidance.</Text>
                                    <Text size="xs" c="invokeGray.4"><strong>Selection:</strong> a temporary editing boundary for Brush, Fill, Invert, and SAM2.</Text>
                                    <Text size="xs" c="invokeGray.3">Common pattern: use Selection to limit the area, use SAM2 or Brush to build the Mask, then use Region boxes to describe what belongs there.</Text>
                                </Stack>
                            </Paper>}
                            {!isFocusedWorkflowMode && <Paper p="sm" radius="md" bg="invokeGray.8" withBorder>
                                <Stack gap="xs">
                                    <Group justify="space-between">
                                        <Text size="sm" fw={600} c="invokeGray.0">Current Tool</Text>
                                        <Badge color="invokeBrand" variant="light">{currentToolGuidance.title}</Badge>
                                    </Group>
                                    <Text size="xs" c="invokeGray.3">
                                        {currentToolGuidance.description}
                                    </Text>
                                    <Text size="xs" fw={600} c="invokeGray.2">
                                        {currentToolGuidance.recipeLabel}
                                    </Text>
                                    {currentToolGuidance.steps.map((step) => (
                                        <Text key={step} size="xs" c="invokeGray.4">
                                            {step}
                                        </Text>
                                    ))}
                                    <Text size="xs" c="invokeGray.3">
                                        {currentToolGuidance.followUp}
                                    </Text>
                                    {currentTool === 'region' && activeRegion && (
                                        <Text size="xs" c="invokeGray.4">
                                            Active region: {activeRegion.label?.trim() || regionSummary || 'Unnamed region'}.
                                        </Text>
                                    )}
                                </Stack>
                            </Paper>}
                            {!isFocusedWorkflowMode && <Paper p="sm" radius="md" bg="invokeGray.8" withBorder>
                                <Stack gap="xs">
                                    <Group justify="space-between">
                                        <Text size="sm" fw={600} c="invokeGray.0">Image Layers</Text>
                                        {imageLayers.length > 0 && <SwarmButton size="compact-xs" emphasis="ghost" tone="secondary" onClick={clearImageLayers}>Clear Overlays</SwarmButton>}
                                    </Group>
                                    <Group grow>
                                        <SwarmButton size="xs" emphasis="soft" leftSection={<IconClipboard size={14} />} onClick={() => void handlePasteClipboardImage()}>Paste Clipboard</SwarmButton>
                                        <SwarmButton size="xs" emphasis="soft" tone="secondary" leftSection={<IconPhotoPlus size={14} />} onClick={() => fileInputRef.current?.click()}>Import File</SwarmButton>
                                    </Group>
                                    <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileInputChange} />
                                    <Stack gap="xs">
                                        {layerRows.map((layer, index) => <Paper key={layer.id ?? 'base-layer-item'} p="xs" radius="sm" withBorder style={{ backgroundColor: (layer.id === null ? activeImageLayerId === null : activeImageLayerId === layer.id) ? 'color-mix(in srgb, var(--theme-brand) 18%, var(--mantine-color-invokeGray-8))' : 'var(--mantine-color-invokeGray-8)', cursor: 'pointer' }} onClick={() => setActiveImageLayer(layer.id)}><Group justify="space-between" wrap="nowrap"><Box style={{ minWidth: 0 }}><Text size="sm" fw={600} c="invokeGray.1" truncate>{layer.name}</Text><Text size="xs" c="invokeGray.4">{Math.round(layer.width)} x {Math.round(layer.height)} @ {Math.round(layer.x)}, {Math.round(layer.y)}</Text></Box>{layer.id !== null && <Group gap={4} wrap="nowrap"><SwarmActionIcon size="sm" emphasis="ghost" tone="secondary" label={layer.visible ? 'Hide layer' : 'Show layer'} onClick={(event) => { event.stopPropagation(); updateImageLayer(layer.id, { visible: !layer.visible }); }}>{layer.visible ? <IconEye size={14} /> : <IconEyeOff size={14} />}</SwarmActionIcon><SwarmActionIcon size="sm" emphasis="ghost" tone="secondary" label="Move layer up" disabled={index === layerRows.length - 1} onClick={(event) => { event.stopPropagation(); reorderImageLayer(layer.id, 'up'); }}><IconChevronUp size={14} /></SwarmActionIcon><SwarmActionIcon size="sm" emphasis="ghost" tone="secondary" label="Move layer down" disabled={index === 1} onClick={(event) => { event.stopPropagation(); reorderImageLayer(layer.id, 'down'); }}><IconChevronDown size={14} /></SwarmActionIcon><SwarmActionIcon size="sm" emphasis="ghost" tone="danger" label="Delete layer" onClick={(event) => { event.stopPropagation(); removeImageLayer(layer.id); }}><IconTrash size={14} /></SwarmActionIcon></Group>}</Group></Paper>)}
                                    </Stack>
                                </Stack>
                            </Paper>}
                            {!isFocusedWorkflowMode && showOutpaintControls && <><OutpaintControls /><Divider color="invokeGray.7" /></>}
                            {!isFocusedWorkflowMode && <Paper p="sm" radius="md" bg="invokeGray.8" withBorder>
                                <Stack gap="xs">
                                    <Group justify="space-between"><Text size="sm" fw={600} c="invokeGray.0">Selection + SAM2</Text><Badge color={sam2Available === false ? 'yellow' : sam2Available ? 'green' : 'gray'} variant="light">{sam2Available === false ? 'SAM2 unavailable' : sam2Available ? 'SAM2 ready' : 'SAM2 unknown'}</Badge></Group>
                                    <Text size="xs" c="invokeGray.4">Use Select to limit the working area first. Then use SAM2 Points for click-based masking or SAM2 BBox for drag-a-box masking. SAM2 updates the mask only, not the prompt text.</Text>
                                    <Group grow>
                                        <SwarmButton size="xs" emphasis="soft" tone={currentTool === 'select' ? 'primary' : 'secondary'} onClick={() => setTool('select')}>Select Box</SwarmButton>
                                        <SwarmButton size="xs" emphasis="soft" tone={currentTool === 'sam2points' ? 'primary' : 'secondary'} disabled={sam2Busy} onClick={() => setTool('sam2points')}>SAM2 Points</SwarmButton>
                                        <SwarmButton size="xs" emphasis="soft" tone={currentTool === 'sam2bbox' ? 'primary' : 'secondary'} disabled={sam2Busy} onClick={() => setTool('sam2bbox')}>SAM2 BBox</SwarmButton>
                                    </Group>
                                    <Group grow>
                                        <SwarmButton size="xs" emphasis="ghost" tone="secondary" disabled={!selectionRect} onClick={clearSelection}>Clear Selection</SwarmButton>
                                        <SwarmButton size="xs" emphasis="ghost" tone="secondary" disabled={sam2Points.positive.length === 0 && sam2Points.negative.length === 0 && !sam2BoxDraft} onClick={clearSam2State}>Clear SAM2 Marks</SwarmButton>
                                    </Group>
                                    {(sam2Points.positive.length > 0 || sam2Points.negative.length > 0) && <Text size="xs" c="invokeGray.4">Positive: {sam2Points.positive.length} | Negative: {sam2Points.negative.length}</Text>}
                                    {sam2Busy && <Text size="xs" c="invokeGray.4">Requesting a SAM2 mask from the backend...</Text>}
                                    {sam2MaskReady && (
                                        <>
                                            <Divider color="invokeGray.7" />
                                            <Text size="xs" fw={600} c="invokeGray.2">Next Step After SAM2</Text>
                                            <Text size="xs" c="invokeGray.4">SAM2 has created the mask. Most workflows now clean the mask, then optionally add Region boxes to describe what should appear there.</Text>
                                            <Group grow>
                                                <SwarmButton size="xs" emphasis="soft" onClick={() => setTool('brush')}>Clean With Brush</SwarmButton>
                                                <SwarmButton size="xs" emphasis="soft" tone="secondary" onClick={() => setTool('eraser')}>Trim With Eraser</SwarmButton>
                                            </Group>
                                            <Group grow>
                                                <SwarmButton size="xs" emphasis="soft" tone="secondary" onClick={handlePromoteSam2ToRegions}>Describe With Region Box</SwarmButton>
                                                {isWorkflowMode && <SwarmButton size="xs" emphasis="ghost" tone="secondary" onClick={handleReviewGenerateStep}>Review Generate Step</SwarmButton>}
                                            </Group>
                                        </>
                                    )}
                                </Stack>
                            </Paper>}
                            {!isFocusedWorkflowMode && supportsPromptBuilder && <><Group justify="space-between"><Text size="sm" fw={500} c="invokeGray.1">Prompt Builder</Text><Badge color={syncState === 'synced' ? 'green' : syncState === 'manual_override' ? 'yellow' : 'gray'} variant="light">{syncState.replace('_', ' ')}</Badge></Group><Text size="xs" c="invokeGray.4">When you draw a region box, its card appears below. Name what the area is, then describe what you want changed or added inside it.</Text>{(workflowStep === 'regions' || workflowStep === 'source' || workflowStep === 'mask') && <RegionalPromptEditor />}{(workflowStep === 'segments' || workflowStep === 'generate') && <SegmentRulesPanel />}{!regions.length && !segments.length && workflowStep === 'regions' && <Text size="xs" c="invokeGray.4">Tip: label regions with simple names like Character A or Background.</Text>}<Divider color="invokeGray.7" /></>}
                            <Box><Text size="sm" fw={500} c="invokeGray.1" mb="xs">Brush Size: {brushSettings.size}px</Text><SwarmSlider value={brushSettings.size} onChange={(value) => setBrushSettings({ size: value })} min={1} max={200} /><Group gap="xs" mt="xs">{BRUSH_SIZES.map((size) => <SwarmActionIcon key={size} size="sm" emphasis={brushSettings.size === size ? 'solid' : 'soft'} tone={brushSettings.size === size ? 'primary' : 'secondary'} label={`Set brush size to ${size}`} onClick={() => setBrushSettings({ size })}><Text size="xs">{size}</Text></SwarmActionIcon>)}</Group></Box>
                            {!isFocusedWorkflowMode && <Divider color="invokeGray.7" />}
                            {!isFocusedWorkflowMode && <Box><Text size="sm" fw={500} c="invokeGray.1" mb="xs">Mask Opacity: {Math.round(maskOpacity * 100)}%</Text><SwarmSlider value={maskOpacity} onChange={setMaskOpacity} min={0.1} max={1} step={0.1} /></Box>}
                            {!isFocusedWorkflowMode && <Divider color="invokeGray.7" />}
                            {!isFocusedWorkflowMode && <Box><Text size="sm" fw={500} c="invokeGray.1" mb="xs">Mask Color</Text><ColorInput value={maskColor} onChange={setMaskColor} format="hex" withPicker swatches={['#ff0000', '#ff9900', '#ffff00', '#00ff66', '#00ffff', '#3388ff', '#ff00ff']} /></Box>}
                            {!isFocusedWorkflowMode && <Divider color="invokeGray.7" />}
                            {!isFocusedWorkflowMode && <Box><Text size="sm" fw={500} c="invokeGray.1" mb="xs">Mask Actions</Text><Stack gap="xs"><SwarmButton emphasis="soft" size="xs" fullWidth leftSection={<IconPaint size={14} />} onClick={fillMask}>Fill Mask</SwarmButton><SwarmButton emphasis="soft" tone="secondary" size="xs" fullWidth leftSection={<IconTrash size={14} />} onClick={handleClearMask}>{selectionRect ? 'Clear Selection Mask' : 'Clear Mask'}</SwarmButton><SwarmButton emphasis="soft" tone="secondary" size="xs" fullWidth leftSection={<IconSwitchHorizontal size={14} />} onClick={invertMask}>{selectionRect ? 'Invert Selection Mask' : 'Invert Mask'}</SwarmButton><SwarmButton emphasis="soft" tone="secondary" size="xs" fullWidth onClick={toggleMaskVisibility}>{showMask ? 'Hide Mask' : 'Show Mask'}</SwarmButton></Stack></Box>}
                            {!isFocusedWorkflowMode && activeLayer && <><Divider color="invokeGray.7" /><Box><Text size="sm" fw={500} c="invokeGray.1" mb="xs">Active Layer Opacity</Text><SwarmSlider value={activeLayer.opacity} onChange={(value) => updateImageLayer(activeLayer.id, { opacity: value })} min={0.1} max={1} step={0.05} /></Box></>}
                            {!isFocusedWorkflowMode && isWorkflowMode && (
                                <>
                                    <Divider color="invokeGray.7" />
                                    <Box>
                                        <Text size="sm" fw={500} c="invokeGray.1" mb="xs">Generate Actions</Text>
                                        <Stack gap="xs">
                                            <SwarmButton emphasis="soft" size="xs" fullWidth onClick={() => handleWorkflowAction('apply')}>Apply to Generate</SwarmButton>
                                            <SwarmButton emphasis="solid" size="xs" fullWidth disabled={!getMaskDataUrl()} onClick={() => handleWorkflowAction('generate')}>Generate Inpaint</SwarmButton>
                                            <SwarmButton emphasis="solid" tone="brand" size="xs" fullWidth loading={invokeGenerationBusy} disabled={!invokeGenerationAvailable} onClick={() => handleWorkflowAction('invoke')}>Generate with InvokeAI</SwarmButton>
                                            <SwarmButton emphasis="soft" tone="secondary" size="xs" fullWidth onClick={onOpenUpscaler}>Open Upscaler</SwarmButton>
                                        </Stack>
                                    </Box>
                                    {pendingResult && (
                                        <Paper p="sm" radius="md" bg="invokeGray.8" withBorder>
                                            <Stack gap="xs">
                                                <Group justify="space-between">
                                                    <Text size="sm" fw={600} c="invokeGray.0">New Result Ready</Text>
                                                    <Badge color={pendingResultColor} variant="light">{pendingResultLabel}</Badge>
                                                </Group>
                                                <img src={pendingResult.imageUrl} alt="Pending workflow result" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--mantine-color-invokeGray-7)' }} />
                                                <Group grow>
                                                    <SwarmButton size="xs" emphasis="soft" onClick={onUsePendingResult}>Use Result</SwarmButton>
                                                    <SwarmButton size="xs" emphasis="solid" onClick={onContinueRefining}>Continue Refining</SwarmButton>
                                                </Group>
                                            </Stack>
                                        </Paper>
                                    )}
                                </>
                            )}
                            {!isFocusedWorkflowMode && <Divider color="invokeGray.7" />}
                            {!isFocusedWorkflowMode ? (
                                <Text size="xs" c="invokeGray.4"><strong>Shortcuts:</strong><br />B Brush<br />E Eraser<br />H/Space Pan<br />S Select Box<br />R Region<br />C Move Selected Layer<br />Y SAM2 Points<br />U SAM2 BBox<br />Ctrl+V Paste image layer<br />[ / ] Brush size<br />Ctrl+Z Undo</Text>
                            ) : (
                                <Text size="xs" c="invokeGray.4"><strong>Shortcuts:</strong><br />S Draw Box<br />B Brush<br />E Erase<br />H/Space Pan<br />[ / ] Brush size<br />Ctrl+Z Undo</Text>
                            )}
                        </Stack>
                    </ScrollArea>
                </Paper>
            </Box>
        </Box>
    );
});

export default CanvasEditor;
