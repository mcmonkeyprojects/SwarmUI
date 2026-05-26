import type { ClientLogLevel, ClientLogCategory } from '../stores/clientLogStore';
import { useClientLogStore } from '../stores/clientLogStore';
import { logger as consoleLogger } from './logger';

interface StructuredLogOptions {
    metadata?: Record<string, unknown>;
    correlationId?: string;
}

function logToStore(level: ClientLogLevel, category: ClientLogCategory, message: string, options?: StructuredLogOptions): void {
    if (typeof window === 'undefined') {
        return;
    }
    const store = useClientLogStore.getState();
    store.append({
        level,
        category,
        message,
        metadata: options?.metadata,
        correlationId: options?.correlationId,
    });
}

export const clientLogger = {
    debug(category: ClientLogCategory, message: string, options?: StructuredLogOptions): void {
        consoleLogger.debug(message, options?.metadata ?? {});
        logToStore('debug', category, message, options);
    },

    info(category: ClientLogCategory, message: string, options?: StructuredLogOptions): void {
        consoleLogger.info(message, options?.metadata ?? {});
        logToStore('info', category, message, options);
    },

    warn(category: ClientLogCategory, message: string, options?: StructuredLogOptions): void {
        consoleLogger.warn(message, options?.metadata ?? {});
        logToStore('warn', category, message, options);
    },

    error(category: ClientLogCategory, message: string, options?: StructuredLogOptions): void {
        consoleLogger.error(message, options?.metadata ?? {});
        logToStore('error', category, message, options);
    },
};
