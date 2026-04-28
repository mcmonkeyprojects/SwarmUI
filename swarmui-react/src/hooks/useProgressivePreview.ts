import { useEffect, useRef, useState } from 'react';
import { profiler } from '../utils/performanceProfiler';

const isDev = import.meta.env.DEV;

interface UseProgressivePreviewOptions {
    metricPrefix?: string;
}

/**
 * Progressive preview controller for live generation frames.
 * Keeps the last committed frame visible until the next frame has loaded.
 */
export function useProgressivePreview(
    source: string | null,
    isActive: boolean,
    options: UseProgressivePreviewOptions = {}
): string | null {
    const { metricPrefix = 'ws:preview' } = options;
    const [displaySource, setDisplaySource] = useState<string | null>(null);

    const commitCountRef = useRef(0);
    const requestTokenRef = useRef(0);
    const committedSignatureRef = useRef<string | null>(null);
    const pendingSignatureRef = useRef<string | null>(null);

    useEffect(() => {
        if (!isActive) {
            requestTokenRef.current += 1;
            pendingSignatureRef.current = null;
            committedSignatureRef.current = null;
        }
    }, [isActive]);

    useEffect(() => {
        if (!isActive || !source) {
            return;
        }

        if (source === committedSignatureRef.current || source === pendingSignatureRef.current) {
            return;
        }

        if (pendingSignatureRef.current && pendingSignatureRef.current !== source && isDev) {
            profiler.startTimer(`${metricPrefix}-drop`).end({
                reason: 'superseded',
                replacedSignature: pendingSignatureRef.current,
                nextSignature: source,
            });
        }

        const token = requestTokenRef.current + 1;
        requestTokenRef.current = token;
        pendingSignatureRef.current = source;

        let cancelled = false;
        let committed = false;
        const image = new Image();
        image.decoding = 'async';
        try {
            image.fetchPriority = 'high';
        } catch {
            // fetchPriority is optional; unsupported browsers can ignore it
        }

        const commitSource = async () => {
            if (committed || cancelled) {
                return;
            }

            committed = true;

            try {
                if (typeof image.decode === 'function') {
                    await image.decode();
                }
            } catch {
                // decode may reject for already-decoded or cross-origin cases; load still succeeded
            }

            if (cancelled || requestTokenRef.current !== token) {
                return;
            }

            setDisplaySource(source);
            committedSignatureRef.current = source;
            pendingSignatureRef.current = null;
            commitCountRef.current += 1;

            if (isDev) {
                profiler.startTimer(`${metricPrefix}-commit`).end({
                    signature: source,
                    commitCount: commitCountRef.current,
                });
            }
        };

        image.onload = () => {
            void commitSource();
        };

        image.onerror = () => {
            if (cancelled || requestTokenRef.current !== token) {
                return;
            }

            pendingSignatureRef.current = null;
            if (isDev) {
                profiler.startTimer(`${metricPrefix}-drop`).end({
                    reason: 'load_error',
                    signature: source,
                });
            }
        };

        image.src = source;

        if (image.complete) {
            void commitSource();
        }

        return () => {
            cancelled = true;
        };
    }, [isActive, metricPrefix, source]);

    return isActive ? displaySource : null;
}

export default useProgressivePreview;
