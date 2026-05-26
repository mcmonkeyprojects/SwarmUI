import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

// ============================================================================
// Types
// ============================================================================

export type CanvasTool = 'pan' | 'brush' | 'eraser' | 'crop' | 'region' | 'select' | 'sam2points' | 'sam2bbox';

export type RegionType = 'rectangle' | 'freeform';

export interface Region {
    id: string;
    type: RegionType;
    path: number[];
    prompt: string;
    weight: number;
    useInpaint: boolean;
    inpaintStrength: number;
    enabled: boolean;
    color: string;
}

export interface BrushSettings {
    size: number;
    opacity: number;
    hardness: number;
    color: string;
}

export interface CanvasImageLayer {
    id: string;
    name: string;
    src: string;
    x: number;
    y: number;
    width: number;
    height: number;
    visible: boolean;
    opacity: number;
}

export interface CanvasSelection {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface CanvasState {
    zoom: number;
    panX: number;
    panY: number;
    currentTool: CanvasTool;
    brushSettings: BrushSettings;
    maskOpacity: number;
    maskColor: string;
    maskBlur: number;
    invertMask: boolean;
    showMask: boolean;
    regions: Region[];
    activeRegionId: string | null;
    showRegions: boolean;
    canvasWidth: number;
    canvasHeight: number;
    originalWidth: number;
    originalHeight: number;
    imageOffsetX: number;
    imageOffsetY: number;
    imageLayers: CanvasImageLayer[];
    activeImageLayerId: string | null;
    selection: CanvasSelection | null;
    isEditing: boolean;
    editingImageUrl: string | null;
}

export interface CanvasActions {
    setZoom: (zoom: number) => void;
    setPan: (x: number, y: number) => void;
    resetView: () => void;
    zoomIn: () => void;
    zoomOut: () => void;
    fitToScreen: () => void;
    setTool: (tool: CanvasTool) => void;
    setBrushSettings: (settings: Partial<BrushSettings>) => void;
    setMaskOpacity: (opacity: number) => void;
    setMaskColor: (color: string) => void;
    setMaskBlur: (blur: number) => void;
    setInvertMask: (invert: boolean) => void;
    toggleMaskVisibility: () => void;
    addRegion: (region: Omit<Region, 'id'>) => void;
    updateRegion: (id: string, updates: Partial<Region>) => void;
    removeRegion: (id: string) => void;
    setActiveRegion: (id: string | null) => void;
    clearRegions: () => void;
    toggleRegionsVisibility: () => void;
    setCanvasSize: (width: number, height: number) => void;
    extendCanvas: (direction: 'top' | 'right' | 'bottom' | 'left', amount: number) => void;
    resetCanvasSize: () => void;
    setImageOffset: (x: number, y: number) => void;
    centerImage: () => void;
    addImageLayer: (layer: Omit<CanvasImageLayer, 'id' | 'name'> & Partial<Pick<CanvasImageLayer, 'id' | 'name'>>) => string;
    updateImageLayer: (id: string, updates: Partial<CanvasImageLayer>) => void;
    removeImageLayer: (id: string) => void;
    reorderImageLayer: (id: string, direction: 'up' | 'down') => void;
    setActiveImageLayer: (id: string | null) => void;
    clearImageLayers: () => void;
    setSelection: (selection: CanvasSelection | null) => void;
    clearSelection: () => void;
    openEditor: (imageUrl: string, width: number, height: number) => void;
    closeEditor: () => void;
    reset: () => void;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function createId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function clampLayerToCanvas(layer: CanvasImageLayer, canvasWidth: number, canvasHeight: number): CanvasImageLayer {
    return {
        ...layer,
        x: clamp(layer.x, 0, Math.max(0, canvasWidth - layer.width)),
        y: clamp(layer.y, 0, Math.max(0, canvasHeight - layer.height)),
    };
}

const initialState: CanvasState = {
    zoom: 1,
    panX: 0,
    panY: 0,
    currentTool: 'brush',
    brushSettings: {
        size: 50,
        opacity: 1,
        hardness: 0.8,
        color: '#ffffff',
    },
    maskOpacity: 0.5,
    maskColor: '#ff0000',
    maskBlur: 4,
    invertMask: false,
    showMask: true,
    regions: [],
    activeRegionId: null,
    showRegions: true,
    canvasWidth: 512,
    canvasHeight: 512,
    originalWidth: 512,
    originalHeight: 512,
    imageOffsetX: 0,
    imageOffsetY: 0,
    imageLayers: [],
    activeImageLayerId: null,
    selection: null,
    isEditing: false,
    editingImageUrl: null,
};

export const useCanvasEditorStore = create<CanvasState & CanvasActions>()(
    devtools(
        persist(
            (set) => ({
                ...initialState,

                setZoom: (zoom) => set({ zoom: clamp(zoom, 0.1, 10) }),
                setPan: (panX, panY) => set({ panX, panY }),
                resetView: () => set({ zoom: 1, panX: 0, panY: 0 }),
                zoomIn: () => set((state) => ({ zoom: clamp(state.zoom * 1.25, 0.1, 10) })),
                zoomOut: () => set((state) => ({ zoom: clamp(state.zoom / 1.25, 0.1, 10) })),
                fitToScreen: () => set({ zoom: 1, panX: 0, panY: 0 }),

                setTool: (currentTool) => set({ currentTool }),
                setBrushSettings: (settings) => set((state) => ({
                    brushSettings: { ...state.brushSettings, ...settings },
                })),

                setMaskOpacity: (maskOpacity) => set({ maskOpacity }),
                setMaskColor: (maskColor) => set({ maskColor }),
                setMaskBlur: (maskBlur) => set({ maskBlur }),
                setInvertMask: (invertMask) => set({ invertMask }),
                toggleMaskVisibility: () => set((state) => ({ showMask: !state.showMask })),

                addRegion: (region) => set((state) => ({
                    regions: [
                        ...state.regions,
                        { ...region, id: createId('region') },
                    ],
                })),
                updateRegion: (id, updates) => set((state) => ({
                    regions: state.regions.map((region) => (region.id === id ? { ...region, ...updates } : region)),
                })),
                removeRegion: (id) => set((state) => ({
                    regions: state.regions.filter((region) => region.id !== id),
                    activeRegionId: state.activeRegionId === id ? null : state.activeRegionId,
                })),
                setActiveRegion: (activeRegionId) => set({ activeRegionId }),
                clearRegions: () => set({ regions: [], activeRegionId: null }),
                toggleRegionsVisibility: () => set((state) => ({ showRegions: !state.showRegions })),

                setCanvasSize: (canvasWidth, canvasHeight) => set((state) => ({
                    canvasWidth,
                    canvasHeight,
                    imageOffsetX: clamp(state.imageOffsetX, 0, Math.max(0, canvasWidth - state.originalWidth)),
                    imageOffsetY: clamp(state.imageOffsetY, 0, Math.max(0, canvasHeight - state.originalHeight)),
                    imageLayers: state.imageLayers.map((layer) => clampLayerToCanvas(layer, canvasWidth, canvasHeight)),
                    selection: state.selection
                        ? {
                            x: clamp(state.selection.x, 0, canvasWidth),
                            y: clamp(state.selection.y, 0, canvasHeight),
                            width: clamp(state.selection.width, 0, canvasWidth),
                            height: clamp(state.selection.height, 0, canvasHeight),
                        }
                        : null,
                })),

                extendCanvas: (direction, amount) => set((state) => {
                    const nextWidth = state.canvasWidth + (direction === 'left' || direction === 'right' ? amount : 0);
                    const nextHeight = state.canvasHeight + (direction === 'top' || direction === 'bottom' ? amount : 0);
                    const shiftX = direction === 'left' ? amount : 0;
                    const shiftY = direction === 'top' ? amount : 0;
                    return {
                        canvasWidth: nextWidth,
                        canvasHeight: nextHeight,
                        imageOffsetX: state.imageOffsetX + shiftX,
                        imageOffsetY: state.imageOffsetY + shiftY,
                        imageLayers: state.imageLayers.map((layer) => ({
                            ...layer,
                            x: layer.x + shiftX,
                            y: layer.y + shiftY,
                        })),
                        selection: state.selection
                            ? {
                                ...state.selection,
                                x: state.selection.x + shiftX,
                                y: state.selection.y + shiftY,
                            }
                            : null,
                    };
                }),

                resetCanvasSize: () => set((state) => ({
                    canvasWidth: state.originalWidth,
                    canvasHeight: state.originalHeight,
                    imageOffsetX: 0,
                    imageOffsetY: 0,
                    imageLayers: state.imageLayers.map((layer) => clampLayerToCanvas(layer, state.originalWidth, state.originalHeight)),
                    selection: state.selection
                        ? {
                            x: clamp(state.selection.x, 0, state.originalWidth),
                            y: clamp(state.selection.y, 0, state.originalHeight),
                            width: clamp(state.selection.width, 0, state.originalWidth),
                            height: clamp(state.selection.height, 0, state.originalHeight),
                        }
                        : null,
                    panX: 0,
                    panY: 0,
                })),

                setImageOffset: (x, y) => set((state) => ({
                    imageOffsetX: clamp(x, 0, Math.max(0, state.canvasWidth - state.originalWidth)),
                    imageOffsetY: clamp(y, 0, Math.max(0, state.canvasHeight - state.originalHeight)),
                })),

                centerImage: () => set((state) => ({
                    imageOffsetX: Math.max(0, Math.floor((state.canvasWidth - state.originalWidth) / 2)),
                    imageOffsetY: Math.max(0, Math.floor((state.canvasHeight - state.originalHeight) / 2)),
                })),

                addImageLayer: (layer) => {
                    const id = layer.id ?? createId('image-layer');
                    const name = layer.name ?? `Layer ${Date.now().toString().slice(-4)}`;
                    set((state) => ({
                        imageLayers: [
                            ...state.imageLayers,
                            clampLayerToCanvas({
                                ...layer,
                                id,
                                name,
                                visible: layer.visible ?? true,
                                opacity: layer.opacity ?? 1,
                            }, state.canvasWidth, state.canvasHeight),
                        ],
                        activeImageLayerId: id,
                    }));
                    return id;
                },

                updateImageLayer: (id, updates) => set((state) => ({
                    imageLayers: state.imageLayers.map((layer) => {
                        if (layer.id !== id) {
                            return layer;
                        }
                        return clampLayerToCanvas({
                            ...layer,
                            ...updates,
                        }, state.canvasWidth, state.canvasHeight);
                    }),
                })),

                removeImageLayer: (id) => set((state) => ({
                    imageLayers: state.imageLayers.filter((layer) => layer.id !== id),
                    activeImageLayerId: state.activeImageLayerId === id ? null : state.activeImageLayerId,
                })),

                reorderImageLayer: (id, direction) => set((state) => {
                    const index = state.imageLayers.findIndex((layer) => layer.id === id);
                    if (index < 0) {
                        return state;
                    }
                    const swapIndex = direction === 'up' ? index + 1 : index - 1;
                    if (swapIndex < 0 || swapIndex >= state.imageLayers.length) {
                        return state;
                    }
                    const nextLayers = [...state.imageLayers];
                    const [layer] = nextLayers.splice(index, 1);
                    nextLayers.splice(swapIndex, 0, layer);
                    return { imageLayers: nextLayers };
                }),

                setActiveImageLayer: (activeImageLayerId) => set({ activeImageLayerId }),
                clearImageLayers: () => set({ imageLayers: [], activeImageLayerId: null }),

                setSelection: (selection) => set({ selection }),
                clearSelection: () => set({ selection: null }),

                openEditor: (editingImageUrl, width, height) => set({
                    isEditing: true,
                    editingImageUrl,
                    canvasWidth: width,
                    canvasHeight: height,
                    originalWidth: width,
                    originalHeight: height,
                    imageOffsetX: 0,
                    imageOffsetY: 0,
                    imageLayers: [],
                    activeImageLayerId: null,
                    selection: null,
                    zoom: 1,
                    panX: 0,
                    panY: 0,
                }),

                closeEditor: () => set({
                    isEditing: false,
                    editingImageUrl: null,
                }),

                reset: () => set(initialState),
            }),
            {
                name: 'canvas-editor-storage',
                partialize: (state) => ({
                    brushSettings: state.brushSettings,
                    maskOpacity: state.maskOpacity,
                    maskColor: state.maskColor,
                    maskBlur: state.maskBlur,
                    currentTool: state.currentTool,
                }),
            },
        ),
        { name: 'CanvasEditorStore' },
    ),
);

export const selectIsEditing = (state: CanvasState) => state.isEditing;
export const selectCurrentTool = (state: CanvasState) => state.currentTool;
export const selectBrushSettings = (state: CanvasState) => state.brushSettings;
export const selectZoom = (state: CanvasState) => state.zoom;
export const selectRegions = (state: CanvasState) => state.regions;
export const selectActiveRegion = (state: CanvasState) =>
    state.regions.find((region) => region.id === state.activeRegionId) || null;
export const selectActiveImageLayer = (state: CanvasState) =>
    state.imageLayers.find((layer) => layer.id === state.activeImageLayerId) || null;
