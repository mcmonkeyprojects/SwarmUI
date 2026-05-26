import { useEffect } from 'react';
import { clientLogger } from '../utils/clientLogger';

export function useClientLogging(): void {
    useEffect(() => {
        const originalOnerror = window.onerror;
        const originalOnunhandledrejection = window.onunhandledrejection;

        const handleError = (message: string | Event, source?: string, lineno?: number, colno?: number, error?: Error) => {
            clientLogger.error('system', 'Uncaught error', {
                metadata: {
                    message: typeof message === 'string' ? message : String(message),
                    source,
                    lineno,
                    colno,
                    errorMessage: error?.message,
                    errorStack: error?.stack,
                },
            });

            if (originalOnerror) {
                originalOnerror.call(window, message, source, lineno, colno, error);
            }
        };

        const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
            clientLogger.error('system', 'Unhandled promise rejection', {
                metadata: {
                    reason: event.reason instanceof Error ? event.reason.message : String(event.reason),
                    stack: event.reason instanceof Error ? event.reason.stack : undefined,
                },
            });

            if (originalOnunhandledrejection) {
                originalOnunhandledrejection.call(window, event);
            }
        };

        window.onerror = handleError;
        window.onunhandledrejection = handleUnhandledRejection;

        return () => {
            if (window.onerror === handleError) {
                window.onerror = originalOnerror;
            }
            if (window.onunhandledrejection === handleUnhandledRejection) {
                window.onunhandledrejection = originalOnunhandledrejection;
            }
        };
    }, []);
}
