/**
 * Performance Store
 * 
 * Zustand store for centralized performance metrics.
 * Integrates with performanceProfiler and memoryMonitor.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { profiler, type Metric, type MetricStats } from '../utils/performanceProfiler';
import { getMemoryUsage, takeSnapshot, type MemorySnapshot } from '../utils/memoryMonitor';

const isDev = import.meta.env.DEV;

const isRenderMetric = (metric: Metric): boolean => metric.name.startsWith('render:');

interface RenderMetric {
    component: string;
    renderCount: number;
    lastRenderTime: number;
    avgRenderTime: number;
    totalRenderTime: number;
}

interface PerformanceState {
    // Real-time metrics
    recentMetrics: Metric[];

    // Component render tracking
    renderMetrics: Map<string, RenderMetric>;

    // Memory snapshots
    memorySnapshots: Array<MemorySnapshot & { label?: string }>;
    currentMemory: {
        usedMB: number;
        totalMB: number;
        percentUsed: number;
    } | null;

    // Dashboard visibility
    isVisible: boolean;
    isMinimized: boolean;

    // Actions
    toggleVisible: () => void;
    toggleMinimized: () => void;
    recordRender: (component: string, duration: number) => void;
    takeMemorySnapshot: (label?: string) => void;
    refreshMemory: () => void;
    getStats: (name: string) => MetricStats | null;
    getAllStats: () => Record<string, MetricStats>;
    exportAll: () => string;
    clear: () => void;
}

export const usePerformanceStore = create<PerformanceState>()(
    devtools(
        (set, get) => {
            // Subscribe to profiler metrics in development
            if (isDev) {
                profiler.addListener((metric) => {
                    if (isRenderMetric(metric)) {
                        return;
                    }

                    set((state) => ({
                        recentMetrics: [...state.recentMetrics.slice(-99), metric],
                    }));
                });
            }

            return {
                recentMetrics: [],
                renderMetrics: new Map(),
                memorySnapshots: [],
                currentMemory: null,
                isVisible: false,
                isMinimized: false,

                toggleVisible: () => set((state) => ({ isVisible: !state.isVisible })),
                toggleMinimized: () => set((state) => ({ isMinimized: !state.isMinimized })),

                recordRender: (component, duration) => {
                    if (!isDev) return;

                    set((state) => {
                        if (!state.isVisible) {
                            return state;
                        }

                        const renderMetrics = new Map(state.renderMetrics);
                        const existing = renderMetrics.get(component);

                        if (existing) {
                            const newCount = existing.renderCount + 1;
                            const newTotal = existing.totalRenderTime + duration;
                            renderMetrics.set(component, {
                                component,
                                renderCount: newCount,
                                lastRenderTime: duration,
                                avgRenderTime: newTotal / newCount,
                                totalRenderTime: newTotal,
                            });
                        } else {
                            renderMetrics.set(component, {
                                component,
                                renderCount: 1,
                                lastRenderTime: duration,
                                avgRenderTime: duration,
                                totalRenderTime: duration,
                            });
                        }

                        return { renderMetrics };
                    });
                },

                takeMemorySnapshot: (label) => {
                    const snapshot = takeSnapshot(label);
                    if (snapshot) {
                        set((state) => ({
                            memorySnapshots: [...state.memorySnapshots.slice(-9), { ...snapshot, label }],
                        }));
                    }
                },

                refreshMemory: () => {
                    const memory = getMemoryUsage();
                    if (memory) {
                        set({
                            currentMemory: {
                                usedMB: memory.usedJSHeapSize / (1024 * 1024),
                                totalMB: memory.totalJSHeapSize / (1024 * 1024),
                                percentUsed: (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100,
                            },
                        });
                    }
                },

                getStats: (name) => profiler.getStats(name),
                getAllStats: () => profiler.getAllStats(),

                exportAll: () => {
                    const state = get();
                    return JSON.stringify({
                        timestamp: Date.now(),
                        profilerMetrics: profiler.getAllStats(),
                        recentMetrics: state.recentMetrics,
                        renderMetrics: Array.from(state.renderMetrics.values()),
                        memorySnapshots: state.memorySnapshots,
                        currentMemory: state.currentMemory,
                    }, null, 2);
                },

                clear: () => {
                    profiler.clearMetrics();
                    set({
                        recentMetrics: [],
                        renderMetrics: new Map(),
                        memorySnapshots: [],
                    });
                },
            };
        },
        { name: 'PerformanceStore', enabled: isDev }
    )
);

// Selector for checking if performance dashboard should render
export const usePerformanceDashboardVisible = () =>
    usePerformanceStore((state) => state.isVisible);

// Refresh memory periodically when dashboard is visible
if (isDev && typeof window !== 'undefined') {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    usePerformanceStore.subscribe((state, prevState) => {
        if (state.isVisible && !prevState.isVisible) {
            // Start refreshing memory when dashboard opens
            state.refreshMemory();
            intervalId = setInterval(() => {
                usePerformanceStore.getState().refreshMemory();
            }, 2000);
        } else if (!state.isVisible && prevState.isVisible) {
            // Stop refreshing when dashboard closes
            if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;
            }
        }
    });
}
