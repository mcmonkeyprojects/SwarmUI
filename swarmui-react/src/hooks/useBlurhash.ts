import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Simple blurhash-like placeholder generator.
 * Creates a small canvas with interpolated colors based on image average.
 * (A true blurhash would require encoding on the server)
 */

interface UsePlaceholderOptions {
    width?: number;
    height?: number;
    color?: string;
}

/**
 * Generate a placeholder data URL with a gradient effect
 */
export function generatePlaceholderDataUrl(
    width: number = 32,
    height: number = 32,
    baseColor: string = '#2c2e33'
): string {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (!ctx) return '';

    // Create gradient
    const gradient = ctx.createRadialGradient(
        width / 2, height / 2, 0,
        width / 2, height / 2, Math.max(width, height) / 2
    );

    // Parse base color and create lighter/darker variants
    gradient.addColorStop(0, lightenColor(baseColor, 20));
    gradient.addColorStop(1, baseColor);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    return canvas.toDataURL('image/png');
}

/**
 * Lighten a hex color by a percentage
 */
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

/**
 * Hook to generate and cache placeholder images
 */
export function usePlaceholder(options: UsePlaceholderOptions = {}) {
    const { width = 32, height = 32, color = '#2c2e33' } = options;
    const [placeholder, setPlaceholder] = useState<string>('');
    const cacheRef = useRef<Map<string, string>>(new Map());

    useEffect(() => {
        const cacheKey = `${width}-${height}-${color}`;

        if (cacheRef.current.has(cacheKey)) {
            setPlaceholder(cacheRef.current.get(cacheKey)!);
            return;
        }

        const dataUrl = generatePlaceholderDataUrl(width, height, color);
        cacheRef.current.set(cacheKey, dataUrl);
        setPlaceholder(dataUrl);
    }, [width, height, color]);

    return placeholder;
}

/**
 * Image with progressive loading - shows placeholder while loading
 */
export function useProgressiveImage(src: string, placeholderColor?: string) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const placeholder = usePlaceholder({ color: placeholderColor });

    const handleLoad = useCallback(() => {
        setLoading(false);
        setError(false);
    }, []);

    const handleError = useCallback(() => {
        setLoading(false);
        setError(true);
    }, []);

    const retry = useCallback(() => {
        setLoading(true);
        setError(false);
    }, []);

    // Reset states when src changes
    useEffect(() => {
        queueMicrotask(() => {
            setLoading(true);
            setError(false);
        });
    }, [src]);

    return {
        loading,
        error,
        placeholder,
        handleLoad,
        handleError,
        retry,
        // The actual src to display
        currentSrc: loading ? placeholder : src,
    };
}
