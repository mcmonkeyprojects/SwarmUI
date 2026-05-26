import { useState, useCallback, useEffect } from 'react';
import { logger } from '../utils/logger';

interface UseDataLoaderOptions<T> {
    /** Called when data is successfully loaded */
    onSuccess?: (data: T[]) => void;
    /** Called when loading fails */
    onError?: (error: unknown) => void;
    /** Whether to load data immediately on mount */
    loadOnMount?: boolean;
    /** Optional name for logging */
    name?: string;
}

interface UseDataLoaderResult<T> {
    data: T[];
    loading: boolean;
    error: Error | null;
    refresh: () => Promise<void>;
}

/**
 * Custom hook for loading data with consistent loading/error states.
 * Consolidates the pattern used by loadModels, loadVAEs, loadBackends, etc.
 * 
 * @param fetcher - Async function that returns array of data
 * @param options - Configuration options
 * @returns Object with data, loading state, error, and refresh function
 */
export function useDataLoader<T>(
    fetcher: () => Promise<T[]>,
    options: UseDataLoaderOptions<T> = {}
): UseDataLoaderResult<T> {
    const { onSuccess, onError, loadOnMount = true, name = 'data' } = options;

    const [data, setData] = useState<T[]>([]);
    const [loading, setLoading] = useState(loadOnMount);
    const [error, setError] = useState<Error | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        logger.debug(`Loading ${name}...`);

        try {
            const result = await fetcher();
            logger.debug(`Loaded ${name}:`, result);
            setData(result);
            onSuccess?.(result);
        } catch (err) {
            logger.error(`Failed to load ${name}:`, err);
            setError(err instanceof Error ? err : new Error(String(err)));
            onError?.(err);
        } finally {
            setLoading(false);
        }
    }, [fetcher, name, onSuccess, onError]);

    useEffect(() => {
        if (loadOnMount) {
            queueMicrotask(() => {
                refresh();
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { data, loading, error, refresh };
}
