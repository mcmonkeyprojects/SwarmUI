import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { queryClient } from '../api/queryClient';
import {
  getPerfDiagnosticsSnapshot,
  subscribePerfDiagnostics,
  type LongTaskTelemetry,
  type PerfDiagnosticsSnapshot,
} from '../utils/perfDiagnostics';
import { profiler, type Metric } from '../utils/performanceProfiler';

const isDev = import.meta.env.DEV;
const SESSION_STORE_INIT_KEY = '__swarmui_performance_session_store_initialized__';
const SESSION_STORE_PERSIST_KEY = '__swarmui_performance_session_store_persist_initialized__';
const MAX_RECENT_EVENTS = 250;
const MAX_ROUTE_ENTRIES = 24;
const MAX_QUERY_ENTRIES = 50;
const MAX_HOTSPOTS = 15;

export interface SessionTelemetryEvent {
  id: string;
  type: 'metric' | 'route' | 'query' | 'event-loop' | 'session';
  name: string;
  timestamp: number;
  duration?: number;
  severity: 'info' | 'warning' | 'bad';
  metadata?: Record<string, unknown>;
}

export interface SessionMetricAggregate {
  name: string;
  count: number;
  total: number;
  max: number;
  avg: number;
  lastDuration: number;
  lastTimestamp: number;
  slowCount: number;
}

export interface SessionRouteAggregate {
  route: string;
  count: number;
  total: number;
  max: number;
  avg: number;
  lastDuration: number;
  lastVisitedAt: number;
}

export interface SessionQueryAggregate {
  key: string;
  count: number;
  total: number;
  max: number;
  avg: number;
  lastDuration: number;
  lastStatus: 'success' | 'error';
  lastUpdatedAt: number;
}

export interface EventLoopLagSummary {
  sampleCount: number;
  maxLagMs: number;
  avgLagMs: number;
  lastLagMs: number;
  overBudgetCount: number;
}

export interface BootstrapRefreshSummary {
  refreshCount: number;
  skippedCount: number;
  inflightReuseCount: number;
  forcedCount: number;
  byReason: Record<string, number>;
  bySource: Record<string, number>;
  lastRefreshAt: number | null;
  lastSkipAt: number | null;
}

export interface SessionTimingAggregate {
  name: string;
  count: number;
  total: number;
  max: number;
  avg: number;
  lastDuration: number;
  lastUpdatedAt: number;
}

export interface SessionPerformanceSummary {
  hotspots: SessionMetricAggregate[];
  slowRoutes: SessionRouteAggregate[];
  noisyQueries: SessionQueryAggregate[];
  longTasks: LongTaskTelemetry[];
  recentFlags: SessionTelemetryEvent[];
  bootstrap: BootstrapRefreshSummary;
  timings: SessionTimingAggregate[];
}

export interface PerformanceSessionPayload {
  sessionStartedAt: number;
  sessionBootstrappedAt: number | null;
  currentRoute: string;
  diagnostics: PerfDiagnosticsSnapshot;
  eventLoop: EventLoopLagSummary;
  bootstrap: BootstrapRefreshSummary;
  timingStats: Record<string, SessionTimingAggregate>;
  metricsByName: Record<string, SessionMetricAggregate>;
  routeStats: Record<string, SessionRouteAggregate>;
  queryStats: Record<string, SessionQueryAggregate>;
  hotspots: SessionMetricAggregate[];
  recentEvents: SessionTelemetryEvent[];
  summary: SessionPerformanceSummary;
  exportedAt: number;
}

interface NavigationTiming {
  route: string;
  startedAt: number;
}

interface PerformanceSessionState {
  sessionStartedAt: number;
  sessionBootstrappedAt: number | null;
  currentRoute: string;
  lastNavigation: NavigationTiming | null;
  diagnostics: PerfDiagnosticsSnapshot;
  metricsByName: Record<string, SessionMetricAggregate>;
  routeStats: Record<string, SessionRouteAggregate>;
  queryStats: Record<string, SessionQueryAggregate>;
  eventLoop: EventLoopLagSummary;
  bootstrap: BootstrapRefreshSummary;
  timingStats: Record<string, SessionTimingAggregate>;
  recentEvents: SessionTelemetryEvent[];
  startNavigation: (route: string) => void;
  completeNavigation: (route: string, duration: number) => void;
  markSessionBootstrapped: (duration: number) => void;
  recordMetric: (metric: Metric) => void;
  recordQuery: (key: string, duration: number, status: 'success' | 'error') => void;
  recordEventLoopLag: (lagMs: number) => void;
  recordTiming: (
    name: string,
    duration: number,
    metadata?: Record<string, unknown>,
    severity?: SessionTelemetryEvent['severity']
  ) => void;
  recordSessionEvent: (
    name: string,
    severity?: SessionTelemetryEvent['severity'],
    metadata?: Record<string, unknown>,
    duration?: number
  ) => void;
  recordBootstrapEvent: (
    event: {
      action: 'refresh' | 'skip' | 'inflight-reuse';
      reason: string;
      source: string;
      forced?: boolean;
      duration?: number;
      cacheAgeMs?: number;
      errorCount?: number;
    }
  ) => void;
  replaceDiagnostics: (snapshot: PerfDiagnosticsSnapshot) => void;
  exportSession: () => string;
  clearSession: () => void;
}

function createEvent(
  type: SessionTelemetryEvent['type'],
  name: string,
  severity: SessionTelemetryEvent['severity'],
  duration?: number,
  metadata?: Record<string, unknown>
): SessionTelemetryEvent {
  return {
    id: `${type}-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    name,
    severity,
    duration,
    timestamp: Date.now(),
    metadata,
  };
}

function appendEvent(
  events: SessionTelemetryEvent[],
  next: SessionTelemetryEvent
): SessionTelemetryEvent[] {
  const appended = [...events, next];
  if (appended.length <= MAX_RECENT_EVENTS) {
    return appended;
  }
  return appended.slice(-MAX_RECENT_EVENTS);
}

function updateMetricAggregate(
  current: SessionMetricAggregate | undefined,
  metric: Metric
): SessionMetricAggregate {
  const count = (current?.count ?? 0) + 1;
  const total = (current?.total ?? 0) + metric.duration;
  const max = Math.max(current?.max ?? 0, metric.duration);
  const slowCount = (current?.slowCount ?? 0) + (metric.duration >= 100 ? 1 : 0);

  return {
    name: metric.name,
    count,
    total,
    max,
    avg: total / count,
    lastDuration: metric.duration,
    lastTimestamp: metric.timestamp,
    slowCount,
  };
}

function updateRouteAggregate(
  current: SessionRouteAggregate | undefined,
  route: string,
  duration: number
): SessionRouteAggregate {
  const count = (current?.count ?? 0) + 1;
  const total = (current?.total ?? 0) + duration;
  const max = Math.max(current?.max ?? 0, duration);

  return {
    route,
    count,
    total,
    max,
    avg: total / count,
    lastDuration: duration,
    lastVisitedAt: Date.now(),
  };
}

function updateQueryAggregate(
  current: SessionQueryAggregate | undefined,
  key: string,
  duration: number,
  status: 'success' | 'error'
): SessionQueryAggregate {
  const count = (current?.count ?? 0) + 1;
  const total = (current?.total ?? 0) + duration;
  const max = Math.max(current?.max ?? 0, duration);

  return {
    key,
    count,
    total,
    max,
    avg: total / count,
    lastDuration: duration,
    lastStatus: status,
    lastUpdatedAt: Date.now(),
  };
}

function updateTimingAggregate(
  current: SessionTimingAggregate | undefined,
  name: string,
  duration: number
): SessionTimingAggregate {
  const count = (current?.count ?? 0) + 1;
  const total = (current?.total ?? 0) + duration;
  const max = Math.max(current?.max ?? 0, duration);

  return {
    name,
    count,
    total,
    max,
    avg: total / count,
    lastDuration: duration,
    lastUpdatedAt: Date.now(),
  };
}

function trimRecord<T extends { lastUpdatedAt?: number; lastVisitedAt?: number }>(
  record: Record<string, T>,
  maxEntries: number
): Record<string, T> {
  const entries = Object.entries(record);
  if (entries.length <= maxEntries) {
    return record;
  }

  const sorted = entries.sort(([, left], [, right]) => {
    const leftTimestamp = left.lastUpdatedAt ?? left.lastVisitedAt ?? 0;
    const rightTimestamp = right.lastUpdatedAt ?? right.lastVisitedAt ?? 0;
    return rightTimestamp - leftTimestamp;
  });

  return Object.fromEntries(sorted.slice(0, maxEntries));
}

function buildHotspots(state: Pick<PerformanceSessionState, 'metricsByName'>): SessionMetricAggregate[] {
  return Object.values(state.metricsByName)
    .sort((left, right) => {
      if (right.total !== left.total) {
        return right.total - left.total;
      }
      return right.max - left.max;
    })
    .slice(0, MAX_HOTSPOTS);
}

function buildSessionSummary(
  state: Pick<PerformanceSessionState, 'metricsByName' | 'routeStats' | 'queryStats' | 'recentEvents' | 'bootstrap' | 'timingStats' | 'diagnostics'>
): SessionPerformanceSummary {
  return {
    hotspots: buildHotspots(state),
    slowRoutes: Object.values(state.routeStats)
      .sort((left, right) => right.max - left.max)
      .slice(0, 5),
    noisyQueries: Object.values(state.queryStats)
      .sort((left, right) => {
        if (right.max !== left.max) {
          return right.max - left.max;
        }
        return right.count - left.count;
      })
      .slice(0, 5),
    longTasks: [...state.diagnostics.recentLongTasks]
      .sort((left, right) => right.duration - left.duration)
      .slice(0, 5),
    recentFlags: state.recentEvents
      .filter((event) => event.severity !== 'info')
      .slice(-10)
      .reverse(),
    bootstrap: state.bootstrap,
    timings: Object.values(state.timingStats)
      .sort((left, right) => {
        if (right.max !== left.max) {
          return right.max - left.max;
        }
        return right.avg - left.avg;
      })
      .slice(0, 10),
  };
}

function buildSessionPayload(state: PerformanceSessionState): PerformanceSessionPayload {
  const hotspots = buildHotspots(state);
  return {
    sessionStartedAt: state.sessionStartedAt,
    sessionBootstrappedAt: state.sessionBootstrappedAt,
    currentRoute: state.currentRoute,
    diagnostics: state.diagnostics,
    eventLoop: state.eventLoop,
    bootstrap: state.bootstrap,
    timingStats: state.timingStats,
    metricsByName: state.metricsByName,
    routeStats: state.routeStats,
    queryStats: state.queryStats,
    hotspots,
    recentEvents: state.recentEvents,
    summary: buildSessionSummary(state),
    exportedAt: Date.now(),
  };
}

function shouldCollectRuntimeSessionTelemetry(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return isDev || !!window.electronAPI?.writePerformanceMetrics || !!window.electronAPI?.readPerformanceMetrics;
}

function createInitialState(): Omit<
  PerformanceSessionState,
  | 'startNavigation'
  | 'completeNavigation'
  | 'markSessionBootstrapped'
  | 'recordMetric'
  | 'recordQuery'
  | 'recordEventLoopLag'
  | 'recordTiming'
  | 'recordSessionEvent'
  | 'recordBootstrapEvent'
  | 'replaceDiagnostics'
  | 'exportSession'
  | 'clearSession'
> {
  return {
    sessionStartedAt: Date.now(),
    sessionBootstrappedAt: null,
    currentRoute: 'generate',
    lastNavigation: null,
    diagnostics: getPerfDiagnosticsSnapshot(),
    metricsByName: {},
    routeStats: {},
    queryStats: {},
    eventLoop: {
      sampleCount: 0,
      maxLagMs: 0,
      avgLagMs: 0,
      lastLagMs: 0,
      overBudgetCount: 0,
    },
    bootstrap: {
      refreshCount: 0,
      skippedCount: 0,
      inflightReuseCount: 0,
      forcedCount: 0,
      byReason: {},
      bySource: {},
      lastRefreshAt: null,
      lastSkipAt: null,
    },
    timingStats: {},
    recentEvents: [],
  };
}

export const usePerformanceSessionStore = create<PerformanceSessionState>()(
  devtools(
    (set, get) => ({
      ...createInitialState(),

      startNavigation: (route) =>
        set({
          currentRoute: route,
          lastNavigation: {
            route,
            startedAt: performance.now(),
          },
        }),

      completeNavigation: (route, duration) =>
        set((state) => {
          const routeStats = {
            ...state.routeStats,
            [route]: updateRouteAggregate(state.routeStats[route], route, duration),
          };

          return {
            currentRoute: route,
            lastNavigation: null,
            routeStats: trimRecord(routeStats, MAX_ROUTE_ENTRIES),
            recentEvents: appendEvent(
              state.recentEvents,
              createEvent(
                'route',
                route,
                duration > 700 ? 'bad' : duration > 250 ? 'warning' : 'info',
                duration
              )
            ),
          };
        }),

      markSessionBootstrapped: (duration) =>
        set((state) => ({
          sessionBootstrappedAt: Date.now(),
          recentEvents: appendEvent(
            state.recentEvents,
            createEvent(
              'session',
              'bootstrap',
              duration > 1500 ? 'bad' : duration > 750 ? 'warning' : 'info',
              duration
            )
          ),
        })),

      recordMetric: (metric) =>
        set((state) => {
          const metricsByName = {
            ...state.metricsByName,
            [metric.name]: updateMetricAggregate(state.metricsByName[metric.name], metric),
          };

          return {
            metricsByName,
            recentEvents: metric.duration >= 50
              ? appendEvent(
                  state.recentEvents,
                  createEvent(
                    'metric',
                    metric.name,
                    metric.duration >= 250 ? 'bad' : 'warning',
                    metric.duration,
                    metric.metadata
                  )
                )
              : state.recentEvents,
          };
        }),

      recordQuery: (key, duration, status) =>
        set((state) => {
          const queryStats = {
            ...state.queryStats,
            [key]: updateQueryAggregate(state.queryStats[key], key, duration, status),
          };

          return {
            queryStats: trimRecord(queryStats, MAX_QUERY_ENTRIES),
            recentEvents: appendEvent(
              state.recentEvents,
              createEvent(
                'query',
                key,
                status === 'error' || duration > 1200 ? 'bad' : duration > 400 ? 'warning' : 'info',
                duration,
                { status }
              )
            ),
          };
        }),

      recordEventLoopLag: (lagMs) =>
        set((state) => {
          const sampleCount = state.eventLoop.sampleCount + 1;
          const avgLagMs = ((state.eventLoop.avgLagMs * state.eventLoop.sampleCount) + lagMs) / sampleCount;

          return {
            eventLoop: {
              sampleCount,
              maxLagMs: Math.max(state.eventLoop.maxLagMs, lagMs),
              avgLagMs,
              lastLagMs: lagMs,
              overBudgetCount: state.eventLoop.overBudgetCount + (lagMs > 100 ? 1 : 0),
            },
            recentEvents: lagMs > 50
              ? appendEvent(
                  state.recentEvents,
                  createEvent(
                    'event-loop',
                    'event-loop-lag',
                    lagMs > 150 ? 'bad' : 'warning',
                    lagMs
                  )
                )
              : state.recentEvents,
          };
        }),

      recordTiming: (name, duration, metadata, severity) =>
        set((state) => {
          const timingStats = {
            ...state.timingStats,
            [name]: updateTimingAggregate(state.timingStats[name], name, duration),
          };
          const resolvedSeverity = severity
            ?? (duration > 1500 ? 'bad' : duration > 500 ? 'warning' : 'info');

          return {
            timingStats,
            recentEvents: appendEvent(
              state.recentEvents,
              createEvent(
                'session',
                name,
                resolvedSeverity,
                duration,
                metadata
              )
            ),
          };
        }),

      recordSessionEvent: (name, severity = 'info', metadata, duration) =>
        set((state) => ({
          recentEvents: appendEvent(
            state.recentEvents,
            createEvent(
              'session',
              name,
              severity,
              duration,
              metadata
            )
          ),
        })),

      recordBootstrapEvent: (event) =>
        set((state) => {
          const byReason = {
            ...state.bootstrap.byReason,
            [event.reason]: (state.bootstrap.byReason[event.reason] ?? 0) + 1,
          };
          const bySource = {
            ...state.bootstrap.bySource,
            [event.source]: (state.bootstrap.bySource[event.source] ?? 0) + 1,
          };
          const bootstrap: BootstrapRefreshSummary = {
            ...state.bootstrap,
            byReason,
            bySource,
            refreshCount: state.bootstrap.refreshCount + (event.action === 'refresh' ? 1 : 0),
            skippedCount: state.bootstrap.skippedCount + (event.action === 'skip' ? 1 : 0),
            inflightReuseCount: state.bootstrap.inflightReuseCount + (event.action === 'inflight-reuse' ? 1 : 0),
            forcedCount: state.bootstrap.forcedCount + (event.forced ? 1 : 0),
            lastRefreshAt: event.action === 'refresh' ? Date.now() : state.bootstrap.lastRefreshAt,
            lastSkipAt: event.action === 'skip' ? Date.now() : state.bootstrap.lastSkipAt,
          };
          const severity: SessionTelemetryEvent['severity'] = event.action === 'skip'
            ? 'info'
            : (event.errorCount ?? 0) > 0 || (event.duration ?? 0) > 1200
              ? 'bad'
              : (event.duration ?? 0) > 400
                ? 'warning'
                : 'info';

          return {
            bootstrap,
            recentEvents: appendEvent(
              state.recentEvents,
              createEvent(
                'session',
                `bootstrap:${event.action}`,
                severity,
                event.duration,
                {
                  reason: event.reason,
                  source: event.source,
                  forced: !!event.forced,
                  cacheAgeMs: event.cacheAgeMs ?? 0,
                  errorCount: event.errorCount ?? 0,
                }
              )
            ),
          };
        }),

      replaceDiagnostics: (snapshot) =>
        set({
          diagnostics: snapshot,
        }),

      exportSession: () => {
        const state = get();
        return JSON.stringify(buildSessionPayload(state), null, 2);
      },

      clearSession: () =>
        set({
          ...createInitialState(),
        }),
    }),
    { name: 'PerformanceSessionStore', enabled: isDev }
  )
);

if (
  shouldCollectRuntimeSessionTelemetry()
  && !(globalThis as Record<string, unknown>)[SESSION_STORE_INIT_KEY]
) {
  (globalThis as Record<string, unknown>)[SESSION_STORE_INIT_KEY] = true;

  profiler.addListener((metric) => {
    usePerformanceSessionStore.getState().recordMetric(metric);
  });

  subscribePerfDiagnostics((snapshot) => {
    usePerformanceSessionStore.getState().replaceDiagnostics(snapshot);
  });

  const inflightQueries = new Map<string, number>();

  queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || !event.query) {
      return;
    }

    const query = event.query;
    const state = query.state;
    const key = JSON.stringify(query.queryKey);

    if (state.fetchStatus === 'fetching') {
      if (!inflightQueries.has(query.queryHash)) {
        inflightQueries.set(query.queryHash, performance.now());
      }
      return;
    }

    const startedAt = inflightQueries.get(query.queryHash);
    if (startedAt === undefined) {
      return;
    }

    inflightQueries.delete(query.queryHash);
    const duration = performance.now() - startedAt;
    const status = state.status === 'error' ? 'error' : 'success';
    usePerformanceSessionStore.getState().recordQuery(key, duration, status);
  });
}

if (
  typeof window !== 'undefined'
  && !(globalThis as Record<string, unknown>)[SESSION_STORE_PERSIST_KEY]
) {
  (globalThis as Record<string, unknown>)[SESSION_STORE_PERSIST_KEY] = true;

  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  let persistPathLogged = false;

  const persistNow = async () => {
    const electronAPI = window.electronAPI;
    if (!electronAPI?.writePerformanceMetrics) {
      return;
    }

    try {
      const payload = usePerformanceSessionStore.getState().exportSession();
      const result = await electronAPI.writePerformanceMetrics?.(payload);
      if (!persistPathLogged && result?.success && result.path) {
        persistPathLogged = true;
        console.debug('[Perf] Session metrics snapshot path:', result.path);
      }
    } catch (error) {
      console.error('[Perf] Failed to persist session metrics snapshot:', error);
    }
  };

  const schedulePersist = () => {
    const electronAPI = window.electronAPI;
    if (!electronAPI?.writePerformanceMetrics) {
      return;
    }

    if (persistTimer) {
      clearTimeout(persistTimer);
    }

    persistTimer = setTimeout(async () => {
      persistTimer = null;
      await persistNow();
    }, 1500);
  };

  usePerformanceSessionStore.subscribe(() => {
    schedulePersist();
  });

  const flushPersist = () => {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    void persistNow();
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      flushPersist();
    }
  };

  window.addEventListener('beforeunload', flushPersist);
  window.addEventListener('pagehide', flushPersist);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  if (window.electronAPI?.writePerformanceMetrics) {
    void persistNow();

    window.addEventListener('unload', () => {
      const electronAPI = window.electronAPI;
      if (!electronAPI?.writePerformanceMetrics) {
        return;
      }
      void electronAPI.writePerformanceMetrics(usePerformanceSessionStore.getState().exportSession());
    });
  }
}
