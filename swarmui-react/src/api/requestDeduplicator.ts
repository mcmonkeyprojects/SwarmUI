/**
 * Request Deduplicator
 * 
 * Tracks in-flight requests and returns existing promises for duplicates.
 * Prevents wasted bandwidth from concurrent identical API calls.
 */

type InFlightRequest<T> = {
    promise: Promise<T>;
    timestamp: number;
};

const ENABLE_DEBUG_LOGS = import.meta.env.DEV;

class RequestDeduplicator {
    private inFlight: Map<string, InFlightRequest<unknown>> = new Map();

    /**
     * Generate cache key for a request
     */
    private getKey(endpoint: string, params: Record<string, unknown>): string {
        // Exclude session_id from key (it's always the same per session)
        const keyParams = { ...params };
        delete keyParams.session_id;
        return `${endpoint}:${JSON.stringify(keyParams)}`;
    }

    /**
     * Execute request with deduplication
     * @param endpoint API endpoint name
     * @param params Request parameters
     * @param executor Function that executes the actual request
     * @param ttl Time-to-live in ms before same request can be made again (default: 100ms)
     */
    async dedupe<T>(
        endpoint: string,
        params: Record<string, unknown>,
        executor: () => Promise<T>,
        ttl = 100
    ): Promise<T> {
        const key = this.getKey(endpoint, params);

        // Check for in-flight request within TTL
        const existing = this.inFlight.get(key) as InFlightRequest<T> | undefined;
        if (existing && Date.now() - existing.timestamp < ttl) {
            if (ENABLE_DEBUG_LOGS) {
                console.debug('[Deduplicator] Reusing in-flight request:', endpoint);
            }
            return existing.promise;
        }

        // Create new request
        const promise = executor().finally(() => {
            // Clean up after TTL expires
            setTimeout(() => {
                const current = this.inFlight.get(key);
                if (current?.promise === promise) {
                    this.inFlight.delete(key);
                }
            }, ttl);
        });

        this.inFlight.set(key, { promise, timestamp: Date.now() });
        return promise;
    }

    /**
     * Get count of in-flight requests (for debugging)
     */
    getInFlightCount(): number {
        return this.inFlight.size;
    }

    /**
     * Clear all in-flight requests
     */
    clear(): void {
        this.inFlight.clear();
    }
}

export const requestDeduplicator = new RequestDeduplicator();
