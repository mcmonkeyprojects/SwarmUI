/**
 * Preload Critical Data
 * 
 * Preloads essential data on app idle.
 * Improves perceived performance by having data ready before user navigates.
 */

import { queryClient, queryKeys } from '../api/queryClient';
import { swarmBackendAdapter } from '../api/backendAdapter';

let hasPreloaded = false;

/**
 * Preload critical data and heavy components on idle
 * Call this after initial render when browser is not busy
 */
export async function preloadCriticalData(): Promise<void> {
    if (hasPreloaded) return;
    hasPreloaded = true;

    console.debug('[Preload] Starting critical data preload...');

    Promise.all([
        queryClient.prefetchQuery({
            queryKey: queryKeys.backend.bootstrap,
            queryFn: () => swarmBackendAdapter.getBootstrap('startup', { source: 'preload' }),
            staleTime: 300000,
        }).catch(() => { }),
    ]).then(() => {
        console.debug('[Preload] Critical data preload complete');
    }).catch(() => {
        // Silently fail - preload is best effort
    });
}

/**
 * Check if critical data has been preloaded
 */
export function isPreloaded(): boolean {
    return hasPreloaded;
}

/**
 * Reset preload state (for testing/hot reload)
 */
export function resetPreloadState(): void {
    hasPreloaded = false;
}
