/**
 * Layout Store
 * 
 * Manages UI layout state for the Generate page (panel sizes, collapse states).
 * State persists in memory across tab switches but resets on browser refresh.
 */
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

// Default panel configurations
export const DEFAULT_PANEL_CONFIG = {
    left: {
        initialSize: 340,
        minSize: 200,
        maxSize: 500,
    },
    right: {
        initialSize: 280,
        minSize: 200,
        maxSize: 450,
    },
    bottom: {
        initialSize: 160,
        minSize: 100,
        maxSize: 400,
    },
} as const;

export type GalleryDensity = 'comfortable' | 'compact';
export type QuickModuleKey = 'sampling' | 'image-prep' | 'hi-res-fix' | 'upscale' | 'model-stack';

interface LayoutState {
    // Panel collapse states
    leftPanelCollapsed: boolean;
    rightPanelCollapsed: boolean;
    bottomPanelCollapsed: boolean;

    // Panel sizes
    leftPanelSize: number;
    rightPanelSize: number;
    bottomPanelSize: number;
    sidebarWidth: number;
    galleryWidth: number;

    // Generate workspace state
    focusMode: boolean;
    openQuickModules: QuickModuleKey[];
    openInspectorSections: string[];
    galleryDensity: GalleryDensity;
    lastInspectorJumpTarget: string | null;

    // Setters
    setLeftPanelCollapsed: (collapsed: boolean) => void;
    setRightPanelCollapsed: (collapsed: boolean) => void;
    setBottomPanelCollapsed: (collapsed: boolean) => void;
    toggleLeftPanel: () => void;
    toggleRightPanel: () => void;
    toggleBottomPanel: () => void;
    setLeftPanelSize: (size: number) => void;
    setRightPanelSize: (size: number) => void;
    setBottomPanelSize: (size: number) => void;
    setSidebarWidth: (size: number) => void;
    setGalleryWidth: (size: number) => void;
    setFocusMode: (focusMode: boolean) => void;
    toggleFocusMode: () => void;
    setOpenQuickModules: (sections: QuickModuleKey[]) => void;
    setOpenInspectorSections: (sections: string[]) => void;
    setGalleryDensity: (density: GalleryDensity) => void;
    setLastInspectorJumpTarget: (target: string | null) => void;

    // Utility actions
    expandAllPanels: () => void;
    collapseAllPanels: () => void;
    enterFocusMode: () => void;
    exitFocusMode: () => void;
    resetLayout: () => void;
}

const defaultState = {
    leftPanelCollapsed: false,
    rightPanelCollapsed: false,
    bottomPanelCollapsed: true,
    leftPanelSize: DEFAULT_PANEL_CONFIG.left.initialSize,
    rightPanelSize: DEFAULT_PANEL_CONFIG.right.initialSize,
    bottomPanelSize: DEFAULT_PANEL_CONFIG.bottom.initialSize,
    sidebarWidth: 380,
    galleryWidth: 320,
    focusMode: false,
    openQuickModules: [],
    openInspectorSections: [],
    galleryDensity: 'comfortable' as GalleryDensity,
    lastInspectorJumpTarget: null,
};

export const useLayoutStore = create<LayoutState>()(
    devtools(
        (set) => ({
            ...defaultState,

            // Collapse state setters
            setLeftPanelCollapsed: (collapsed) => set({ leftPanelCollapsed: collapsed }),
            setRightPanelCollapsed: (collapsed) => set({ rightPanelCollapsed: collapsed }),
            setBottomPanelCollapsed: (collapsed) => set({ bottomPanelCollapsed: collapsed }),

            // Toggle functions
            toggleLeftPanel: () => set((state) => ({ leftPanelCollapsed: !state.leftPanelCollapsed })),
            toggleRightPanel: () => set((state) => ({ rightPanelCollapsed: !state.rightPanelCollapsed })),
            toggleBottomPanel: () => set((state) => ({ bottomPanelCollapsed: !state.bottomPanelCollapsed })),

            // Size setters
            setLeftPanelSize: (size) => set({ leftPanelSize: size }),
            setRightPanelSize: (size) => set({ rightPanelSize: size }),
            setBottomPanelSize: (size) => set({ bottomPanelSize: size }),
            setSidebarWidth: (size) => set({ sidebarWidth: size }),
            setGalleryWidth: (size) => set({ galleryWidth: size }),
            setFocusMode: (focusMode) => set({ focusMode }),
            toggleFocusMode: () => set((state) => ({ focusMode: !state.focusMode })),
            setOpenQuickModules: (sections) => set({ openQuickModules: sections }),
            setOpenInspectorSections: (sections) => set({ openInspectorSections: sections }),
            setGalleryDensity: (density) => set({ galleryDensity: density }),
            setLastInspectorJumpTarget: (target) => set({ lastInspectorJumpTarget: target }),

            // Utility actions
            expandAllPanels: () => set({
                leftPanelCollapsed: false,
                rightPanelCollapsed: false,
                bottomPanelCollapsed: false,
                focusMode: false,
            }),

            collapseAllPanels: () => set({
                leftPanelCollapsed: true,
                rightPanelCollapsed: true,
                bottomPanelCollapsed: true,
            }),

            enterFocusMode: () => set({
                leftPanelCollapsed: true,
                rightPanelCollapsed: true,
                bottomPanelCollapsed: true,
                focusMode: true,
            }),

            exitFocusMode: () => set({
                leftPanelCollapsed: false,
                rightPanelCollapsed: false,
                bottomPanelCollapsed: true, // Keep bottom collapsed by default
                focusMode: false,
            }),

            resetLayout: () => set(defaultState),
        }),
        { name: 'LayoutStore' }
    )
);

// ============================================================================
// GRANULAR SELECTORS
// ============================================================================

/**
 * Select left panel state
 */
export const useLeftPanel = () => useLayoutStore(
    useShallow((state) => ({
        collapsed: state.leftPanelCollapsed,
        size: state.leftPanelSize,
        setCollapsed: state.setLeftPanelCollapsed,
        toggle: state.toggleLeftPanel,
        setSize: state.setLeftPanelSize,
    }))
);

/**
 * Select right panel state
 */
export const useRightPanel = () => useLayoutStore(
    useShallow((state) => ({
        collapsed: state.rightPanelCollapsed,
        size: state.rightPanelSize,
        setCollapsed: state.setRightPanelCollapsed,
        toggle: state.toggleRightPanel,
        setSize: state.setRightPanelSize,
    }))
);

/**
 * Select bottom panel state
 */
export const useBottomPanel = () => useLayoutStore(
    useShallow((state) => ({
        collapsed: state.bottomPanelCollapsed,
        size: state.bottomPanelSize,
        setCollapsed: state.setBottomPanelCollapsed,
        toggle: state.toggleBottomPanel,
        setSize: state.setBottomPanelSize,
    }))
);

/**
 * Select all collapse states
 */
export const usePanelCollapseStates = () => useLayoutStore(
    useShallow((state) => ({
        leftPanelCollapsed: state.leftPanelCollapsed,
        rightPanelCollapsed: state.rightPanelCollapsed,
        bottomPanelCollapsed: state.bottomPanelCollapsed,
        toggleLeftPanel: state.toggleLeftPanel,
        toggleRightPanel: state.toggleRightPanel,
        toggleBottomPanel: state.toggleBottomPanel,
    }))
);

/**
 * Select layout utility actions
 */
export const useLayoutActions = () => useLayoutStore(
    useShallow((state) => ({
        expandAllPanels: state.expandAllPanels,
        collapseAllPanels: state.collapseAllPanels,
        enterFocusMode: state.enterFocusMode,
        exitFocusMode: state.exitFocusMode,
        resetLayout: state.resetLayout,
    }))
);

/**
 * Select Generate page workspace layout state.
 */
export const useGenerateWorkspaceLayout = () => useLayoutStore(
    useShallow((state) => ({
        sidebarWidth: state.sidebarWidth,
        galleryWidth: state.galleryWidth,
        focusMode: state.focusMode,
        openQuickModules: state.openQuickModules,
        openInspectorSections: state.openInspectorSections,
        galleryDensity: state.galleryDensity,
        lastInspectorJumpTarget: state.lastInspectorJumpTarget,
    }))
);

/**
 * Select Generate page workspace layout actions.
 */
export const useGenerateWorkspaceActions = () => useLayoutStore(
    useShallow((state) => ({
        setSidebarWidth: state.setSidebarWidth,
        setGalleryWidth: state.setGalleryWidth,
        setFocusMode: state.setFocusMode,
        toggleFocusMode: state.toggleFocusMode,
        setOpenQuickModules: state.setOpenQuickModules,
        setOpenInspectorSections: state.setOpenInspectorSections,
        setGalleryDensity: state.setGalleryDensity,
        setLastInspectorJumpTarget: state.setLastInspectorJumpTarget,
        resetLayout: state.resetLayout,
    }))
);
