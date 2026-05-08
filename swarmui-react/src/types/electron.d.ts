interface ElectronNativeSpellIssue {
    startIndex: number;
    length: number;
    word: string;
    suggestions: string[];
}

interface ElectronBridge {
    getPerformanceMetricsPath?: () => Promise<string>;
    readPerformanceMetrics?: () => Promise<string | null>;
    writePerformanceMetrics?: (payload: string) => Promise<{ success: boolean; path: string; error?: string }>;
    getSwarmUIStatus?: () => Promise<{ running: boolean; serverReady: boolean; port: number }>;
    restartSwarmUI?: () => Promise<{ success: boolean }>;
    shutdownApp?: () => Promise<boolean>;
    reloadWrapper?: () => Promise<boolean>;
    selectFolder?: (startPath?: string) => Promise<string | null>;
    version?: string;
    platform?: string;
    isElectron?: boolean;
    hasNativeSpellcheck?: () => boolean;
    scanTextForMisspellings?: (text: string) => ElectronNativeSpellIssue[];
    getIgnoredSpellWords?: () => Promise<string[]>;
    onIgnoredSpellWordsUpdated?: (callback: (words: string[]) => void) => void;
    offIgnoredSpellWordsUpdated?: (callback: (words: string[]) => void) => void;
    isDesktopNativeContextMenuEnabled?: () => boolean;
    setPromptTargetActive?: (active: boolean) => void;
    onPromptContextAction?: (callback: (payload: { action: 'autocorrect-format' | 'grammar-check' }) => void) => void;
    offPromptContextAction?: (callback: (payload: { action: 'autocorrect-format' | 'grammar-check' }) => void) => void;
    versions?: {
        node?: string;
        electron?: string;
        chrome?: string;
    };
}

declare global {
    interface Window {
        electron?: ElectronBridge;
        electronAPI?: ElectronBridge;
    }
}

export {};
