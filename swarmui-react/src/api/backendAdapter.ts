import { swarmClient } from './client';
import type {
  BackendBootstrapReason,
  BackendBootstrapSnapshot,
  BackendCapabilitySnapshot,
  BackendSessionSnapshot,
  ConnectionHealthSnapshot,
  SessionResponse,
  SwarmEventEnvelope,
  T2IParam,
  T2IParamsResponse,
  UserDataResponse,
} from './types';
import type { WSEvent, WebSocketManager } from './ws';

type BackendAdapterListener = (event: SwarmEventEnvelope) => void;

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

function readParamValues(param: T2IParam): string[] {
  if (!Array.isArray(param.values)) {
    return [];
  }

  const values: string[] = [];
  for (const value of param.values as unknown[]) {
    if (typeof value === 'string') {
      values.push(value);
      continue;
    }
    if (value && typeof value === 'object' && 'name' in value && typeof value.name === 'string') {
      values.push(value.name);
    }
  }
  return values;
}

function buildCapabilityMap(t2iParams: T2IParamsResponse | null, userData: UserDataResponse | null): Record<string, BackendCapabilitySnapshot> {
  const capabilityMap: Record<string, BackendCapabilitySnapshot> = {};
  const updatedAt = Date.now();

  for (const param of t2iParams?.list || []) {
    capabilityMap[param.id] = {
      id: param.id,
      name: param.name || param.id,
      source: 't2i-param',
      available: true,
      type: param.type ?? null,
      subtype: param.subtype ?? null,
      values: readParamValues(param),
      defaultValue: (param as T2IParam & { default?: string | number | boolean | null }).default ?? null,
      toggleable: param.toggleable ?? false,
      advanced: param.advanced ?? false,
      priority: typeof param.priority === 'number' ? param.priority : undefined,
      featureFlag: null,
      updatedAt,
      metadata: {
        group: param.group ?? null,
        viewType: param.view_type ?? null,
      },
    };
  }

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
        void this.refreshCapabilities('startup');
      }
    });
    watch('reconnect', () => {
      void this.refreshCapabilities('reconnect');
    });
    watch('session:recovered', () => {
      void this.refreshCapabilities('session-refresh');
    });
  }

  getConnectionHealth(): ConnectionHealthSnapshot {
    return { ...this.currentHealth };
  }

  getLatestBootstrap(): BackendBootstrapSnapshot | null {
    return this.currentBootstrap ? { ...this.currentBootstrap } : null;
  }

  getBootstrap(reason: BackendBootstrapReason = 'manual'): Promise<BackendBootstrapSnapshot> {
    if (this.bootstrapPromise) {
      return this.bootstrapPromise;
    }

    this.bootstrapPromise = this.loadBootstrap(reason).finally(() => {
      this.bootstrapPromise = null;
    });
    return this.bootstrapPromise;
  }

  refreshCapabilities(reason: BackendBootstrapReason = 'capability-refresh'): Promise<BackendBootstrapSnapshot> {
    return this.getBootstrap(reason);
  }

  private async loadBootstrap(reason: BackendBootstrapReason): Promise<BackendBootstrapSnapshot> {
    const runtime = swarmClient.getRuntimeEndpoints();
    const errors: string[] = [];
    const [t2iParamsResult, modelsResult, vaesResult, backendsResult, userDataResult, statusResult] = await Promise.allSettled([
      swarmClient.listT2IParams(),
      swarmClient.listModels('', 'Stable-Diffusion'),
      swarmClient.listVAEs(),
      swarmClient.listBackends({ fullData: true }),
      swarmClient.getMyUserData() as Promise<UserDataResponse>,
      swarmClient.getCurrentStatus(),
    ]);

    const t2iParams = t2iParamsResult.status === 'fulfilled' ? t2iParamsResult.value : null;
    if (t2iParamsResult.status === 'rejected') {
      errors.push(`ListT2IParams: ${String(t2iParamsResult.reason)}`);
    }

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

    const samplerCatalog = (() => {
      const samplerParam = t2iParams?.list?.find((param) => param.id === 'sampler' || param.id === 'scheduler');
      return samplerParam ? readParamValues(samplerParam) : [];
    })();

    const serverVersion = this.currentSession?.version
      || (statusResult.status === 'fulfilled' && statusResult.value && typeof statusResult.value === 'object' && 'version' in statusResult.value
        ? String((statusResult.value as Record<string, unknown>).version ?? '')
        : '')
      || null;

    const snapshot: BackendBootstrapSnapshot = {
      refreshedAt: Date.now(),
      refreshReason: reason,
      session: this.currentSession,
      serverVersion,
      transport: {
        apiBaseUrl: runtime.apiBaseUrl,
        wsBaseUrl: runtime.wsBaseUrl,
        mode: runtime.mode,
      },
      connectionHealth: this.getConnectionHealth(),
      capabilityMap: buildCapabilityMap(t2iParams, userData),
      modelCatalog,
      samplerCatalog,
      extensionCatalog: backendStatus,
      backendStatus,
      t2iParams,
      userData,
      errors,
    };

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
