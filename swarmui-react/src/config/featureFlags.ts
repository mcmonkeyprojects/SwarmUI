export interface FrontendFeatureFlags {
  syncSessionV2: boolean;
  queueRunnerV2: boolean;
  historyLoaderV2: boolean;
  virtualizedBrowsersV2: boolean;
  devRenderProfiling: boolean;
  devPerformanceDashboard: boolean;
  generateUxRefresh: boolean;
  generateBootstrapRefreshMs: number;
  generateBootstrapCooldownMs: number;
  generateTriggerRefreshCacheMs: number;
  generateBackendHeartbeatMs: number;
  generateDeferredDataDelayMs: number;
}

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true;
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false;
  }
  return defaultValue;
}

function parseNumberEnv(
  value: string | undefined,
  defaultValue: number,
  { min = 0 }: { min?: number } = {}
): number {
  if (value === undefined) {
    return defaultValue;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }

  return Math.max(min, parsed);
}

export const featureFlags: FrontendFeatureFlags = {
  syncSessionV2: parseBooleanEnv(import.meta.env.VITE_SYNC_SESSION_V2 as string | undefined, true),
  queueRunnerV2: parseBooleanEnv(import.meta.env.VITE_QUEUE_RUNNER_V2 as string | undefined, true),
  historyLoaderV2: parseBooleanEnv(import.meta.env.VITE_HISTORY_LOADER_V2 as string | undefined, true),
  virtualizedBrowsersV2: parseBooleanEnv(
    import.meta.env.VITE_VIRTUALIZED_BROWSERS_V2 as string | undefined,
    true
  ),
  devRenderProfiling: parseBooleanEnv(
    import.meta.env.VITE_DEV_RENDER_PROFILING as string | undefined,
    true
  ),
  devPerformanceDashboard: parseBooleanEnv(
    import.meta.env.VITE_DEV_PERFORMANCE_DASHBOARD as string | undefined,
    true
  ),
  generateUxRefresh: parseBooleanEnv(
    import.meta.env.VITE_GENERATE_UX_REFRESH as string | undefined,
    true
  ),
  generateBootstrapRefreshMs: parseNumberEnv(
    import.meta.env.VITE_GENERATE_BOOTSTRAP_REFRESH_MS as string | undefined,
    0
  ),
  generateBootstrapCooldownMs: parseNumberEnv(
    import.meta.env.VITE_GENERATE_BOOTSTRAP_COOLDOWN_MS as string | undefined,
    15000
  ),
  generateTriggerRefreshCacheMs: parseNumberEnv(
    import.meta.env.VITE_GENERATE_TRIGGER_REFRESH_CACHE_MS as string | undefined,
    30000
  ),
  generateBackendHeartbeatMs: parseNumberEnv(
    import.meta.env.VITE_GENERATE_BACKEND_HEARTBEAT_MS as string | undefined,
    120000
  ),
  generateDeferredDataDelayMs: parseNumberEnv(
    import.meta.env.VITE_GENERATE_DEFERRED_DATA_DELAY_MS as string | undefined,
    0
  ),
};

type BooleanFeatureFlagKey = {
  [K in keyof FrontendFeatureFlags]: FrontendFeatureFlags[K] extends boolean ? K : never;
}[keyof FrontendFeatureFlags];

export function isFeatureEnabled(flag: BooleanFeatureFlagKey): boolean {
  return featureFlags[flag];
}

