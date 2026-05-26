/**
 * useBatchThumbnails Hook
 * 
 * Generates thumbnails for multiple images in parallel using WebWorkers.
 * Implements concurrency control and caching for optimal performance.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useImageProcessing } from './useImageProcessing';

// ============================================================================
// Types
// ============================================================================

interface ThumbnailEntry {
    url: string;
    thumbnailUrl: string | null;
    loading: boolean;
    error: boolean;
}

interface UseBatchThumbnailsOptions {
    /** Maximum thumbnail dimension (default: 150) */
    maxSize?: number;
    /** Number of concurrent thumbnail generations (default: 4) */
    concurrency?: number;
    /** Whether to enable caching (default: true) */
    enableCache?: boolean;
}

interface UseBatchThumbnailsResult {
    /** Map of original URL to thumbnail data */
    thumbnails: Map<string, ThumbnailEntry>;
    /** Get thumbnail URL for a specific image */
    getThumbnail: (url: string) => string | null;
    /** Check if thumbnail is loading */
    isLoading: (url: string) => boolean;
    /** Number of thumbnails currently being processed */
    pendingCount: number;
    /** Clear thumbnail cache */
    clearCache: () => void;
}

// ============================================================================
// Global Cache
// ============================================================================

const thumbnailCache = new Map<string, string>();
const MAX_CACHE_SIZE = 500;

function addToCache(url: string, thumbnailUrl: string): void {
    // LRU eviction
    if (thumbnailCache.size >= MAX_CACHE_SIZE) {
        const firstKey = thumbnailCache.keys().next().value;
        if (firstKey) {
            const oldUrl = thumbnailCache.get(firstKey);
            if (oldUrl) URL.revokeObjectURL(oldUrl);
            thumbnailCache.delete(firstKey);
        }
    }
    thumbnailCache.set(url, thumbnailUrl);
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useBatchThumbnails(
    imageUrls: string[],
    options: UseBatchThumbnailsOptions = {}
): UseBatchThumbnailsResult {
    const {
        maxSize = 150,
        concurrency = 4,
        enableCache = true,
    } = options;

    const [thumbnails, setThumbnails] = useState<Map<string, ThumbnailEntry>>(new Map());
    const { createThumbnail, isReady } = useImageProcessing();

    const processingRef = useRef<Set<string>>(new Set());
    const queueRef = useRef<string[]>([]);
    const activeCountRef = useRef(0);

    // Process queue with concurrency control
    // eslint-disable-next-line react-hooks/preserve-manual-memoization
    const processQueue = useCallback(async () => {
        while (queueRef.current.length > 0 && activeCountRef.current < concurrency) {
            const url = queueRef.current.shift();
            if (!url || processingRef.current.has(url)) continue;

            processingRef.current.add(url);
            activeCountRef.current++;

            // Check cache first
            if (enableCache && thumbnailCache.has(url)) {
                setThumbnails(prev => {
                    const next = new Map(prev);
                    next.set(url, {
                        url,
                        thumbnailUrl: thumbnailCache.get(url)!,
                        loading: false,
                        error: false,
                    });
                    return next;
                });
                processingRef.current.delete(url);
                activeCountRef.current--;
                continue;
            }

            // Mark as loading
            setThumbnails(prev => {
                const next = new Map(prev);
                next.set(url, {
                    url,
                    thumbnailUrl: null,
                    loading: true,
                    error: false,
                });
                return next;
            });

            try {
                const blob = await createThumbnail(url, maxSize);
                const thumbnailUrl = URL.createObjectURL(blob);

                if (enableCache) {
                    addToCache(url, thumbnailUrl);
                }

                setThumbnails(prev => {
                    const next = new Map(prev);
                    next.set(url, {
                        url,
                        thumbnailUrl,
                        loading: false,
                        error: false,
                    });
                    return next;
                });
            } catch (error) {
                console.error(`Failed to create thumbnail for ${url}:`, error);
                setThumbnails(prev => {
                    const next = new Map(prev);
                    next.set(url, {
                        url,
                        thumbnailUrl: null,
                        loading: false,
                        error: true,
                    });
                    return next;
                });
            } finally {
                processingRef.current.delete(url);
                activeCountRef.current--;
                // Process next item
                processQueue();
            }
        }
    }, [createThumbnail, maxSize, concurrency, enableCache]);

    // Queue new URLs for processing
    useEffect(() => {
        if (!isReady) return;

        const newUrls = imageUrls.filter(url =>
            !thumbnails.has(url) &&
            !processingRef.current.has(url) &&
            !queueRef.current.includes(url)
        );

        if (newUrls.length > 0) {
            queueRef.current.push(...newUrls);
            processQueue();
        }
    }, [imageUrls, isReady, thumbnails, processQueue]);

    // Get thumbnail for specific URL
    const getThumbnail = useCallback((url: string): string | null => {
        return thumbnails.get(url)?.thumbnailUrl ?? null;
    }, [thumbnails]);

    // Check if loading
    const isLoading = useCallback((url: string): boolean => {
        return thumbnails.get(url)?.loading ?? false;
    }, [thumbnails]);

    // Pending count
    const pendingCount = useMemo(() => {
        return Array.from(thumbnails.values()).filter(t => t.loading).length;
    }, [thumbnails]);

    // Clear cache
    const clearCache = useCallback(() => {
        thumbnailCache.forEach(url => URL.revokeObjectURL(url));
        thumbnailCache.clear();
        setThumbnails(new Map());
    }, []);

    // Cleanup object URLs on unmount
    useEffect(() => {
        return () => {
            // Don't revoke cached URLs, only non-cached ones
            if (!enableCache) {
                thumbnails.forEach(entry => {
                    if (entry.thumbnailUrl) {
                        URL.revokeObjectURL(entry.thumbnailUrl);
                    }
                });
            }
        };
    }, [enableCache, thumbnails]);

    return {
        thumbnails,
        getThumbnail,
        isLoading,
        pendingCount,
        clearCache,
    };
}

export default useBatchThumbnails;
