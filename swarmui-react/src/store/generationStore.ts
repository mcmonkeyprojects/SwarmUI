import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import type { GenerateParams } from '../api/types';

function normalizeBatchOutputFolder(folder: string | null | undefined): string {
    return (folder || '')
        .replace(/\\/g, '/')
        .split('/')
        .map((part) => part.trim())
        .filter(Boolean)
        .join('/');
}

interface GenerationState {
    // Generation Params
    params: GenerateParams;

    // UI Specific State
    selectedModel: string;
    selectedBackend: string;
    activeLoras: { lora: string; weight: number }[];
    activeEmbeddings: string[];
    activeWildcards: string[];
    wildcardText: string;
    batchOutputFolder: string;

    // Session Gallery - persists across tab switches but NOT on page refresh
    sessionImages: string[];

    // Canvas State - persists across tab switches but NOT on page refresh
    previewImage: string | null;
    currentImageIndex: number;
    statusText: string;

    // Mode Toggles - explicit control over which features are enabled
    enableInitImage: boolean;
    enableRefiner: boolean;
    enableControlNet: boolean;
    enableVideo: boolean;
    enableVariation: boolean;

    // Setters
    setParams: (params: Partial<GenerateParams>) => void;
    setSelectedModel: (model: string) => void;
    setSelectedBackend: (backend: string) => void;
    addLora: (lora: string, weight: number) => void;
    removeLora: (lora: string) => void;
    updateLoraWeight: (lora: string, weight: number) => void;
    setLoras: (loras: { lora: string; weight: number }[]) => void;
    setEmbeddings: (embeddings: string[]) => void;
    setWildcards: (wildcards: string[]) => void;
    setWildcardText: (text: string) => void;
    setBatchOutputFolder: (folder: string) => void;
    clearBatchOutputFolder: () => void;

    // Session Gallery Actions
    addSessionImage: (url: string) => void;
    addSessionImages: (urls: string[]) => void;
    removeSessionImage: (index: number) => void;
    setSessionImages: (images: string[]) => void;
    clearSessionImages: () => void;

    // Canvas State Actions
    setPreviewImage: (image: string | null) => void;
    setCurrentImageIndex: (index: number) => void;
    setStatusText: (text: string) => void;
    goToNextImage: () => void;
    goToPrevImage: () => void;

    // Mode Toggle Setters
    setEnableInitImage: (enabled: boolean) => void;
    setEnableRefiner: (enabled: boolean) => void;
    setEnableControlNet: (enabled: boolean) => void;
    setEnableVideo: (enabled: boolean) => void;
    setEnableVariation: (enabled: boolean) => void;

    // Reset
    reset: () => void;
}

const defaultParams: GenerateParams = {
    prompt: '',
    negativeprompt: '',
    model: '',
    images: 1,
    steps: 20,
    cfgscale: 7,
    seed: -1,
    width: 512,
    height: 512,
    batchsize: 1,
    clipstopatlayer: -1,
};

export const useGenerationStore = create<GenerationState>()(
    devtools(
        persist(
            (set) => ({
                params: defaultParams,
                selectedModel: '',
                selectedBackend: '',
                activeLoras: [],
                activeEmbeddings: [],
                activeWildcards: [],
                wildcardText: '',
                batchOutputFolder: '',
                sessionImages: [],

                // Canvas state - session only
                previewImage: null,
                currentImageIndex: 0,
                statusText: '',

                // Mode toggles - all OFF by default
                enableInitImage: false,
                enableRefiner: false,
                enableControlNet: false,
                enableVideo: false,
                enableVariation: false,

                setParams: (newParams) => set((state) => ({ params: { ...state.params, ...newParams } })),
                setSelectedModel: (model) => set({ selectedModel: model }),
                setSelectedBackend: (backend) => set({ selectedBackend: backend }),

                addLora: (lora, weight) => set((state) => {
                    if (state.activeLoras.some(l => l.lora === lora)) return state;
                    return { activeLoras: [...state.activeLoras, { lora, weight }] };
                }),
                removeLora: (lora) => set((state) => ({
                    activeLoras: state.activeLoras.filter(l => l.lora !== lora)
                })),
                updateLoraWeight: (lora, weight) => set((state) => ({
                    activeLoras: state.activeLoras.map(l => l.lora === lora ? { ...l, weight } : l)
                })),
                setLoras: (loras) => set({ activeLoras: loras }),

                setEmbeddings: (embeddings) => set({ activeEmbeddings: embeddings }),
                setWildcards: (wildcards) => set({ activeWildcards: wildcards }),
                setWildcardText: (text) => set({ wildcardText: text }),
                setBatchOutputFolder: (folder) => set({ batchOutputFolder: normalizeBatchOutputFolder(folder) }),
                clearBatchOutputFolder: () => set({ batchOutputFolder: '' }),

                // Session Gallery Actions - NOT persisted to localStorage
                addSessionImage: (url) => set((state) => ({
                    sessionImages: [...state.sessionImages, url]
                })),
                addSessionImages: (urls) => set((state) => ({
                    sessionImages: [...state.sessionImages, ...urls]
                })),
                removeSessionImage: (index) => set((state) => ({
                    sessionImages: state.sessionImages.filter((_, i) => i !== index)
                })),
                setSessionImages: (images) => set({ sessionImages: images }),
                clearSessionImages: () => set({ sessionImages: [] }),

                // Canvas state actions
                setPreviewImage: (image) => set({ previewImage: image }),
                setCurrentImageIndex: (index) => set({ currentImageIndex: index }),
                setStatusText: (text) => set({ statusText: text }),
                goToNextImage: () => set((state) => ({
                    currentImageIndex: state.currentImageIndex < state.sessionImages.length - 1
                        ? state.currentImageIndex + 1
                        : state.currentImageIndex
                })),
                goToPrevImage: () => set((state) => ({
                    currentImageIndex: state.currentImageIndex > 0
                        ? state.currentImageIndex - 1
                        : state.currentImageIndex
                })),

                // Mode toggle setters
                setEnableInitImage: (enabled) => set({ enableInitImage: enabled }),
                setEnableRefiner: (enabled) => set({ enableRefiner: enabled }),
                setEnableControlNet: (enabled) => set({ enableControlNet: enabled }),
                setEnableVideo: (enabled) => set({ enableVideo: enabled }),
                setEnableVariation: (enabled) => set({ enableVariation: enabled }),

                reset: () => set({
                    params: defaultParams,
                    selectedModel: '',
                    selectedBackend: '',
                    activeLoras: [],
                    activeEmbeddings: [],
                    activeWildcards: [],
                    wildcardText: '',
                    batchOutputFolder: '',
                    sessionImages: [],
                    previewImage: null,
                    currentImageIndex: 0,
                    statusText: '',
                    enableInitImage: false,
                    enableRefiner: false,
                    enableControlNet: false,
                    enableVideo: false,
                    enableVariation: false,
                })
            }),
            {
                name: 'swarmui-generation-storage',
                partialize: (state) => ({
                    params: state.params,
                    selectedModel: state.selectedModel,
                    selectedBackend: state.selectedBackend,
                    activeLoras: state.activeLoras,
                    activeEmbeddings: state.activeEmbeddings,
                    activeWildcards: state.activeWildcards,
                    wildcardText: state.wildcardText,
                    enableInitImage: state.enableInitImage,
                    enableRefiner: state.enableRefiner,
                    enableControlNet: state.enableControlNet,
                    enableVideo: state.enableVideo,
                    enableVariation: state.enableVariation,
                }),
            }
        ),
        { name: 'GenerationStore' }
    )
);

// ============================================================================
// GRANULAR SELECTORS
// Use these instead of destructuring the entire store to prevent unnecessary re-renders
// ============================================================================

/**
 * Select only the generation params - prevents re-render when model/LoRA changes
 */
export const useGenerationParams = () => useGenerationStore(
    useShallow((state) => ({
        params: state.params,
        setParams: state.setParams,
    }))
);

/**
 * Select only the selected model - prevents re-render when params change
 */
export const useSelectedModel = () => useGenerationStore(
    useShallow((state) => ({
        selectedModel: state.selectedModel,
        setSelectedModel: state.setSelectedModel,
    }))
);

/**
 * Select only the selected backend
 */
export const useSelectedBackend = () => useGenerationStore(
    useShallow((state) => ({
        selectedBackend: state.selectedBackend,
        setSelectedBackend: state.setSelectedBackend,
    }))
);

/**
 * Select only LoRA state and actions - prevents re-render when params change
 */
export const useActiveLoras = () => useGenerationStore(
    useShallow((state) => ({
        activeLoras: state.activeLoras,
        addLora: state.addLora,
        removeLora: state.removeLora,
        updateLoraWeight: state.updateLoraWeight,
        setLoras: state.setLoras,
    }))
);

/**
 * Select only embeddings state
 */
export const useActiveEmbeddings = () => useGenerationStore(
    useShallow((state) => ({
        activeEmbeddings: state.activeEmbeddings,
        setEmbeddings: state.setEmbeddings,
    }))
);

/**
 * Select only wildcards state
 */
export const useActiveWildcards = () => useGenerationStore(
    useShallow((state) => ({
        activeWildcards: state.activeWildcards,
        wildcardText: state.wildcardText,
        setWildcards: state.setWildcards,
        setWildcardText: state.setWildcardText,
    }))
);

export const useBatchOutputFolder = () => useGenerationStore(
    useShallow((state) => ({
        batchOutputFolder: state.batchOutputFolder,
        setBatchOutputFolder: state.setBatchOutputFolder,
        clearBatchOutputFolder: state.clearBatchOutputFolder,
    }))
);

/**
 * Select all mode toggles - prevents re-render when params/LoRAs change
 */
export const useModeToggles = () => useGenerationStore(
    useShallow((state) => ({
        enableInitImage: state.enableInitImage,
        enableRefiner: state.enableRefiner,
        enableControlNet: state.enableControlNet,
        enableVideo: state.enableVideo,
        enableVariation: state.enableVariation,
        setEnableInitImage: state.setEnableInitImage,
        setEnableRefiner: state.setEnableRefiner,
        setEnableControlNet: state.setEnableControlNet,
        setEnableVideo: state.setEnableVideo,
        setEnableVariation: state.setEnableVariation,
    }))
);

/**
 * Select just the init image toggle
 */
export const useInitImageToggle = () => useGenerationStore(
    useShallow((state) => ({
        enableInitImage: state.enableInitImage,
        setEnableInitImage: state.setEnableInitImage,
    }))
);

/**
 * Select just the refiner toggle
 */
export const useRefinerToggle = () => useGenerationStore(
    useShallow((state) => ({
        enableRefiner: state.enableRefiner,
        setEnableRefiner: state.setEnableRefiner,
    }))
);

/**
 * Select just the ControlNet toggle
 */
export const useControlNetToggle = () => useGenerationStore(
    useShallow((state) => ({
        enableControlNet: state.enableControlNet,
        setEnableControlNet: state.setEnableControlNet,
    }))
);

/**
 * Select just the video toggle
 */
export const useVideoToggle = () => useGenerationStore(
    useShallow((state) => ({
        enableVideo: state.enableVideo,
        setEnableVideo: state.setEnableVideo,
    }))
);

/**
 * Select just the variation toggle
 */
export const useVariationToggle = () => useGenerationStore(
    useShallow((state) => ({
        enableVariation: state.enableVariation,
        setEnableVariation: state.setEnableVariation,
    }))
);

/**
 * Select just the reset action
 */
export const useResetGeneration = () => useGenerationStore((state) => state.reset);

/**
 * Select session images and actions - for session gallery persistence
 */
export const useSessionImages = () => useGenerationStore(
    useShallow((state) => ({
        sessionImages: state.sessionImages,
        addSessionImage: state.addSessionImage,
        addSessionImages: state.addSessionImages,
        removeSessionImage: state.removeSessionImage,
        setSessionImages: state.setSessionImages,
        clearSessionImages: state.clearSessionImages,
    }))
);

/**
 * Select canvas state - for preview image and navigation persistence
 */
export const useCanvasState = () => useGenerationStore(
    useShallow((state) => ({
        previewImage: state.previewImage,
        currentImageIndex: state.currentImageIndex,
        statusText: state.statusText,
        setPreviewImage: state.setPreviewImage,
        setCurrentImageIndex: state.setCurrentImageIndex,
        setStatusText: state.setStatusText,
        goToNextImage: state.goToNextImage,
        goToPrevImage: state.goToPrevImage,
    }))
);

/**
 * Select only canvas navigation state used by the generation workspace.
 */
export const useCanvasNavigationState = () => useGenerationStore(
    useShallow((state) => ({
        currentImageIndex: state.currentImageIndex,
        setCurrentImageIndex: state.setCurrentImageIndex,
        goToNextImage: state.goToNextImage,
        goToPrevImage: state.goToPrevImage,
    }))
);
