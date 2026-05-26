/**
 * useImageProcessing Hook
 * 
 * Provides access to the image processing WebWorker for off-main-thread
 * image operations like placeholder generation, thumbnails, and hashing.
 */

import { useCallback, useRef, useEffect, useState } from 'react';
import * as Comlink from 'comlink';
import type { ImageProcessingWorkerAPI } from '../workers/imageProcessing.worker';

// ============================================================================
// Types
// ============================================================================

interface UseImageProcessingResult {
    /** Generate a gradient placeholder data URL */
    generatePlaceholder: (width?: number, height?: number, color?: string) => Promise<string>;

    /** Create a thumbnail from an image URL */
    createThumbnail: (imageUrl: string, maxSize?: number) => Promise<Blob>;

    /** Calculate hash for an image (for caching) */
    calculateHash: (imageUrl: string) => Promise<string>;

    /** Extract dominant colors from image */
    extractColors: (imageUrl: string) => Promise<{ dominant: string; palette: string[] }>;

    /** Resize an image to specific dimensions */
    resizeImage: (imageUrl: string, width: number, height: number) => Promise<Blob>;

    /** Whether the worker is ready */
    isReady: boolean;

    /** Any initialization error */
    error: Error | null;

    /** Terminate the worker */
    terminate: () => void;
}

// ============================================================================
// Singleton Worker Instance
// ============================================================================

let sharedWorker: Worker | null = null;
let sharedProxy: Comlink.Remote<ImageProcessingWorkerAPI> | null = null;
let refCount = 0;

function getSharedWorker(): {
    worker: Worker;
    proxy: Comlink.Remote<ImageProcessingWorkerAPI>;
} {
    if (!sharedWorker) {
        sharedWorker = new Worker(
            new URL('../workers/imageProcessing.worker.ts', import.meta.url),
            { type: 'module' }
        );
        sharedProxy = Comlink.wrap<ImageProcessingWorkerAPI>(sharedWorker);
    }
    refCount++;
    return { worker: sharedWorker, proxy: sharedProxy! };
}

function releaseSharedWorker(): void {
    refCount--;
    if (refCount <= 0 && sharedWorker) {
        sharedWorker.terminate();
        sharedWorker = null;
        sharedProxy = null;
        refCount = 0;
    }
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useImageProcessing(): UseImageProcessingResult {
    const proxyRef = useRef<Comlink.Remote<ImageProcessingWorkerAPI> | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    // Initialize worker on mount
    useEffect(() => {
        queueMicrotask(() => {
            try {
                const { proxy } = getSharedWorker();
                proxyRef.current = proxy;
                setIsReady(true);
            } catch (err) {
                setError(err instanceof Error ? err : new Error('Failed to initialize worker'));
            }
        });

        return () => {
            releaseSharedWorker();
        };
    }, []);

    /**
     * Generate a gradient placeholder
     */
    const generatePlaceholder = useCallback(async (
        width: number = 32,
        height: number = 32,
        color: string = '#2c2e33'
    ): Promise<string> => {
        if (!proxyRef.current) {
            // Fallback: generate on main thread
            return generatePlaceholderFallback(width, height, color);
        }

        try {
            const imageData = await proxyRef.current.generatePlaceholderSync({
                width,
                height,
                baseColor: color,
            });

            // Convert ImageData to data URL on main thread
            const canvas = document.createElement('canvas');
            canvas.width = imageData.width;
            canvas.height = imageData.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return '';

            ctx.putImageData(imageData, 0, 0);
            return canvas.toDataURL('image/png');
        } catch (err) {
            console.warn('Worker placeholder generation failed, using fallback:', err);
            return generatePlaceholderFallback(width, height, color);
        }
    }, []);

    /**
     * Create a thumbnail from an image URL
     */
    const createThumbnail = useCallback(async (
        imageUrl: string,
        maxSize: number = 150
    ): Promise<Blob> => {
        if (!proxyRef.current) {
            throw new Error('Worker not initialized');
        }

        const response = await fetch(imageUrl);
        const buffer = await response.arrayBuffer();

        const resultBuffer = await proxyRef.current.createThumbnail(buffer, {
            maxWidth: maxSize,
            maxHeight: maxSize,
            quality: 0.8,
        });

        return new Blob([resultBuffer], { type: 'image/jpeg' });
    }, []);

    /**
     * Calculate hash for cache key generation
     */
    const calculateHash = useCallback(async (imageUrl: string): Promise<string> => {
        if (!proxyRef.current) {
            // Fallback: simple string hash
            return simpleHash(imageUrl);
        }

        try {
            const response = await fetch(imageUrl);
            const buffer = await response.arrayBuffer();
            return proxyRef.current.calculateHash(buffer);
        } catch (err) {
            console.warn('Worker hash failed, using fallback:', err);
            return simpleHash(imageUrl);
        }
    }, []);

    /**
     * Extract dominant colors from image
     */
    const extractColors = useCallback(async (
        imageUrl: string
    ): Promise<{ dominant: string; palette: string[] }> => {
        if (!proxyRef.current) {
            return { dominant: '#2c2e33', palette: [] };
        }

        const response = await fetch(imageUrl);
        const buffer = await response.arrayBuffer();
        return proxyRef.current.extractColors(buffer);
    }, []);

    /**
     * Resize image to specific dimensions
     */
    const resizeImage = useCallback(async (
        imageUrl: string,
        width: number,
        height: number
    ): Promise<Blob> => {
        if (!proxyRef.current) {
            throw new Error('Worker not initialized');
        }

        const response = await fetch(imageUrl);
        const buffer = await response.arrayBuffer();

        const resultBuffer = await proxyRef.current.resizeImage(buffer, width, height);
        return new Blob([resultBuffer], { type: 'image/jpeg' });
    }, []);

    /**
     * Terminate the shared worker
     */
    const terminate = useCallback(() => {
        releaseSharedWorker();
        proxyRef.current = null;
        setIsReady(false);
    }, []);

    return {
        generatePlaceholder,
        createThumbnail,
        calculateHash,
        extractColors,
        resizeImage,
        isReady,
        error,
        terminate,
    };
}

// ============================================================================
// Fallback Functions (main thread)
// ============================================================================

function generatePlaceholderFallback(
    width: number,
    height: number,
    baseColor: string
): string {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (!ctx) return '';

    const gradient = ctx.createRadialGradient(
        width / 2, height / 2, 0,
        width / 2, height / 2, Math.max(width, height) / 2
    );

    gradient.addColorStop(0, lightenColor(baseColor, 20));
    gradient.addColorStop(1, baseColor);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    return canvas.toDataURL('image/png');
}

function lightenColor(hex: string, percent: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;

    return '#' + (
        0x1000000 +
        (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
        (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
        (B < 255 ? (B < 1 ? 0 : B) : 255)
    ).toString(16).slice(1);
}

function simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
}

export default useImageProcessing;
