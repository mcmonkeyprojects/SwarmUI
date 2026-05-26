/**
 * Memory monitoring utilities for development.
 * Helps track memory usage and detect potential leaks.
 */

interface MemoryInfo {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
}

type PerformanceWithMemory = Performance & {
    memory: MemoryInfo;
};

export interface MemorySnapshot {
    timestamp: number;
    heapUsed: number;
    heapTotal: number;
    heapLimit: number;
    label?: string;
}

// Store memory snapshots for comparison
const snapshots: MemorySnapshot[] = [];
const MAX_SNAPSHOTS = 50;

/**
 * Check if memory API is available (Chrome only)
 */
export function isMemoryApiAvailable(): boolean {
    return 'memory' in performance;
}

/**
 * Get current memory usage (Chrome only)
 */
export function getMemoryUsage(): MemoryInfo | null {
    if (!isMemoryApiAvailable()) {
        return null;
    }
    const memory = (performance as PerformanceWithMemory).memory;
    return {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
    };
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Take a memory snapshot
 */
export function takeSnapshot(label?: string): MemorySnapshot | null {
    const memory = getMemoryUsage();
    if (!memory) return null;

    const snapshot: MemorySnapshot = {
        timestamp: Date.now(),
        heapUsed: memory.usedJSHeapSize,
        heapTotal: memory.totalJSHeapSize,
        heapLimit: memory.jsHeapSizeLimit,
        label,
    };

    snapshots.push(snapshot);

    // Keep only the last N snapshots
    while (snapshots.length > MAX_SNAPSHOTS) {
        snapshots.shift();
    }

    return snapshot;
}

/**
 * Compare two snapshots and return the difference
 */
export function compareSnapshots(
    earlier: MemorySnapshot,
    later: MemorySnapshot
): { heapDiff: number; percentChange: number } {
    const heapDiff = later.heapUsed - earlier.heapUsed;
    const percentChange = (heapDiff / earlier.heapUsed) * 100;
    return { heapDiff, percentChange };
}

/**
 * Get all snapshots
 */
export function getSnapshots(): MemorySnapshot[] {
    return [...snapshots];
}

/**
 * Clear all snapshots
 */
export function clearSnapshots(): void {
    snapshots.length = 0;
}

/**
 * Log memory usage to console (development only)
 */
export function logMemoryUsage(label?: string): void {
    if (!import.meta.env.DEV) return;

    const memory = getMemoryUsage();
    if (!memory) {
        console.debug('[Memory] Memory API not available (Chrome only)');
        return;
    }

    const prefix = label ? `[Memory: ${label}]` : '[Memory]';
    console.debug(
        `${prefix} Heap: ${formatBytes(memory.usedJSHeapSize)} / ${formatBytes(memory.totalJSHeapSize)} (limit: ${formatBytes(memory.jsHeapSizeLimit)})`
    );
}

/**
 * Warn if memory usage exceeds threshold
 */
export function checkMemoryThreshold(thresholdPercent: number = 80): boolean {
    const memory = getMemoryUsage();
    if (!memory) return false;

    const usagePercent = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;

    if (usagePercent > thresholdPercent) {
        console.warn(
            `[Memory Warning] Heap usage at ${usagePercent.toFixed(1)}% (${formatBytes(memory.usedJSHeapSize)})`
        );
        return true;
    }

    return false;
}

/**
 * Track object lifecycle (development only)
 */
export class ObjectTracker {
    private static instances = new Map<string, Set<object>>();

    static track(category: string, obj: object): void {
        if (!import.meta.env.DEV) return;

        if (!this.instances.has(category)) {
            this.instances.set(category, new Set());
        }
        this.instances.get(category)!.add(obj);
    }

    static untrack(category: string, obj: object): void {
        if (!import.meta.env.DEV) return;
        this.instances.get(category)?.delete(obj);
    }

    static getCount(category: string): number {
        return this.instances.get(category)?.size ?? 0;
    }

    static logCounts(): void {
        if (!import.meta.env.DEV) return;

        console.debug('[Object Tracker]');
        this.instances.forEach((set, category) => {
            console.debug(`  ${category}: ${set.size} instances`);
        });
    }

    static clear(): void {
        this.instances.clear();
    }
}
