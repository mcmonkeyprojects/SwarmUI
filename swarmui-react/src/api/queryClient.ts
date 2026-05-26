import { QueryClient } from '@tanstack/react-query';
import { isElectronRuntimeTarget } from '../config/runtimeTarget';

/**
 * Shared QueryClient instance with optimized defaults for SwarmUI.
 */
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Data stays fresh for 5 minutes
            staleTime: 5 * 60 * 1000,

            // Keep unused data in cache for 30 minutes
            gcTime: 30 * 60 * 1000,

            // Retry failed requests 2 times
            retry: 2,
            retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),

            // Refetch on window focus for fresh data
            refetchOnWindowFocus: !isElectronRuntimeTarget,

            // Don't refetch on mount if data is fresh
            refetchOnMount: false,

            // Keep previous data while refetching
            placeholderData: (previousData: unknown) => previousData,
        },
        mutations: {
            // Retry mutations once
            retry: 1,
        },
    },
});

/**
 * Query key factory for consistent cache keys
 */
export const queryKeys = {
    backend: {
        bootstrap: ['backend', 'bootstrap'] as const,
        t2iParams: ['backend', 't2i-params'] as const,
    },

    // Models
    models: {
        all: ['models'] as const,
        list: (subtype: string) => ['models', 'list', subtype] as const,
        detail: (name: string) => ['models', 'detail', name] as const,
        browser: (path: string, subtype: string) => ['models', 'browser', path, subtype] as const,
        loaded: () => ['models', 'loaded'] as const,
    },

    // LoRAs
    loras: {
        all: ['loras'] as const,
        list: () => ['loras', 'list'] as const,
        detail: (name: string) => ['loras', 'detail', name] as const,
    },

    // VAEs
    vaes: {
        all: ['vaes'] as const,
        list: () => ['vaes', 'list'] as const,
    },

    // Backends
    backends: {
        all: ['backends'] as const,
        list: () => ['backends', 'list'] as const,
    },

    // Images
    images: {
        all: ['images'] as const,
        list: (path: string) => ['images', 'list', path] as const,
        history: (path: string) => ['images', 'history', path] as const,
    },

    // Presets
    presets: {
        all: ['presets'] as const,
        list: () => ['presets', 'list'] as const,
    },

    // ControlNets
    controlnets: {
        all: ['controlnets'] as const,
        list: () => ['controlnets', 'list'] as const,
    },

    // Upscalers
    upscalers: {
        all: ['upscalers'] as const,
        list: () => ['upscalers', 'list'] as const,
    },

    // Embeddings
    embeddings: {
        all: ['embeddings'] as const,
        list: () => ['embeddings', 'list'] as const,
        browser: () => ['embeddings', 'browser'] as const,
    },

    // Model downloader
    modelDownloader: {
        all: ['model-downloader'] as const,
        candidates: (modelType: string) => ['model-downloader', 'candidates', modelType] as const,
        subfolders: (modelType: string, rootFolder: string) =>
            ['model-downloader', 'subfolders', modelType, rootFolder] as const,
    },

    // Comfy
    comfy: {
        workflows: () => ['comfy', 'workflows'] as const,
        nodeTypes: () => ['comfy', 'node-types'] as const,
    },

    // Wildcards
    wildcards: {
        all: ['wildcards'] as const,
        list: () => ['wildcards', 'list'] as const,
    },

    // Server info
    server: {
        info: ['server', 'info'] as const,
        status: ['server', 'status'] as const,
        resources: () => ['server', 'resources'] as const,
        backendTypes: () => ['server', 'backend-types'] as const,
    },
};
