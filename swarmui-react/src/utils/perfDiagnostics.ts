type EndpointCounter = Record<string, number>;
type PerfDiagnosticsListener = (snapshot: PerfDiagnosticsSnapshot) => void;

export interface LongTaskTelemetry {
  name: string;
  duration: number;
  startTime: number;
  timestamp: number;
  route: string;
  visibilityState: DocumentVisibilityState | 'unknown';
  lastApiEndpoint: string | null;
  lastApiAgeMs: number | null;
  attribution: string[];
}

export interface PerfDiagnosticsSnapshot {
  startedAt: number;
  apiCallCount: number;
  wsReconnectCount: number;
  wsSessionRecoveries: number;
  longTaskCount: number;
  longestLongTaskMs: number;
  recentLongTasks: LongTaskTelemetry[];
  apiByEndpoint: EndpointCounter;
  reconnectByEndpoint: EndpointCounter;
}

const isDev = import.meta.env.DEV;
const MAX_RECENT_LONG_TASKS = 20;

const state: PerfDiagnosticsSnapshot = {
  startedAt: Date.now(),
  apiCallCount: 0,
  wsReconnectCount: 0,
  wsSessionRecoveries: 0,
  longTaskCount: 0,
  longestLongTaskMs: 0,
  recentLongTasks: [],
  apiByEndpoint: {},
  reconnectByEndpoint: {},
};

let longTaskObserverInitialized = false;
let lastApiEndpoint: string | null = null;
let lastApiTimestamp: number | null = null;
const listeners = new Set<PerfDiagnosticsListener>();

function emit(): void {
  if (!isDev) {
    return;
  }

  const snapshot = getPerfDiagnosticsSnapshot();
  listeners.forEach((listener) => listener(snapshot));
}

function incrementBucket(bucket: EndpointCounter, key: string): void {
  bucket[key] = (bucket[key] || 0) + 1;
}

function getCurrentRoute(): string {
  if (typeof window === 'undefined') {
    return 'unknown';
  }

  return `${window.location.pathname}${window.location.hash}`;
}

function extractLongTaskAttribution(entry: PerformanceEntry): string[] {
  const rawAttribution = (entry as PerformanceEntry & {
    attribution?: Array<{ name?: string; entryType?: string; containerType?: string }>;
  }).attribution;

  if (!Array.isArray(rawAttribution)) {
    return [];
  }

  return rawAttribution
    .map((item) => item.name || item.entryType || item.containerType || '')
    .filter(Boolean)
    .slice(0, 5);
}

function appendLongTask(entry: PerformanceEntry): void {
  const now = performance.now();
  const task: LongTaskTelemetry = {
    name: entry.name || 'longtask',
    duration: entry.duration,
    startTime: entry.startTime,
    timestamp: Date.now(),
    route: getCurrentRoute(),
    visibilityState: typeof document === 'undefined' ? 'unknown' : document.visibilityState,
    lastApiEndpoint,
    lastApiAgeMs: lastApiTimestamp === null ? null : Math.max(0, now - lastApiTimestamp),
    attribution: extractLongTaskAttribution(entry),
  };

  state.recentLongTasks = [...state.recentLongTasks, task].slice(-MAX_RECENT_LONG_TASKS);
}

function initLongTaskObserver(): void {
  if (!isDev || longTaskObserverInitialized || typeof window === 'undefined') {
    return;
  }

  if (!('PerformanceObserver' in window)) {
    longTaskObserverInitialized = true;
    return;
  }

  try {
    const observer = new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries()) {
        state.longTaskCount += 1;
        if (entry.duration > state.longestLongTaskMs) {
          state.longestLongTaskMs = entry.duration;
        }
        appendLongTask(entry);
        emit();
      }
    });
    observer.observe({ entryTypes: ['longtask'] });
  } catch {
    // longtask is not available in every runtime.
  } finally {
    longTaskObserverInitialized = true;
  }
}

export function recordApiCall(endpoint: string): void {
  if (!isDev) return;
  state.apiCallCount += 1;
  lastApiEndpoint = endpoint;
  lastApiTimestamp = performance.now();
  incrementBucket(state.apiByEndpoint, endpoint);
  emit();
}

export function recordWSReconnect(endpoint: string): void {
  if (!isDev) return;
  state.wsReconnectCount += 1;
  incrementBucket(state.reconnectByEndpoint, endpoint);
  emit();
}

export function recordWSSessionRecovery(): void {
  if (!isDev) return;
  state.wsSessionRecoveries += 1;
  emit();
}

export function subscribePerfDiagnostics(listener: PerfDiagnosticsListener): () => void {
  listeners.add(listener);
  listener(getPerfDiagnosticsSnapshot());
  return () => {
    listeners.delete(listener);
  };
}

export function getPerfDiagnosticsSnapshot(): PerfDiagnosticsSnapshot {
  if (isDev) {
    initLongTaskObserver();
  }
  return {
    ...state,
    recentLongTasks: [...state.recentLongTasks],
    apiByEndpoint: { ...state.apiByEndpoint },
    reconnectByEndpoint: { ...state.reconnectByEndpoint },
  };
}

export function resetPerfDiagnostics(): void {
  state.startedAt = Date.now();
  state.apiCallCount = 0;
  state.wsReconnectCount = 0;
  state.wsSessionRecoveries = 0;
  state.longTaskCount = 0;
  state.longestLongTaskMs = 0;
  state.recentLongTasks = [];
  state.apiByEndpoint = {};
  state.reconnectByEndpoint = {};
  emit();
}

if (isDev) {
  initLongTaskObserver();
}

