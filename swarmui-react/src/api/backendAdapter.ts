import { swarmClient } from './client';
import type {
  BackendBootstrapReason,
  BackendBootstrapSource,
  BackendBootstrapSnapshot,
  BackendCapabilitySnapshot,
  BackendSessionSnapshot,
  ConnectionHealthSnapshot,
  SessionResponse,
  SwarmEventEnvelope,
  UserDataResponse,
} from './types';
import type { WSEvent, WebSocketManager } from './ws';
import { featureFlags } from '../config/featureFlags';
import { usePerformanceSessionStore } from '../stores/performanceSessionStore';

type BackendAdapterListener = (event: SwarmEventEnvelope) => void;

interface BootstrapRequestOptions {
  force?: boolean;
  source?: BackendBootstrapSource;
  cooldownMs?: number;
}

function toSessionSnapshot(session: SessionResponse | null): BackendSessionSnapshot | null {
  if (!session) {
    return null;
  }

  return {
    sessionId: session.session_id,
    userId: session.user_id,
    permissions: session.permissions || [],
    version: session.version || null,
  };
}

function buildCapabilityMap(userData: UserDataResponse | null): Record<string, BackendCapabilitySnapshot> {
  const capabilityMap: Record<string, BackendCapabilitySnapshot> = {};
  const updatedAt = Date.now();

  if (userData) {
    capabilityMap.user_presets = {
      id: 'user_presets',
      name: 'User Presets',
      source: 'user-data',
      available: Array.isArray(userData.presets) && userData.presets.length > 0,
      values: Array.isArray(userData.presets) ? userData.presets.map((preset) => preset.title) : [],
      updatedAt,
      metadata: {
        count: Array.isArray(userData.presets) ? userData.presets.length : 0,
      },
    };
  }

  return capabilityMap;
}

class SwarmBackendAdapter {
  private listeners = new Set<BackendAdapterListener>();
  private wsManager: WebSocketManager | null = null;
  private wsUnsubscribers: Array<() => void> = [];
  private currentSession: BackendSessionSnapshot | null = null;
  private currentBootstrap: BackendBootstrapSnapshot | null = null;
  private currentHealth: ConnectionHealthSnapshot = {
    transport: 'rest',
    status: 'idle',
    connected: false,
    lastEventAt: null,
    lastBootstrapAt: null,
    lastReconnectAt: null,
    reconnectAttempts: 0,
    activeConnections: 0,
    lastError: null,
  };
  private bootstrapPromise: Promise<BackendBootstrapSnapshot> | null = null;

  subscribe(listener: BackendAdapterListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setSession(session: SessionResponse | null): void {
    this.currentSession = toSessionSnapshot(session);
    this.emit({
      type: session ? 'session:updated' : 'session:cleared',
      scope: 'session',
      endpoint: 'session',
      timestamp: Date.now(),
      revision: this.currentBootstrap?.refreshedAt ?? Date.now(),
      data: this.currentSession,
    });
  }

  attachWebSocketManager(manager: WebSocketManager): void {
    if (this.wsManager === manager) {
      return;
    }

    for (const unsubscribe of this.wsUnsubscribers) {
      unsubscribe();
    }
    this.wsUnsubscribers = [];
    this.wsManager = manager;

    const watch = (eventType: WSEvent['type'] | '*', handler: (event: WSEvent) => void) => {
      const unsubscribe = manager.on(eventType, handler);
      this.wsUnsubscribers.push(unsubscribe);
    };

    watch('*', (event) => {
      this.currentHealth = this.readConnectionHealth(event);
      this.emit({
        type: event.type,
        scope: 'websocket',
        endpoint: event.endpoint,
        timestamp: event.timestamp,
        revision: this.currentBootstrap?.refreshedAt ?? event.timestamp,
        data: event.data,
      });
    });

    watch('open', () => {
      if (!this.currentBootstrap) {
        void this.refreshCapabilities('startup', { source: 'websocket-open' });
      }
    });
    watch('reconnect', () => {
      void this.refreshCapabilities('reconnect', { source: 'websocket-reconnect' });
    });
    watch('session:recovered', () => {
      void this.refreshCapabilities('session-refresh', { source: 'websocket-session-recovered' });
    });
  }

  getConnectionHealth(): ConnectionHealthSnapshot {
    return { ...this.currentHealth };
  }

  getLatestBootstrap(): BackendBootstrapSnapshot | null {
    return this.currentBootstrap ? { ...this.currentBootstrap } : null;
  }

  getBootstrap(
    reason: BackendBootstrapReason = 'manual',
    options: BootstrapRequestOptions = {}
  ): Promise<BackendBootstrapSnapshot> {
    const source = options.source ?? 'unknown';
    const force = options.force ?? false;
    const cooldownMs = options.cooldownMs ?? featureFlags.generateBootstrapCooldownMs;

    if (this.bootstrapPromise) {
      usePerformanceSessionStore.getState().recordBootstrapEvent({
        action: 'inflight-reuse',
        reason,
        source,
        forced: force,
      });
      return this.bootstrapPromise;
    }

    const cachedBootstrap = this.getReusableBootstrap(reason, source, force, cooldownMs);
    if (cachedBootstrap) {
      return Promise.resolve(cachedBootstrap);
    }

    this.bootstrapPromise = this.loadBootstrap(reason, source, force).finally(() => {
      this.bootstrapPromise = null;
    });
    return this.bootstrapPromise;
  }

  refreshCapabilities(
    reason: BackendBootstrapReason = 'capability-refresh',
    options: BootstrapRequestOptions = {}
  ): Promise<BackendBootstrapSnapshot> {
    return this.getBootstrap(reason, options);
  }

  private getReusableBootstrap(
    reason: BackendBootstrapReason,
    source: BackendBootstrapSource,
    force: boolean,
    cooldownMs: number
  ): BackendBootstrapSnapshot | null {
    if (force || !this.currentBootstrap || cooldownMs <= 0) {
      return null;
    }

    const cacheAgeMs = Date.now() - this.currentBootstrap.refreshedAt;
    if (cacheAgeMs > cooldownMs) {
      return null;
    }

    usePerformanceSessionStore.getState().recordBootstrapEvent({
      action: 'skip',
      reason,
      source,
      forced: force,
      cacheAgeMs,
    });

    return {
      ...this.currentBootstrap,
      refreshSource: source,
      servedFromCache: true,
      cacheAgeMs,
    };
  }

  private async loadBootstrap(
    reason: BackendBootstrapReason,
    source: BackendBootstrapSource,
    force: boolean
  ): Promise<BackendBootstrapSnapshot> {
    const startedAt = performance.now();
    const runtime = swarmClient.getRuntimeEndpoints();
    const errors: string[] = [];
    const [modelsResult, vaesResult, backendsResult, userDataResult, statusResult] = await Promise.allSettled([
      swarmClient.listModels('', 'Stable-Diffusion'),
      swarmClient.listVAEs(),
      swarmClient.listBackends({ fullData: true }),
      swarmClient.getMyUserData() as Promise<UserDataResponse>,
      swarmClient.getCurrentStatus(),
    ]);

    const modelCatalog = {
      'Stable-Diffusion': modelsResult.status === 'fulfilled' ? modelsResult.value : [],
      VAE: vaesResult.status === 'fulfilled' ? vaesResult.value : [],
    };
    if (modelsResult.status === 'rejected') {
      errors.push(`ListModels: ${String(modelsResult.reason)}`);
    }
    if (vaesResult.status === 'rejected') {
      errors.push(`ListVAEs: ${String(vaesResult.reason)}`);
    }

    const backendStatus = backendsResult.status === 'fulfilled' ? backendsResult.value : [];
    if (backendsResult.status === 'rejected') {
      errors.push(`ListBackends: ${String(backendsResult.reason)}`);
    }

    const userData = userDataResult.status === 'fulfilled' ? userDataResult.value : null;
    if (userDataResult.status === 'rejected') {
      errors.push(`GetMyUserData: ${String(userDataResult.reason)}`);
    }

    const serverVersion = this.currentSession?.version
      || (statusResult.status === 'fulfilled' && statusResult.value && typeof statusResult.value === 'object' && 'version' in statusResult.value
        ? String((statusResult.value as Record<string, unknown>).version ?? '')
        : '')
      || null;

    const snapshot: BackendBootstrapSnapshot = {
      refreshedAt: Date.now(),
      refreshReason: reason,
      refreshSource: source,
      servedFromCache: false,
      cacheAgeMs: 0,
      session: this.currentSession,
      serverVersion,
      transport: {
        apiBaseUrl: runtime.apiBaseUrl,
        wsBaseUrl: runtime.wsBaseUrl,
        mode: runtime.mode,
      },
      connectionHealth: this.getConnectionHealth(),
      capabilityMap: buildCapabilityMap(userData),
      modelCatalog,
      samplerCatalog: [],
      extensionCatalog: backendStatus,
      backendStatus,
      t2iParams: null,
      userData,
      errors,
    };

    usePerformanceSessionStore.getState().recordBootstrapEvent({
      action: 'refresh',
      reason,
      source,
      forced: force,
      duration: performance.now() - startedAt,
      errorCount: errors.length,
    });

    this.currentBootstrap = snapshot;
    this.currentHealth = {
      ...this.currentHealth,
      transport: this.wsManager ? 'websocket' : 'rest',
      lastBootstrapAt: snapshot.refreshedAt,
    };

    this.emit({
      type: 'bootstrap:refreshed',
      scope: 'bootstrap',
      endpoint: 'bootstrap',
      timestamp: snapshot.refreshedAt,
      revision: snapshot.refreshedAt,
      data: snapshot,
    });

    return snapshot;
  }

  private readConnectionHealth(event?: WSEvent): ConnectionHealthSnapshot {
    const states = this.wsManager?.getAllConnectionStates();
    const values = states ? Array.from(states.values()) : [];
    const activeConnections = values.filter((state) => state.status !== 'disconnected').length;
    const connected = values.some((state) => state.status === 'connected');
    const reconnectAttempts = values.reduce((max, state) => Math.max(max, state.reconnectAttempts), 0);
    const hasError = values.some((state) => state.status === 'error');
    const hasReconnect = values.some((state) => state.status === 'reconnecting');
    const hasDegraded = values.some((state) => state.missedPongs > 0);
    const lastErrorState = [...values].reverse().find((state) => state.lastError);

    return {
      transport: this.wsManager ? 'websocket' : 'rest',
      status: hasError
        ? 'error'
        : hasReconnect
          ? 'reconnecting'
          : connected
            ? hasDegraded ? 'degraded' : 'connected'
            : activeConnections > 0 ? 'offline' : 'idle',
      connected,
      lastEventAt: event?.timestamp ?? this.currentHealth.lastEventAt,
      lastBootstrapAt: this.currentBootstrap?.refreshedAt ?? this.currentHealth.lastBootstrapAt,
      lastReconnectAt: event?.type === 'reconnect' ? event.timestamp : this.currentHealth.lastReconnectAt,
      reconnectAttempts,
      activeConnections,
      lastError: event?.type === 'error'
        ? String((event.data as { error?: string } | undefined)?.error ?? 'WebSocket error')
        : lastErrorState?.lastError ?? this.currentHealth.lastError,
    };
  }

  private emit(event: SwarmEventEnvelope): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('[SwarmBackendAdapter] Listener failed', error);
      }
    }
  }
}

export const swarmBackendAdapter = new SwarmBackendAdapter();
