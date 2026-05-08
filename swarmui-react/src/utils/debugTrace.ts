import { useEffect, useRef } from 'react';
import { logger } from './logger';

const MAX_TRACE_ENTRIES = 80;
const traceBuffer: string[] = [];

function summarizeValue(value: unknown): unknown {
    if (Array.isArray(value)) {
        return `[array:${value.length}]`;
    }
    if (value instanceof Set) {
        return `[set:${value.size}]`;
    }
    if (value && typeof value === 'object') {
        return '[object]';
    }
    if (typeof value === 'function') {
        return '[function]';
    }
    return value;
}

function formatTracePayload(payload: Record<string, unknown>): string {
    return JSON.stringify(payload, null, 2);
}

function pushTraceLine(line: string) {
    traceBuffer.push(line);
    if (traceBuffer.length > MAX_TRACE_ENTRIES) {
        traceBuffer.splice(0, traceBuffer.length - MAX_TRACE_ENTRIES);
    }
}

export function getRecentDebugTrace(): string {
    return traceBuffer.join('\n');
}

export function recordDebugTrace(name: string, values: Record<string, unknown>) {
    const payload = Object.fromEntries(
        Object.entries(values).map(([key, value]) => [key, summarizeValue(value)])
    );
    logger.info(`[Trace:${name}] event`, payload);
    pushTraceLine(`[Trace:${name}] event ${formatTracePayload(payload)}`);
}

export function useDebugTrace(name: string, values: Record<string, unknown>) {
    const renderCountRef = useRef(0);
    const previousRef = useRef<Record<string, unknown> | null>(null);

    useEffect(() => {
        if (!import.meta.env.DEV) {
            return;
        }

        renderCountRef.current += 1;
        const renderCount = renderCountRef.current;

        const previous = previousRef.current;
        const changed: Record<string, { previous: unknown; next: unknown }> = {};

        if (previous) {
            for (const [key, value] of Object.entries(values)) {
                if (!Object.is(previous[key], value)) {
                    changed[key] = {
                        previous: summarizeValue(previous[key]),
                        next: summarizeValue(value),
                    };
                }
            }
        }

        if (!previous) {
            const payload = Object.fromEntries(
                Object.entries(values).map(([key, value]) => [key, summarizeValue(value)])
            );
            logger.debug(`[Trace:${name}] mount`, payload);
            pushTraceLine(`[Trace:${name}] mount ${formatTracePayload(payload)}`);
        } else if (Object.keys(changed).length > 0) {
            logger.debug(`[Trace:${name}] render #${renderCount}`, changed);
            pushTraceLine(`[Trace:${name}] render #${renderCount} ${formatTracePayload(changed)}`);
        }

        previousRef.current = values;
    });
}
