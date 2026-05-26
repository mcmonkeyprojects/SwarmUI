/**
 * useImagePreloader Hook
 * 
 * Preloads adjacent images in a gallery for instant viewing.
 * Automatically manages preload queue based on current position.
 */

import { useEffect, useRef, useCallback, useMemo } from 'react';

// ============================================================================
// Types
// ============================================================================

interface ImagePreloaderOptions {
    /** Number of images to preload in each direction */
    preloadCount?: number;
    /** Respect user's data-saver preference */
    respectSaveData?: boolean;
    /** Delay before starting preload (ms) */
    delay?: number;
}

interface UseImagePreloaderReturn {
    /** Manually preload specific images */
    preload: (urls: string[]) => void;
    /** Preload images adjacent to current index */
    preloadAdjacent: (currentIndex: number) => void;
    /** Clear all pending preloads */
    clear: () => void;
    /** Check if an image is preloaded */
    isPreloaded: (url: string) => boolean;
    /** Get preload status */
    stats: {
        preloaded: number;
        pending: number;
    };
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PRELOAD_COUNT = 2;
const DEFAULT_DELAY = 50;
const MAX_CACHE_SIZE = 50;

// Global cache for preloaded images
const preloadedImages = new Map<string, HTMLImageElement>();
const pendingPreloads = new Map<string, HTMLImageElement>();

// ============================================================================
// Utility Functions
// ============================================================================

function isDataSaverEnabled(): boolean {
    // @ts-expect-error - connection API not in all TypeScript defs
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return connection?.saveData === true;
}

/**
 * Evict oldest entries when cache is full
 */
function evictOldestIfNeeded(): void {
    if (preloadedImages.size >= MAX_CACHE_SIZE) {
        const oldestKey = preloadedImages.keys().next().value;
        if (oldestKey) {
            preloadedImages.delete(oldestKey);
        }
    }
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useImagePreloader(
    images: string[] | { src: string }[],
    options: ImagePreloaderOptions = {}
): UseImagePreloaderReturn {
    const {
        preloadCount = DEFAULT_PRELOAD_COUNT,
        respectSaveData = true,
        delay = DEFAULT_DELAY,
    } = options;

    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const currentPreloadsRef = useRef<Set<string>>(new Set());

    // Normalize images to string array
    const imageUrls = useMemo(() => {
        return images.map(img => typeof img === 'string' ? img : img.src);
    }, [images]);

    // Cleanup on unmount
    useEffect(() => {
        const currentPreloads = currentPreloadsRef.current;
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            // Cancel pending preloads for this component
            currentPreloads.forEach(url => {
                const img = pendingPreloads.get(url);
                if (img) {
                    img.src = '';
                    pendingPreloads.delete(url);
                }
            });
        };
    }, []);

    /**
     * Preload a single image
     */
    const preloadSingle = useCallback((url: string): void => {
        // Skip if already loaded or pending
        if (preloadedImages.has(url) || pendingPreloads.has(url)) {
            return;
        }

        evictOldestIfNeeded();

        const img = new Image();
        pendingPreloads.set(url, img);
        currentPreloadsRef.current.add(url);

        img.onload = () => {
            pendingPreloads.delete(url);
            preloadedImages.set(url, img);
        };

        img.onerror = () => {
            pendingPreloads.delete(url);
            currentPreloadsRef.current.delete(url);
        };

        img.src = url;
    }, []);

    /**
     * Preload multiple images
     */
    const preload = useCallback((urls: string[]) => {
        if (respectSaveData && isDataSaverEnabled()) return;

        urls.forEach(preloadSingle);
    }, [preloadSingle, respectSaveData]);

    /**
     * Preload images adjacent to current index
     */
    const preloadAdjacent = useCallback((currentIndex: number) => {
        if (respectSaveData && isDataSaverEnabled()) return;
        if (imageUrls.length === 0) return;

        // Clear any pending delayed preload
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        // Delay preload slightly to avoid rapid-fire on fast navigation
        timeoutRef.current = setTimeout(() => {
            const urlsToPreload: string[] = [];

            // Preload next images
            for (let i = 1; i <= preloadCount; i++) {
                const nextIndex = currentIndex + i;
                if (nextIndex < imageUrls.length) {
                    urlsToPreload.push(imageUrls[nextIndex]);
                }
            }

            // Preload previous images
            for (let i = 1; i <= preloadCount; i++) {
                const prevIndex = currentIndex - i;
                if (prevIndex >= 0) {
                    urlsToPreload.push(imageUrls[prevIndex]);
                }
            }

            preload(urlsToPreload);
        }, delay);
    }, [imageUrls, preloadCount, delay, preload, respectSaveData]);

    /**
     * Clear pending preloads
     */
    const clear = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }

        currentPreloadsRef.current.forEach(url => {
            const img = pendingPreloads.get(url);
            if (img) {
                img.src = '';
                pendingPreloads.delete(url);
            }
        });
        currentPreloadsRef.current.clear();
    }, []);

    /**
     * Check if image is preloaded
     */
    const isPreloaded = useCallback((url: string): boolean => {
        return preloadedImages.has(url);
    }, []);

    /**
     * Get current stats
     */
    const stats = useMemo(() => ({
        preloaded: preloadedImages.size,
        pending: pendingPreloads.size,
    }), []);

    return {
        preload,
        preloadAdjacent,
        clear,
        isPreloaded,
        stats,
    };
}

/**
 * Hook for preloading on hover
 * Returns handlers to attach to hoverable elements
 */
export function useHoverPreload(url: string, options: ImagePreloaderOptions = {}) {
    const { delay = 150, respectSaveData = true } = options;
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const onMouseEnter = useCallback(() => {
        if (respectSaveData && isDataSaverEnabled()) return;
        if (preloadedImages.has(url) || pendingPreloads.has(url)) return;

        timeoutRef.current = setTimeout(() => {
            const img = new Image();
            pendingPreloads.set(url, img);

            img.onload = () => {
                pendingPreloads.delete(url);
                preloadedImages.set(url, img);
            };
            img.onerror = () => pendingPreloads.delete(url);
            img.src = url;
        }, delay);
    }, [url, delay, respectSaveData]);

    const onMouseLeave = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    }, []);

    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    return { onMouseEnter, onMouseLeave };
}

/**
 * Clear all preload caches (useful for testing or memory management)
 */
export function clearImagePreloadCache(): void {
    preloadedImages.clear();
    pendingPreloads.forEach(img => { img.src = ''; });
    pendingPreloads.clear();
}

export default useImagePreloader;
