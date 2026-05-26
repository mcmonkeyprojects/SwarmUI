import { useRef, useEffect, useCallback } from 'react';

/**
 * Hook to manage AbortController for canceling in-flight requests.
 * Automatically aborts pending requests on component unmount.
 */
export function useAbortController() {
    const controllerRef = useRef<AbortController | null>(null);

    // Create a new AbortController
    const createController = useCallback(() => {
        // Abort any existing controller
        if (controllerRef.current) {
            controllerRef.current.abort();
        }
        controllerRef.current = new AbortController();
        return controllerRef.current;
    }, []);

    // Get the current signal (creates controller if needed)
    const getSignal = useCallback(() => {
        if (!controllerRef.current) {
            controllerRef.current = new AbortController();
        }
        return controllerRef.current.signal;
    }, []);

    // Abort the current controller
    const abort = useCallback((reason?: string) => {
        controllerRef.current?.abort(reason);
    }, []);

    // Check if currently aborted
    const isAborted = useCallback(() => {
        return controllerRef.current?.signal.aborted ?? false;
    }, []);

    // Reset the controller (abort current and create new)
    const reset = useCallback(() => {
        abort();
        controllerRef.current = new AbortController();
        return controllerRef.current;
    }, [abort]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            controllerRef.current?.abort('Component unmounted');
        };
    }, []);

    return {
        createController,
        getSignal,
        abort,
        isAborted,
        reset,
    };
}

/**
 * Hook for making fetch requests with automatic abort on unmount.
 * Prevents "Can't perform state update on unmounted component" errors.
 */
export function useAbortableFetch() {
    const { getSignal, abort, reset } = useAbortController();

    const fetchWithAbort = useCallback(async <T>(
        url: string,
        options?: RequestInit
    ): Promise<T> => {
        const signal = reset().signal;

        const response = await fetch(url, {
            ...options,
            signal,
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return response.json();
    }, [reset]);

    return {
        fetch: fetchWithAbort,
        abort,
        getSignal,
    };
}

/**
 * Hook to track if component is mounted.
 * Useful for async operations that shouldn't update state after unmount.
 */
export function useIsMounted() {
    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    return useCallback(() => isMountedRef.current, []);
}
