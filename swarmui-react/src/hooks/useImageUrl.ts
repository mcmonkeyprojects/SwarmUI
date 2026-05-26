import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook to manage blob URLs with automatic cleanup.
 * Prevents memory leaks by revoking URLs when they're no longer needed.
 */
export function useImageUrl(initialUrl?: string) {
    const [url, setUrl] = useState<string | null>(initialUrl || null);
    const urlRef = useRef<string | null>(null);

    // Track if this is a blob URL that needs cleanup
    const isBlobUrl = (u: string | null) => u?.startsWith('blob:') || false;

    // Cleanup function
    const revokeUrl = useCallback(() => {
        if (urlRef.current && isBlobUrl(urlRef.current)) {
            URL.revokeObjectURL(urlRef.current);
            urlRef.current = null;
        }
    }, []);

    // Set a new URL (revokes old one if it was a blob)
    const setNewUrl = useCallback((newUrl: string | null) => {
        revokeUrl();
        urlRef.current = newUrl;
        setUrl(newUrl);
    }, [revokeUrl]);

    // Create blob URL from file
    const createFromFile = useCallback((file: File): string => {
        revokeUrl();
        const newUrl = URL.createObjectURL(file);
        urlRef.current = newUrl;
        setUrl(newUrl);
        return newUrl;
    }, [revokeUrl]);

    // Create blob URL from blob
    const createFromBlob = useCallback((blob: Blob): string => {
        revokeUrl();
        const newUrl = URL.createObjectURL(blob);
        urlRef.current = newUrl;
        setUrl(newUrl);
        return newUrl;
    }, [revokeUrl]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            revokeUrl();
        };
    }, [revokeUrl]);

    return {
        url,
        setUrl: setNewUrl,
        createFromFile,
        createFromBlob,
        revokeUrl,
    };
}

/**
 * Hook to manage multiple blob URLs with automatic cleanup.
 * Useful for galleries or lists of images.
 */
export function useImageUrlCollection(maxUrls: number = 100) {
    const urlsRef = useRef<Map<string, string>>(new Map());
    const [urls, setUrls] = useState<Map<string, string>>(new Map());

    // Add a URL to the collection
    const addUrl = useCallback((key: string, url: string) => {
        urlsRef.current.set(key, url);

        // Cleanup oldest if over limit
        if (urlsRef.current.size > maxUrls) {
            const entries = Array.from(urlsRef.current.entries());
            if (entries.length > 0) {
                const [oldestKey, oldestUrl] = entries[0];
                if (oldestUrl?.startsWith('blob:')) {
                    URL.revokeObjectURL(oldestUrl);
                }
                urlsRef.current.delete(oldestKey);
            }
        }

        setUrls(new Map(urlsRef.current));
    }, [maxUrls]);

    // Remove and cleanup a specific URL
    const removeUrl = useCallback((key: string) => {
        const url = urlsRef.current.get(key);
        if (url?.startsWith('blob:')) {
            URL.revokeObjectURL(url);
        }
        urlsRef.current.delete(key);
        setUrls(new Map(urlsRef.current));
    }, []);

    // Get a URL by key
    const getUrl = useCallback((key: string) => {
        return urlsRef.current.get(key) || null;
    }, []);

    // Clear all URLs
    const clearAll = useCallback(() => {
        urlsRef.current.forEach((url) => {
            if (url.startsWith('blob:')) {
                URL.revokeObjectURL(url);
            }
        });
        urlsRef.current.clear();
        setUrls(new Map());
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        const urlsToRevoke = urlsRef.current;
        return () => {
            urlsToRevoke.forEach((url) => {
                if (url.startsWith('blob:')) {
                    URL.revokeObjectURL(url);
                }
            });
        };
    }, []);

    return {
        urls,
        addUrl,
        removeUrl,
        getUrl,
        clearAll,
        size: urls.size,
    };
}
