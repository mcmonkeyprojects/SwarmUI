import type {
  SessionResponse,
  APIError,
  GenerateParams,
  WebSocketMessage,
  Model,
  VAEModel,
  BackendStatus,
  ImageListItem,
  HistoryImageItem,
  HistoryMediaType,
  HistorySortBy,
  ImageFolderResponse,
  HistoryFolderResponseV2,
  ListImagesV2Params,
  ExportHistoryZipParams,
  ExportHistoryZipResponse,
  ComfyWorkflowInfo,
  ComfyWorkflowData,
  T2IParamsResponse,
  BackendPreset,
  UserDataResponse,
  ModelDescription,
  BackendType,
  BackendDetail,
  LogType,
  LogMessage,
  ServerResourceInfo,
  RepoUpdateStatus,
  UpdateCheckResponse,
  UpdateAndRestartResponse,
  KohyaDatasetInfo,
  KohyaStatusResponse,
  KohyaTrainedLoraInfo,
  KohyaTrainingTemplate,
  LoraProjectSummary,
  LoraProject,
  LoraBatchPlanJob,
  LoraBatchManifestSummary,
  LoraDatasetItem,
  LoraBatchExecutionStatus,
  LoraTrainableProject,
  LoraTrainingJob,
  LoraTrainingStatus,
} from './types';
import { requestDeduplicator } from './requestDeduplicator';
import { profiler } from '../utils/performanceProfiler';
import {
  resolveApiUrl,
  resolveRuntimeEndpoints,
  type RuntimeEndpoints,
} from '../config/runtimeEndpoints';
import { recordApiCall } from '../utils/perfDiagnostics';
import { featureFlags } from '../config/featureFlags';

const ENABLE_VERBOSE_LOGS = import.meta.env.DEV;

export type SessionChangeReason = 'init' | 'refresh' | 'auth' | 'logout';
export type SessionChangedListener = (
  session: Pick<SessionResponse, 'session_id' | 'user_id' | 'permissions'> | null,
  reason: SessionChangeReason
) => void;

// Endpoints that should be deduplicated (read-only list operations)
const DEDUP_ENDPOINTS = [
  'ListModels',
  'ListT2IParams',
  'GetCurrentStatus',
  'ListWildcardFiles',
  'ListLoRAs',
  'ListVAEs',
  'ListControlNets',
  'ListImages',
  'ListImagesV2',
  'TriggerRefresh', // Heavy endpoint - called by listVAEs, listControlNets, etc.
  'ListBackends', // Backend status - called frequently
];

function isUnknownRouteError(error: APIError | null | undefined): boolean {
  const message = `${error?.error || ''} ${error?.error_id || ''}`.toLowerCase();
  return error?.error_id === 'bad_route' || message.includes('unknown api route');
}

function normalizeHistoryPath(path: string = ''): string {
  return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim();
}

function normalizeHistoryDepth(depth: unknown): number | null {
  if (depth === null || depth === undefined || depth === '') {
    return null;
  }

  const parsed = typeof depth === 'number' ? depth : Number.parseInt(String(depth), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

interface UpstreamUpdateBucket {
  count: number;
  preview: string[];
}

function readUpdateBucket(value: unknown): UpstreamUpdateBucket {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { count: 0, preview: [] };
  }

  const record = value as Record<string, unknown>;
  const count = typeof record.count === 'number' && Number.isFinite(record.count)
    ? record.count
    : 0;
  const preview = Array.isArray(record.preview)
    ? record.preview.map((item) => String(item))
    : [];

  return { count, preview };
}

function readUpdateBucketEntries(value: unknown): [string, UpstreamUpdateBucket][] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value as Record<string, unknown>)
    .map(([name, bucket]): [string, UpstreamUpdateBucket] => [name, readUpdateBucket(bucket)]);
}

function buildUpdateDetails(preview: string[]): RepoUpdateStatus['update_details'] {
  return preview.map((line, index) => {
    const match = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}):\s*(.*)$/);
    return {
      commit: `preview-${index}`,
      short_commit: '',
      date_utc: match ? match[1] : '',
      subject: match ? match[2] : line,
    };
  });
}

function repoStatusFromUpdateBucket(name: string, bucket: UpstreamUpdateBucket): RepoUpdateStatus {
  return {
    name,
    branch: '',
    upstream: 'origin',
    current_commit: '',
    has_local_changes: false,
    local_changes_preview: [],
    ahead_count: 0,
    behind_count: bucket.count,
    has_updates: bucket.count > 0,
    is_detached: false,
    is_diverged: false,
    can_auto_update: true,
    can_fast_forward: true,
    update_preview: bucket.preview,
    update_details: buildUpdateDetails(bucket.preview),
    warnings: [],
  };
}

function repoStatusFromUpdateName(name: string): RepoUpdateStatus {
  return repoStatusFromUpdateBucket(name, {
    count: 1,
    preview: ['Update available'],
  });
}

function mergeMissingUpdateRepos(
  repos: RepoUpdateStatus[] | undefined,
  updateNames: string[] | undefined
): RepoUpdateStatus[] {
  const merged = [...(repos ?? [])];
  const knownNames = new Set(merged.map((repo) => repo.name));
  for (const name of updateNames ?? []) {
    if (!knownNames.has(name)) {
      merged.push(repoStatusFromUpdateName(name));
      knownNames.add(name);
    }
  }
  return merged;
}

function normalizeUpdateCheckResponse(response: unknown): UpdateCheckResponse {
  const record = response && typeof response === 'object'
    ? response as Record<string, unknown>
    : {};

  if ('server_updates_count' in record || 'server_repo' in record) {
    const rich = record as unknown as UpdateCheckResponse;
    const extensionUpdates = rich.extension_updates ?? [];
    const backendUpdates = rich.backend_updates ?? [];
    return {
      ...rich,
      server_updates_count: rich.server_updates_count ?? 0,
      server_updates_preview: rich.server_updates_preview ?? [],
      server_repo: rich.server_repo ?? repoStatusFromUpdateBucket('SwarmUI', {
        count: rich.server_updates_count ?? 0,
        preview: rich.server_updates_preview ?? [],
      }),
      extension_updates: extensionUpdates,
      backend_updates: backendUpdates,
      extension_repos: mergeMissingUpdateRepos(rich.extension_repos, extensionUpdates),
      backend_repos: mergeMissingUpdateRepos(rich.backend_repos, backendUpdates),
      warnings: rich.warnings ?? [],
    };
  }

  const server = readUpdateBucket(record.server);
  const extensions = readUpdateBucketEntries(record.extensions);
  const backends = readUpdateBucketEntries(record.backends);

  return {
    checked_at_utc: new Date().toISOString(),
    server_updates_count: server.count,
    server_updates_preview: server.preview,
    server_repo: repoStatusFromUpdateBucket('SwarmUI', server),
    extension_repos: extensions.map(([name, bucket]) => repoStatusFromUpdateBucket(name, bucket)),
    backend_repos: backends.map(([name, bucket]) => repoStatusFromUpdateBucket(name, bucket)),
    extension_updates: extensions.filter(([, bucket]) => bucket.count > 0).map(([name]) => name),
    backend_updates: backends.filter(([, bucket]) => bucket.count > 0).map(([name]) => name),
    warnings: [],
    can_auto_update: true,
  };
}

function sanitizeApiParams(params: any): any {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return params;
  }

  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (key === 'depth') {
      const normalizedDepth = normalizeHistoryDepth(value);
      if (normalizedDepth !== null) {
        cleaned[key] = normalizedDepth;
      }
      continue;
    }

    cleaned[key] = value;
  }

  return cleaned;
}

function joinHistoryPath(basePath: string, entryPath: string): string {
  const normalizedBase = normalizeHistoryPath(basePath);
  const normalizedEntry = normalizeHistoryPath(entryPath);

  if (!normalizedBase) {
    return normalizedEntry;
  }

  if (!normalizedEntry) {
    return normalizedBase;
  }

  return normalizedEntry.includes('/') ? normalizedEntry : `${normalizedBase}/${normalizedEntry}`;
}

function parseLegacyHistoryMetadata(metadata: ImageListItem['metadata']): Record<string, unknown> | null {
  if (!metadata) {
    return null;
  }

  if (typeof metadata === 'object') {
    return metadata;
  }

  const trimmed = metadata.trim();
  if (!trimmed.startsWith('{')) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getLegacyHistoryMediaType(path: string): HistoryMediaType {
  const extension = normalizeHistoryPath(path).split('.').pop()?.toLowerCase() || '';

  if (['webm', 'mp4', 'mov'].includes(extension)) {
    return 'video';
  }
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'].includes(extension)) {
    return 'audio';
  }
  if (['html', 'htm'].includes(extension)) {
    return 'html';
  }
  return 'image';
}

function getLegacyCreatedAt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return Math.floor(parsed / 1000);
    }
  }

  return 0;
}

function toLegacyHistoryPreviewPath(relativePath: string, mediaType: HistoryMediaType): string {
  if (mediaType === 'audio') {
    return '/imgs/audio_placeholder.jpg';
  }
  if (mediaType === 'html') {
    return '/imgs/html.jpg';
  }
  return `/View/local/${normalizeHistoryPath(relativePath)}?preview=true`;
}

function buildLegacyHistoryItem(file: ImageListItem, basePath: string): HistoryImageItem {
  const relativePath = joinHistoryPath(basePath, file.src);
  const metadataObject = parseLegacyHistoryMetadata(file.metadata);
  const params = (metadataObject?.sui_image_params as Record<string, unknown> | undefined)
    || (metadataObject?.swarm as Record<string, unknown> | undefined)
    || metadataObject;
  const mediaType = getLegacyHistoryMediaType(relativePath);
  const prompt = typeof params?.prompt === 'string'
    ? params.prompt
    : typeof metadataObject?.prompt === 'string'
      ? metadataObject.prompt
      : null;
  const promptPreview = prompt
    ? prompt.replace(/\s+/g, ' ').trim().slice(0, 180)
    : null;
  const model = typeof params?.model === 'string'
    ? params.model
    : typeof metadataObject?.model === 'string'
      ? metadataObject.model
      : typeof metadataObject?.Model === 'string'
        ? metadataObject.Model
        : null;
  const seedValue = params?.seed ?? metadataObject?.seed ?? null;
  const widthValue = params?.width ?? metadataObject?.width ?? null;
  const heightValue = params?.height ?? metadataObject?.height ?? null;
  const createdAtValue = params?.date ?? metadataObject?.date ?? null;

  return {
    src: relativePath,
    canonical_src: relativePath.replace(/^Starred\//i, ''),
    preview_src: toLegacyHistoryPreviewPath(relativePath, mediaType),
    media_type: mediaType,
    starred: file.starred || relativePath.startsWith('Starred/'),
    created_at: getLegacyCreatedAt(createdAtValue),
    prompt_preview: promptPreview,
    model,
    width: typeof widthValue === 'number' ? widthValue : Number.parseInt(String(widthValue || ''), 10) || null,
    height: typeof heightValue === 'number' ? heightValue : Number.parseInt(String(heightValue || ''), 10) || null,
    seed: typeof seedValue === 'number' ? seedValue : Number.parseInt(String(seedValue || ''), 10) || null,
    metadata: file.metadata,
  };
}

function buildLegacyHistorySearchText(item: HistoryImageItem): string {
  const resolution = item.width && item.height ? `${item.width}x${item.height}` : '';
  const metadataText = typeof item.metadata === 'string'
    ? item.metadata
    : item.metadata
      ? JSON.stringify(item.metadata)
      : '';

  return [
    normalizeHistoryPath(item.src),
    item.prompt_preview || '',
    item.model || '',
    item.seed?.toString() || '',
    resolution,
    metadataText,
  ].join('\n').toLowerCase();
}

function shouldReplaceLegacyHistoryItem(current: HistoryImageItem, next: HistoryImageItem): boolean {
  if (next.starred && !current.starred) {
    return true;
  }
  if (!next.starred && current.starred) {
    return false;
  }
  if (next.created_at !== current.created_at) {
    return next.created_at > current.created_at;
  }
  return next.src.localeCompare(current.src) < 0;
}

function sortLegacyHistoryItems(items: HistoryImageItem[], sortBy: HistorySortBy, sortReverse: boolean): HistoryImageItem[] {
  const sorted = [...items].sort((left, right) => {
    if (sortBy === 'Name') {
      return normalizeHistoryPath(left.src).localeCompare(normalizeHistoryPath(right.src));
    }

    if (right.created_at !== left.created_at) {
      return right.created_at - left.created_at;
    }

    return normalizeHistoryPath(left.src).localeCompare(normalizeHistoryPath(right.src));
  });

  if (sortReverse) {
    sorted.reverse();
  }

  return sorted;
}

export class SwarmUIClient {
  private static readonly SESSIONLESS_ENDPOINTS = new Set([
    'GetNewSession',
    'Login',
    'RegisterBasic',
    'RegisterOAuth',
  ]);

  private baseUrl: string;
  private wsBaseUrl: string;
  private runtimeEndpoints: RuntimeEndpoints;
  private sessionId: string | null = null;
  private userId: string | null = null;
  private sessionListeners: Set<SessionChangedListener> = new Set();
  private sessionInitPromise: Promise<void> | null = null;

  // Cache for TriggerRefresh results (shared by listVAEs, listControlNets, etc.)
  private triggerRefreshCache: { data: any; timestamp: number } | null = null;
  private triggerRefreshPromise: Promise<any> | null = null;

  constructor(baseUrl?: string) {
    this.runtimeEndpoints = resolveRuntimeEndpoints(baseUrl);
    this.baseUrl = this.runtimeEndpoints.apiBaseUrl;
    this.wsBaseUrl = this.runtimeEndpoints.wsBaseUrl;
    if (ENABLE_VERBOSE_LOGS) {
      console.debug('[SwarmClient] INIT: Runtime endpoints resolved', this.runtimeEndpoints);
    }
  }

  getRuntimeEndpoints(): RuntimeEndpoints {
    return { ...this.runtimeEndpoints };
  }

  onSessionChanged(listener: SessionChangedListener): void {
    this.sessionListeners.add(listener);
  }

  offSessionChanged(listener: SessionChangedListener): void {
    this.sessionListeners.delete(listener);
  }

  private emitSessionChanged(
    reason: SessionChangeReason,
    session: Pick<SessionResponse, 'session_id' | 'user_id' | 'permissions'> | null
  ): void {
    for (const listener of this.sessionListeners) {
      try {
        listener(session, reason);
      } catch (error) {
        this.log('error', 'Session listener failed', error);
      }
    }
  }

  // Centralized logger
  private log(level: 'info' | 'error' | 'debug', message: string, ...args: any[]) {
    if ((level === 'debug' || level === 'info') && !ENABLE_VERBOSE_LOGS) {
      return;
    }

    const prefix = '[SwarmClient]';
    if (level === 'debug') {
      console.debug(prefix, message, ...args);
    } else if (level === 'error') {
      console.error(prefix, message, ...args);
    } else {
      console.debug(prefix, message, ...args);
    }
  }

  /**
   * Get TriggerRefresh data with internal caching.
   * Multiple methods (listVAEs, listControlNets, etc.) share this cached result
   * to avoid redundant API calls during initialization.
   */
  private async getCachedTriggerRefresh(): Promise<any> {
    const now = Date.now();
    const cacheTtlMs = featureFlags.generateTriggerRefreshCacheMs;

    // Return cached data if still valid
    if (
      this.triggerRefreshCache &&
      now - this.triggerRefreshCache.timestamp < cacheTtlMs
    ) {
      this.log('debug', 'Using cached TriggerRefresh data');
      return this.triggerRefreshCache.data;
    }

    // If a request is already in flight, wait for it
    if (this.triggerRefreshPromise) {
      this.log('debug', 'Waiting for in-flight TriggerRefresh');
      return this.triggerRefreshPromise;
    }

    // Make new request
    this.triggerRefreshPromise = this.post<any>('TriggerRefresh', { strong: false })
      .then((response) => {
        this.triggerRefreshCache = { data: response, timestamp: Date.now() };
        return response;
      })
      .finally(() => {
        this.triggerRefreshPromise = null;
      });

    return this.triggerRefreshPromise;
  }

  // Validate backend connection
  async validateConnection(): Promise<boolean> {
    try {
      this.log('debug', 'Validating connection...');
      // Backend requires POST for all API calls
      const response = await fetch(`${this.baseUrl}/API/GetCurrentStatus`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: this.sessionId }),
      });
      return response.ok;
    } catch (error) {
      this.log('error', 'Connection validation failed:', error);
      return false;
    }
  }

  // Initialize session - must be called first
  async initSession(reason: SessionChangeReason = 'init'): Promise<SessionResponse> {
    this.log('info', 'Initializing session...');
    const response = await this.post<SessionResponse>('GetNewSession', {});

    if ('error' in response) {
      const err = (response as APIError).error || 'Failed to create session';
      this.log('error', 'Session initialization failed:', err);
      throw new Error(err);
    }

    const session = response as SessionResponse;
    this.sessionId = session.session_id;
    this.userId = session.user_id;
    this.emitSessionChanged(reason, {
      session_id: session.session_id,
      user_id: session.user_id,
      permissions: session.permissions || [],
    });

    this.log('info', 'Session initialized', { sessionId: this.sessionId, userId: this.userId });
    return session;
  }

  // Get current session info
  getSession() {
    return {
      sessionId: this.sessionId,
      userId: this.userId,
    };
  }

  getComfyBackendDirectUrl(): string {
    return resolveApiUrl('/ComfyBackendDirect/', this.runtimeEndpoints);
  }

  private async ensureSession(): Promise<void> {
    if (this.sessionId) {
      return;
    }

    if (this.sessionInitPromise) {
      await this.sessionInitPromise;
      return;
    }

    this.sessionInitPromise = this.initSession('init')
      .then(() => undefined)
      .finally(() => {
        this.sessionInitPromise = null;
      });

    await this.sessionInitPromise;
  }

  private async getJson<T>(path: string): Promise<T> {
    const response = await fetch(resolveApiUrl(path, this.runtimeEndpoints), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      credentials: 'same-origin',
    });
    if (!response.ok) {
      throw new Error(`Request failed for ${path}: ${response.status}`);
    }
    return response.json() as Promise<T>;
  }

  // Generic POST request with optional deduplication
  async post<T>(endpoint: string, params: any = {}, options?: { timeout?: number }): Promise<T | APIError> {
    const cleanedParams = sanitizeApiParams(params);

    // Deduplicate read-only list endpoints
    if (DEDUP_ENDPOINTS.includes(endpoint)) {
      return requestDeduplicator.dedupe<T | APIError>(endpoint, cleanedParams, () =>
        this.executePost<T>(endpoint, cleanedParams, options)
      );
    }

    return this.executePost<T>(endpoint, cleanedParams, options);
  }

  // Execute the actual POST request
  private async executePost<T>(endpoint: string, params: any = {}, options?: { timeout?: number }): Promise<T | APIError> {
    const url = `${this.baseUrl}/API/${endpoint}`;
    this.log('debug', `POST ${endpoint}`, params);
    recordApiCall(endpoint);

    const cleanedParams = sanitizeApiParams(params);
    if (!SwarmUIClient.SESSIONLESS_ENDPOINTS.has(endpoint) && !this.sessionId) {
      await this.ensureSession();
    }
    const body = this.sessionId ? { session_id: this.sessionId, ...cleanedParams } : cleanedParams;

    const timer = profiler.startTimer(`api:${endpoint}`);

    const timeoutMs = options?.timeout ?? 15000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      // Clone response for diagnostic if JSON parsing fails
      const responseClone = response.clone();

      let data: any;
      try {
        data = await response.json();
      } catch (jsonError) {
        // If JSON fails, try to get text to see what happened (likely HTML error page)
        const textFallback = await responseClone.text();
        this.log(
          'error',
          `POST ${endpoint} returned non-JSON response. Status: ${response.status}`,
          {
            text: textFallback.substring(0, 500),
            error: jsonError,
          }
        );

        throw new Error(
          `Invalid server response (Status: ${response.status}). The server may be restarting or unavailable.`
        );
      }

      // End timer with metadata
      timer.end({
        status: response.status,
        ok: response.ok,
        endpoint,
      });

      // Handle session expiration
      const sessionMissing =
        response.status === 400
        && typeof data?.error === 'string'
        && data.error.toLowerCase().includes('missing session id');

      if (data && (data.error_id === 'invalid_session_id' || sessionMissing)) {
        this.log('debug', 'Session expired, refreshing...');
        await this.initSession('refresh');
        return this.executePost<T>(endpoint, params, options);
      }

      // If response is not ok but we have logical error in JSON
      if (!response.ok && data.error) {
        this.log('error', `POST ${endpoint} returned error state:`, data.error);
      }

      return data;
    } catch (error: any) {
      clearTimeout(timeoutId);
      timer.end({ error: true, endpoint });
      this.log('error', `POST ${endpoint} failed:`, error);

      const errorMessage = error instanceof Error ? error.message : 'Network error';

      if (error.name === 'AbortError') {
        return {
          error: `Request timed out after ${Math.round(timeoutMs / 1000)} seconds. The backend might be overloaded.`,
          error_id: 'api_timeout',
        };
      }

      // Special handling for common network issues
      if (errorMessage === 'Failed to fetch' || errorMessage.includes('NetworkError')) {
        return {
          error:
            'Cannot connect to SwarmUI. Please ensure the backend server is running on port 7801.',
          error_id: 'connection_failed',
        };
      }

      return {
        error: errorMessage,
        error_id: 'api_error',
      };
    }
  }

  // Create WebSocket connection
  createWebSocket(
    endpoint: string,
    params: any,
    onMessage: (data: WebSocketMessage) => void,
    onError?: (error: Event) => void,
    onClose?: () => void
  ): WebSocket {
    const url = `${this.wsBaseUrl}/API/${endpoint}`;
    // DIAGNOSTIC: Log full WebSocket URL
    if (ENABLE_VERBOSE_LOGS) {
      console.debug('[SwarmClient] WS CONNECTING TO:', url);
    }
    this.log('info', `Connecting WS: ${endpoint}`, params);

    const socket = new WebSocket(url);

    // Connection timeout safety
    const connectionTimeout = setTimeout(() => {
      if (socket.readyState === WebSocket.CONNECTING) {
        this.log('error', `WS ${endpoint} connection timed out`);
        socket.close();
        onError?.(new Event('timeout'));
      }
    }, 10000); // 10s timeout

    socket.onopen = () => {
      clearTimeout(connectionTimeout);
      this.log('info', `WS ${endpoint} connected`);
      const body = this.sessionId ? { session_id: this.sessionId, ...params } : params;

      // DIAGNOSTIC: Log the full payload being sent
      if (ENABLE_VERBOSE_LOGS) {
        console.debug('[SwarmClient] WS SEND PAYLOAD:', JSON.stringify(body, null, 2));
        console.debug('[SwarmClient] WS SESSION STATE:', {
          sessionId: this.sessionId,
          userId: this.userId,
        });
      }

      socket.send(JSON.stringify(body));
    };

    socket.onmessage = (event) => {
      try {
        const data: WebSocketMessage = JSON.parse(event.data);
        this.log('debug', `WS ${endpoint} message:`, data); // VERBOSE: Log every message

        // Handle session expiration
        if (data.error_id === 'invalid_session_id') {
          this.log('debug', `WS ${endpoint} session expired, refreshing...`);
          this.initSession('refresh').then(() => {
            socket.close();
            this.createWebSocket(endpoint, params, onMessage, onError, onClose);
          });
          return;
        }

        onMessage(data);

        // Auto-close on completion
        if (data.socket_intention === 'close') {
          this.log('info', `WS ${endpoint} closed by server (intention: close)`);
          socket.close();
        }
      } catch (error) {
        this.log('error', `WS ${endpoint} parse error:`, error);
      }
    };

    socket.onerror = (error) => {
      clearTimeout(connectionTimeout);
      this.log('error', `WS ${endpoint} error:`, error);
      onError?.(error);
    };

    socket.onclose = (event) => {
      clearTimeout(connectionTimeout);
      if (!event.wasClean) {
        this.log(
          'debug',
          `WS ${endpoint} closed unexpectedly code=${event.code} reason=${event.reason}`
        );
      }
      onClose?.();
    };

    return socket;
  }

  // === TEXT-TO-IMAGE ENDPOINTS ===

  async listT2IParams(): Promise<T2IParamsResponse> {
    const response = await this.post<T2IParamsResponse>('ListT2IParams', {});
    if (response && 'list' in response && Array.isArray((response as T2IParamsResponse).list)) {
      return response as T2IParamsResponse;
    }
    throw new Error((response as APIError).error || 'Failed to list T2I params');
  }

  generateImage(
    params: GenerateParams,
    callbacks: {
      onStatus?: (status: any) => void;
      onProgress?: (progress: any) => void;
      onImage?: (image: any) => void;
      onError?: (error: Event) => void;
      onDataError?: (errorMessage: string, errorId?: string) => void;
      onComplete?: () => void;
    }
  ): WebSocket {
      const backendParams: GenerateParams = { ...params };
      let hasProgress = false;
      let hasImage = false;
      let activeRequestId: string | undefined;
      if (
        backendParams.refinercontrolpercentage === undefined &&
        backendParams.refinercontrol !== undefined &&
        backendParams.refinercontrol !== null
      ) {
      backendParams.refinercontrolpercentage = backendParams.refinercontrol;
    }
    delete (backendParams as Record<string, unknown>).refinercontrol;

      return this.createWebSocket(
        'GenerateText2ImageWS',
        backendParams,
        (data) => {
          const requestId = data.request_id || data.gen_progress?.request_id;
          const isMissingModelGenerationError =
            data.error_id === 'missing_model_input'
            || (typeof data.error === 'string' && data.error.trim().toLowerCase().startsWith('no model input given'));

          // Check for server-side errors first
          if (data.error) {
            const shouldSuppressRecoverableError =
              isMissingModelGenerationError
              && (hasProgress || hasImage || !!activeRequestId)
              && ((hasProgress || hasImage) || !requestId || !activeRequestId || requestId === activeRequestId);

            if (shouldSuppressRecoverableError) {
              this.log('info', `Suppressing recoverable generation error from server: ${data.error} (${data.error_id})`);
            } else {
              this.log('error', `Generation error from server: ${data.error} (${data.error_id})`);
              callbacks.onDataError?.(data.error, data.error_id);
            }
          }
          if (data.status) callbacks.onStatus?.(data.status);
          if (data.gen_progress) {
            hasProgress = true;
            activeRequestId = data.gen_progress.request_id || activeRequestId;
            callbacks.onProgress?.(data.gen_progress);
          }
          if (data.image) {
            hasImage = true;
            activeRequestId = data.request_id || activeRequestId;
            callbacks.onImage?.(data);
          }
        },
        callbacks.onError,
        callbacks.onComplete
      );
    }

  async listImages(path: string = '', depth: number = 1): Promise<ImageFolderResponse> {
    const response = await this.post<ImageFolderResponse>('ListImages', {
      path,
      depth: normalizeHistoryDepth(depth) ?? 1,
    });
    if ('files' in response) {
      return {
        files: response.files || [],
        folders: response.folders || [],
      };
    }
    const err = response as APIError;
    throw new Error(err.error || err.error_id || 'Failed to list images');
  }

  private async listImagesV2Legacy(params: ListImagesV2Params = {}): Promise<HistoryFolderResponseV2> {
    const path = normalizeHistoryPath(params.path ?? '');
    const recursive = params.recursive ?? true;
    const maxDepth = recursive ? Math.max(params.depth ?? Number.MAX_SAFE_INTEGER, 0) : 0;
    const query = (params.query || '').trim().toLowerCase();
    const sortBy = params.sortBy ?? 'Date';
    const sortReverse = params.sortReverse ?? false;
    const starredOnly = params.starredOnly ?? false;
    const mediaType = params.mediaType ?? 'all';
    const offset = Number.parseInt(params.cursor ?? '0', 10) || 0;
    const limit = Math.min(Math.max(params.limit ?? 200, 1), 200);

    const rootResponse = await this.listImages(path, 1);
    const folders = rootResponse.folders || [];
    const dedupedItems = new Map<string, HistoryImageItem>();

    const visitFolder = async (
      currentPath: string,
      depth: number,
      existingResponse?: ImageFolderResponse
    ): Promise<void> => {
      const response = existingResponse ?? await this.listImages(currentPath, 1);

      for (const file of response.files || []) {
        const item = buildLegacyHistoryItem(file, currentPath);

        if (starredOnly && !item.starred) {
          continue;
        }
        if (mediaType !== 'all' && item.media_type !== mediaType) {
          continue;
        }
        if (query && !buildLegacyHistorySearchText(item).includes(query)) {
          continue;
        }

        const existing = dedupedItems.get(item.canonical_src);
        if (!existing || shouldReplaceLegacyHistoryItem(existing, item)) {
          dedupedItems.set(item.canonical_src, item);
        }
      }

      if (!recursive || depth >= maxDepth) {
        return;
      }

      for (const folder of response.folders || []) {
        const nextPath = joinHistoryPath(currentPath, folder);
        await visitFolder(nextPath, depth + 1);
      }
    };

    await visitFolder(path, 0, rootResponse);

    const sortedItems = sortLegacyHistoryItems(Array.from(dedupedItems.values()), sortBy, sortReverse);
    const files = sortedItems.slice(offset, offset + limit);
    const nextOffset = offset + files.length;

    return {
      folders,
      files,
      next_cursor: nextOffset < sortedItems.length ? String(nextOffset) : null,
      has_more: nextOffset < sortedItems.length,
      truncated: false,
      total_count: sortedItems.length,
    };
  }

  async listImagesV2(params: ListImagesV2Params = {}): Promise<HistoryFolderResponseV2> {
    const normalizedDepth = normalizeHistoryDepth(params.depth);
    const response = await this.post<HistoryFolderResponseV2>('ListImagesV2', {
      path: params.path ?? '',
      recursive: params.recursive ?? true,
      ...(normalizedDepth !== null ? { depth: normalizedDepth } : {}),
      query: params.query ?? null,
      sortBy: params.sortBy ?? 'Date',
      sortReverse: params.sortReverse ?? false,
      starredOnly: params.starredOnly ?? false,
      mediaType: params.mediaType ?? 'all',
      cursor: params.cursor ?? null,
      limit: params.limit ?? 200,
    });
    if ('files' in response) {
      return {
        folders: response.folders || [],
        files: response.files || [],
        next_cursor: response.next_cursor || null,
        has_more: response.has_more || false,
        truncated: response.truncated || false,
        total_count: response.total_count || 0,
      };
    }
    const err = response as APIError;
    if (isUnknownRouteError(err)) {
      this.log('info', 'ListImagesV2 unavailable, falling back to legacy ListImages');
      return this.listImagesV2Legacy(params);
    }
    throw new Error(err.error || err.error_id || 'Failed to list history images');
  }

  async exportHistoryZip(params: ExportHistoryZipParams = {}): Promise<ExportHistoryZipResponse> {
    const normalizedDepth = normalizeHistoryDepth(params.depth);
    const response = await this.post<ExportHistoryZipResponse>('ExportHistoryZip', {
      paths: params.paths,
      path: params.path ?? '',
      recursive: params.recursive ?? true,
      ...(normalizedDepth !== null ? { depth: normalizedDepth } : {}),
      query: params.query ?? null,
      sortBy: params.sortBy ?? 'Date',
      sortReverse: params.sortReverse ?? false,
      starredOnly: params.starredOnly ?? false,
      mediaType: params.mediaType ?? 'all',
    }, { timeout: 60000 });

    if ('error' in response && response.error) {
      if (isUnknownRouteError(response)) {
        throw new Error('History ZIP export is not available on this backend yet.');
      }
      throw new Error(response.error);
    }

    return response;
  }

  async toggleImageStar(imagePath: string): Promise<void> {
    this.log('info', `Toggling star for: ${imagePath}`);
    const response = await this.post<{ new_state?: boolean; error?: string }>(
      'ToggleImageStarred',
      { path: imagePath }
    );
    if ('error' in response && response.error) {
      this.log('error', `Failed to toggle star: ${response.error}`);
      throw new Error(response.error);
    }
    this.log(
      'info',
      `Star toggled successfully, new state: ${'new_state' in response ? response.new_state : 'unknown'}`
    );
  }

  async deleteImage(imagePath: string): Promise<void> {
    this.log('info', `Deleting image with path: "${imagePath}"`);
    const response = await this.post<{ success?: boolean; error?: string }>('DeleteImage', {
      path: imagePath,
    });
    this.log('debug', `DeleteImage API response:`, response);
    if ('error' in response && response.error) {
      this.log('error', `Failed to delete image: ${response.error}`);
      throw new Error(response.error);
    }
    this.log('info', `Image deleted successfully`);
  }

  // === MODEL ENDPOINTS ===

  async listModels(path: string = '', subtype: string = 'Stable-Diffusion'): Promise<Model[]> {
    const result = await this.listModelsWithFolders(path, subtype);
    return result.files;
  }

  async listModelsWithFolders(
    path: string = '',
    subtype: string = 'Stable-Diffusion'
  ): Promise<{ files: Model[]; folders: string[] }> {
    const response = await this.post<{ files: Model[]; folders: string[] }>('ListModels', {
      path: path,
      depth: 10,
      subtype: subtype,
    });
    return {
      files: response && 'files' in response && Array.isArray(response.files) ? response.files : [],
      folders:
        response && 'folders' in response && Array.isArray(response.folders) ? response.folders : [],
    };
  }

  async listEmbeddings(): Promise<Model[]> {
    // Fallback to ListModels
    return this.listModels('', 'Embedding');
  }

  async listEmbeddingsWithFolders(): Promise<{ files: Model[]; folders: string[] }> {
    return this.listModelsWithFolders('', 'Embedding');
  }

  async listUpscalers(): Promise<Model[]> {
    // Upscalers are exposed as parameter values for refinerupscalemethod.
    // Model methods are emitted dynamically by the backend as model-* / latentmodel-* entries.
    const fallbackValues = [
      'pixel-lanczos///Pixel: Lanczos',
      'pixel-bicubic///Pixel: Bicubic',
      'pixel-area///Pixel: Area',
      'pixel-bilinear///Pixel: Bilinear',
      'pixel-nearest-exact///Pixel: Nearest Exact',
      'latent-bislerp///Latent: Bislerp',
      'latent-bicubic///Latent: Bicubic',
      'latent-area///Latent: Area',
      'latent-bilinear///Latent: Bilinear',
      'latent-nearest-exact///Latent: Nearest Exact',
    ];
    const response = await this.getCachedTriggerRefresh();
    const responseObject = response && typeof response === 'object'
      ? response as { list?: unknown }
      : {};
    const list = Array.isArray(responseObject.list) ? responseObject.list : [];
    const param = list.find((entry) => (
      Boolean(entry)
      && typeof entry === 'object'
      && (entry as { id?: unknown }).id === 'refinerupscalemethod'
    )) as { values?: unknown; value_names?: unknown } | undefined;
    const values = Array.isArray(param?.values) ? param.values : [];
    const valueNames = Array.isArray(param?.value_names) ? param.value_names : [];
    const seen = new Set<string>();

    const parseUpscaler = (value: unknown, index: number): Model | null => {
      const valueObject = value && typeof value === 'object'
        ? value as { name?: unknown; value?: unknown; title?: unknown }
        : {};
      const raw = typeof value === 'string'
        ? value
        : (typeof valueObject.name === 'string'
          ? valueObject.name
          : (typeof valueObject.value === 'string' ? valueObject.value : ''));

      if (!raw) return null;

      const parts = raw.split('///');
      const id = (parts[0] || '').trim();
      if (!id || seen.has(id)) return null;
      seen.add(id);

      const objectTitle = typeof valueObject.title === 'string' ? valueObject.title : '';
      const pairedTitle = typeof valueNames[index] === 'string' ? valueNames[index] : '';
      const desc = objectTitle || pairedTitle || (parts[1]?.trim() || id);

      return {
        name: id,
        title: desc,
        architecture: 'upscaler',
        class: 'upscaler',
        description: desc,
        hash: '',
        loaded: false,
        preview: undefined,
        metadata: {},
      } as Model;
    };

    return [...values, ...fallbackValues]
      .map(parseUpscaler)
      .filter((item): item is Model => item !== null);
  }

  async listWildcards(): Promise<Model[]> {
    // Wildcards are often in the parameter list
    const params = await this.listParameterValues('wildcard'); // check singular
    const paramsPlural = await this.listParameterValues('wildcards'); // check plural

    const all = [...params, ...paramsPlural];
    if (all.length > 0) {
      return all.map((p) => ({
        name: typeof p === 'string' ? p : p.name,
        title: typeof p === 'string' ? p : p.name,
        architecture: 'wildcard',
        class: 'wildcard',
        description: '',
        hash: '',
        loaded: false,
        preview: undefined,
        metadata: {},
      }));
    }

    return this.listModels('', 'Wildcards');
  }

  // Helper to get values from TriggerRefresh list (uses cached result)
  async listParameterValues(paramId: string): Promise<any[]> {
    const response = await this.getCachedTriggerRefresh();
    if ('list' in response && response.list) {
      const param = response.list.find((p: any) => p.id === paramId);
      if (param && param.values) return param.values;
    }
    return [];
  }

  async selectModel(modelName: string): Promise<void> {
    await this.post('SelectModel', { model: modelName });
  }

  selectModelWithProgress(
    modelName: string,
    onProgress: (data: WebSocketMessage) => void,
    onError?: (error: Event) => void
  ): WebSocket {
    return this.createWebSocket('SelectModelWS', { model: modelName }, onProgress, onError);
  }

  async describeModel(
    modelName: string,
    subtype: string = 'Stable-Diffusion'
  ): Promise<{ model: ModelDescription } | { error: string }> {
    const response = await this.post<{ model: ModelDescription } | { error: string }>(
      'DescribeModel',
      { modelName, subtype }
    );
    return response as { model: ModelDescription } | { error: string };
  }

  async deleteModel(
    modelName: string,
    subtype: string = 'Stable-Diffusion'
  ): Promise<{ success?: boolean; error?: string }> {
    const response = await this.post<{ success?: boolean; error?: string }>(
      'DeleteModel',
      { modelName, subtype }
    );
    return response as { success?: boolean; error?: string };
  }

  async renameModel(
    oldName: string,
    newName: string,
    subtype: string = 'Stable-Diffusion'
  ): Promise<{ success?: boolean; error?: string }> {
    const response = await this.post<{ success?: boolean; error?: string }>(
      'RenameModel',
      { oldName, newName, subtype }
    );
    return response as { success?: boolean; error?: string };
  }

  async editModelMetadata(params: {
    model: string;
    title?: string;
    author?: string;
    type?: string;
    description?: string;
    standard_width?: number;
    standard_height?: number;
    usage_hint?: string;
    date?: string;
    license?: string;
    trigger_phrase?: string;
    prediction_type?: string;
    tags?: string;
    preview_image?: string | null;
    preview_image_metadata?: string | null;
    source_type?: string | null;
    source_model_id?: string | null;
    source_version_id?: string | null;
    source_repo?: string | null;
    source_url?: string | null;
    source_locked?: boolean;
    last_metadata_sync_at?: number;
    last_metadata_sync_source?: string | null;
    last_metadata_sync_status?: string | null;
    last_metadata_sync_message?: string | null;
    subtype?: string;
  }): Promise<{ success?: boolean; error?: string }> {
    const response = await this.post<{ success?: boolean; error?: string }>(
      'EditModelMetadata',
      { subtype: 'Stable-Diffusion', ...params }
    );
    return response as { success?: boolean; error?: string };
  }

  async listLoadedModels(): Promise<ModelDescription[]> {
    const response = await this.post<{ models: ModelDescription[] }>('ListLoadedModels', {});
    return 'models' in response ? response.models : [];
  }

  async setStarredModels(data: Record<string, string[]>): Promise<{ success?: boolean }> {
    const response = await this.post<{ success?: boolean }>('SetStarredModels', data);
    return response as { success?: boolean };
  }

  // === VAE ENDPOINTS ===

  async listVAEs(): Promise<VAEModel[]> {
    const response = await this.getCachedTriggerRefresh();

    // SwarmUI TriggerRefresh returns a 'list' object with all parameter types
    if ('list' in response && response.list) {
      const vaeParam = response.list.find((param: any) => param.id === 'vae');
      if (vaeParam && vaeParam.values) {
        return vaeParam.values.map((vae: any) => ({
          name: vae,
          title: vae,
          description: '',
          path: vae,
        }));
      }
    }

    return [];
  }

  // === LORA ENDPOINTS ===

  async listLoRAs(): Promise<any[]> {
    // Use ListModels API with LoRA subtype to get full data including previews
    const response = await this.post<{ files: any[]; folders: string[] }>('ListModels', {
      path: '',
      depth: 10,
      subtype: 'LoRA',
    });

    if ('files' in response && response.files) {
      // Log the first raw LoRA to debug available fields (only once)
      if (ENABLE_VERBOSE_LOGS && response.files.length > 0) {
        console.debug('[SwarmClient] Raw LoRA data sample:', {
          name: response.files[0].name,
          trigger_phrase: response.files[0].trigger_phrase,
          tags: response.files[0].tags,
          title: response.files[0].title,
        });
      }

      return response.files.map((lora: any) => {
        const loraName = lora.name || '';

        // Get trigger phrase (may contain training captions)
        const triggerPhrase = lora.trigger_phrase || '';

        // Get tags (usually more useful category-level info)
        const tags: string[] = Array.isArray(lora.tags) ? lora.tags : [];

        return {
          name: loraName,
          title: lora.title || loraName,
          description: lora.description || '',
          preview: lora.preview_image || lora.preview || null,
          preview_image: lora.preview_image || null,
          path: lora.name || loraName,
          metadata: lora.metadata || {},
          // Combine trigger_phrase and tags - trigger_phrase first
          activationText: triggerPhrase || '',
          // Keep tags separately for display
          tags: tags,
          trainedWords: lora.trained_words || lora.trainedWords || [],
          baseModel: lora.base_model || lora.baseModel || lora.architecture || '',
          folder: this.extractFolder(lora.name || loraName),
          // Additional metadata
          author: lora.author || '',
          resolution: lora.resolution || '',
          dateCreated: lora.time_created || lora.date || '',
        };
      });
    }

    return [];
  }

  // === CONTROLNET ENDPOINTS ===

  async listControlNets(): Promise<any[]> {
    const response = await this.getCachedTriggerRefresh();

    // SwarmUI TriggerRefresh returns models in response.models['ControlNet'] as [name, path] pairs.
    // The 'controlnetmodel' param in response.list has values=null for model-type params —
    // the actual installed models live under response.models.
    if ('models' in response && response.models && Array.isArray(response.models['ControlNet'])) {
      return response.models['ControlNet']
        .filter((entry: any) => Array.isArray(entry) && entry[0] && entry[0] !== '(None)')
        .map((entry: any) => {
          const name = entry[0] as string;
          // Strip extension for a cleaner display label
          const label = name.replace(/\.[^/.]+$/, '');
          return {
            name,
            title: label,
            description: '',
            path: entry[1] as string,
          };
        });
    }

    return [];
  }

  private extractFolder(path: string): string {
    const parts = path.split(/[/\\]/);
    if (parts.length > 1) {
      return parts.slice(0, -1).join('/');
    }
    return '';
  }

  // === BACKEND ENDPOINTS ===

  private normalizeBackendStatus(
    rawBackend: Record<string, unknown>,
    fallbackId?: string
  ): BackendStatus {
    const rawId = rawBackend.id;
    const id =
      typeof rawId === 'string' || typeof rawId === 'number'
        ? String(rawId)
        : fallbackId || '';
    const status = typeof rawBackend.status === 'string' ? rawBackend.status : 'unknown';
    const type = typeof rawBackend.type === 'string' ? rawBackend.type : 'unknown';
    const backendClass =
      typeof rawBackend.class === 'string'
        ? rawBackend.class
        : typeof rawBackend.type === 'string'
        ? rawBackend.type
        : 'unknown';
    const modcount =
      typeof rawBackend.modcount === 'number'
        ? rawBackend.modcount
        : Number(rawBackend.modcount || 0);

    return {
      ...rawBackend,
      id,
      status,
      type,
      class: backendClass,
      modcount: Number.isFinite(modcount) ? modcount : 0,
    } as BackendStatus;
  }

  private normalizeBackendsResponse(response: unknown): BackendStatus[] {
    if (!response || typeof response !== 'object') {
      return [];
    }

    const raw = response as Record<string, unknown>;
    const candidates = (raw.backends ?? raw) as unknown;

    if (Array.isArray(candidates)) {
      return candidates
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((item) => this.normalizeBackendStatus(item));
    }

    if (!candidates || typeof candidates !== 'object') {
      return [];
    }

    return Object.entries(candidates as Record<string, unknown>)
      .filter(([, value]) => !!value && typeof value === 'object')
      .map(([id, value]) => this.normalizeBackendStatus(value as Record<string, unknown>, id));
  }

  async listBackends(options?: {
    fullData?: boolean;
    nonreal?: boolean;
  }): Promise<BackendStatus[]> {
    const response = await this.post<unknown>('ListBackends', {
      ...(options?.fullData ? { full_data: true } : {}),
      ...(options?.nonreal ? { nonreal: true } : {}),
    });
    return this.normalizeBackendsResponse(response);
  }

  async getCurrentStatus() {
    return this.post('GetCurrentStatus', {});
  }

  async interruptAll(): Promise<void> {
    await this.post('InterruptAll', {});
  }

  // === USER ENDPOINTS ===

  async getMyUserData() {
    return this.post('GetMyUserData', {});
  }

  async getUserSettings() {
    return this.post('GetUserSettings', {});
  }

  async changeUserSettings(settings: any) {
    return this.post('ChangeUserSettings', { settings });
  }

  async login(username: string, password: string): Promise<SessionResponse | APIError> {
    const response = await this.post<SessionResponse | APIError>('Login', { username, password });
    if (response && 'session_id' in response) {
      this.sessionId = response.session_id;
      this.userId = response.user_id;
      this.emitSessionChanged('auth', {
        session_id: response.session_id,
        user_id: response.user_id,
        permissions: response.permissions || [],
      });
    }
    return response;
  }

  async registerBasic(username: string, password: string): Promise<SessionResponse | APIError> {
    const response = await this.post<SessionResponse | APIError>('RegisterBasic', {
      username,
      password,
    });
    if (response && 'session_id' in response) {
      this.sessionId = response.session_id;
      this.userId = response.user_id;
      this.emitSessionChanged('auth', {
        session_id: response.session_id,
        user_id: response.user_id,
        permissions: response.permissions || [],
      });
    }
    return response;
  }

  async registerOAuth(
    username: string,
    oauthTrackerKey: string,
    oauthType: string
  ): Promise<SessionResponse | APIError> {
    const response = await this.post<SessionResponse | APIError>('RegisterOAuth', {
      username,
      oauth_tracker_key: oauthTrackerKey,
      oauth_type: oauthType,
    });
    if (response && 'session_id' in response) {
      this.sessionId = response.session_id;
      this.userId = response.user_id;
      this.emitSessionChanged('auth', {
        session_id: response.session_id,
        user_id: response.user_id,
        permissions: response.permissions || [],
      });
    }
    return response;
  }

  installConfirm(
    params: {
      theme: string;
      installed_for: string;
      backend: string;
      models: string;
      install_amd: boolean;
      language: string;
      make_shortcut?: boolean;
    },
    callbacks: {
      onInfo?: (message: string) => void;
      onProgress?: (data: { progress?: number; total?: number }) => void;
      onError?: (message: string) => void;
      onComplete?: () => void;
    }
  ): WebSocket {
    return this.createWebSocket(
      'InstallConfirmWS',
      params,
      (data) => {
        if (data.error) {
          callbacks.onError?.(data.error);
          return;
        }
        const info = (data as any).info;
        if (typeof info === 'string') {
          callbacks.onInfo?.(info);
        }
        const progress = (data as any).progress;
        const total = (data as any).total;
        if (progress !== undefined || total !== undefined) {
          callbacks.onProgress?.({ progress, total });
        }
        if (data.success) {
          callbacks.onComplete?.();
        }
      },
      undefined,
      callbacks.onComplete
    );
  }

  // === UTIL ENDPOINTS ===

  async openImageFolder(path: string): Promise<{ success?: boolean; error?: string }> {
    const response = await this.post<{ success?: boolean; error?: string }>('OpenImageFolder', { path });
    return response as { success?: boolean; error?: string };
  }

  async addImageToHistory(
    imageDataUrl: string,
    params: Record<string, unknown> = {}
  ): Promise<{ images?: Array<{ image: string; batch_index: string; metadata: string }> }> {
    const response = await this.post<any>('AddImageToHistory', {
      image: imageDataUrl,
      ...params,
    });
    return response;
  }

  async countTokens(params: {
    text: string;
    skipPromptSyntax?: boolean;
    tokenset?: string;
    weighting?: boolean;
  }): Promise<{ count: number }> {
    const response = await this.post<{ count: number }>('CountTokens', {
      text: params.text,
      skipPromptSyntax: params.skipPromptSyntax ?? false,
      tokenset: params.tokenset ?? 'clip',
      weighting: params.weighting ?? true,
    });
    if (response && 'count' in response) {
      return response as { count: number };
    }
    return { count: 0 };
  }

  async tokenizeInDetail(params: {
    text: string;
    skipPromptSyntax?: boolean;
    tokenset?: string;
    weighting?: boolean;
  }): Promise<Record<string, unknown>> {
    const response = await this.post<Record<string, unknown>>('TokenizeInDetail', {
      text: params.text,
      skipPromptSyntax: params.skipPromptSyntax ?? false,
      tokenset: params.tokenset ?? 'clip',
      weighting: params.weighting ?? true,
    });
    return response as Record<string, unknown>;
  }

  async getLanguage(
    language: string
  ): Promise<{ language?: Record<string, unknown>; error?: string }> {
    const response = await this.post<{ language?: Record<string, unknown>; error?: string }>(
      'GetLanguage',
      { language }
    );
    return response as { language?: Record<string, unknown>; error?: string };
  }

  async pickle2SafeTensor(type: string, fp16: boolean): Promise<{ success?: boolean; error?: string }> {
    const response = await this.post<{ success?: boolean; error?: string }>('Pickle2SafeTensor', {
      type,
      fp16,
    });
    return response as { success?: boolean; error?: string };
  }

  async wipeMetadata(): Promise<{ success?: boolean; error?: string }> {
    const response = await this.post<{ success?: boolean; error?: string }>('WipeMetadata', {});
    return response as { success?: boolean; error?: string };
  }

  async logout(): Promise<{ success?: boolean; error?: string }> {
    this.log('info', 'Logging out...');
    const response = await this.post<{ success?: boolean; error?: string }>('Logout', {});
    if (!response.error) {
      this.sessionId = null;
      this.userId = null;
      this.emitSessionChanged('logout', null);
    }
    return response as { success?: boolean; error?: string };
  }

  // === PRESET ENDPOINTS ===

  async getUserPresets(): Promise<BackendPreset[]> {
    const response = await this.post<UserDataResponse>('GetMyUserData', {});
    if ('presets' in response && Array.isArray((response as UserDataResponse).presets)) {
      return (response as UserDataResponse).presets;
    }
    return [];
  }

  async addNewPreset(params: {
    title: string;
    description: string;
    param_map: Record<string, string>;
    preview_image?: string;
    is_edit?: boolean;
    editing?: string;
    is_starred?: boolean;
  }): Promise<{ success?: boolean; preset_fail?: string }> {
    const response = await this.post<{ success?: boolean; preset_fail?: string }>('AddNewPreset', params);
    return response as { success?: boolean; preset_fail?: string };
  }

  async deletePreset(preset: string): Promise<{ success?: boolean }> {
    const response = await this.post<{ success?: boolean }>('DeletePreset', { preset });
    return response as { success?: boolean };
  }

  async duplicatePreset(preset: string): Promise<{ success?: boolean; preset_fail?: string }> {
    const response = await this.post<{ success?: boolean; preset_fail?: string }>('DuplicatePreset', { preset });
    return response as { success?: boolean; preset_fail?: string };
  }

  async setPresetLinks(
    links: Record<string, unknown>
  ): Promise<{ success?: boolean; error?: string }> {
    const response = await this.post<{ success?: boolean; error?: string }>('SetPresetLinks', links);
    return response as { success?: boolean; error?: string };
  }

  async setParamEdits(
    edits: Record<string, unknown>
  ): Promise<{ success?: boolean; error?: string }> {
    const response = await this.post<{ success?: boolean; error?: string }>('SetParamEdits', {
      edits,
    });
    return response as { success?: boolean; error?: string };
  }

  // === BACKEND MANAGEMENT ENDPOINTS ===

  async listBackendTypes(): Promise<BackendType[]> {
    const response = await this.post<{ list: BackendType[] }>('ListBackendTypes', {});
    return 'list' in response ? response.list : [];
  }

  async addNewBackend(typeId: string): Promise<BackendDetail | { error: string }> {
    const response = await this.post<BackendDetail | { error: string }>('AddNewBackend', { type_id: typeId });
    return response as BackendDetail | { error: string };
  }

  async deleteBackend(backendId: number | string): Promise<{ result?: string; error?: string }> {
    const response = await this.post<{ result?: string; error?: string }>('DeleteBackend', { backend_id: backendId });
    return response as { result?: string; error?: string };
  }

  async toggleBackend(backendId: number | string, enabled: boolean): Promise<{ result?: string; error?: string }> {
    const response = await this.post<{ result?: string; error?: string }>('ToggleBackend', { backend_id: backendId, enabled });
    return response as { result?: string; error?: string };
  }

  async editBackend(
    backendId: number | string,
    title: string,
    settings: Record<string, unknown>,
    newId?: number
  ): Promise<BackendDetail | { error: string }> {
    const response = await this.post<BackendDetail | { error: string }>('EditBackend', {
      backend_id: backendId,
      title,
      raw_inp: settings,
      ...(newId !== undefined ? { new_id: newId } : {}),
    });
    return response as BackendDetail | { error: string };
  }

  async restartBackends(backend: string = 'all'): Promise<{ result?: string; count?: number; error?: string }> {
    const response = await this.post<{ result?: string; count?: number; error?: string }>('RestartBackends', { backend });
    return response as { result?: string; count?: number; error?: string };
  }

  async freeBackendMemory(
    systemRam: boolean = false,
    backend: string = 'all'
  ): Promise<{ result?: boolean; count?: number }> {
    const response = await this.post<{ result?: boolean; count?: number }>('FreeBackendMemory', {
      system_ram: systemRam,
      backend,
    });
    return response as { result?: boolean; count?: number };
  }

  // === LOG ENDPOINTS ===

  async listLogTypes(): Promise<LogType[]> {
    const response = await this.post<{ types_available: LogType[] }>('ListLogTypes', {});
    return 'types_available' in response ? response.types_available : [];
  }

  async listRecentLogMessages(
    types: string[],
    lastSequenceIds?: Record<string, number>
  ): Promise<{ last_sequence_id: number; data: Record<string, LogMessage[]> }> {
    const response = await this.post<{ last_sequence_id: number; data: Record<string, LogMessage[]> }>(
      'ListRecentLogMessages',
      { types, ...(lastSequenceIds ? { last_sequence_ids: lastSequenceIds } : {}) }
    );
    return response as { last_sequence_id: number; data: Record<string, LogMessage[]> };
  }

  // === SERVER RESOURCE ENDPOINTS ===

  async getServerResourceInfo(): Promise<ServerResourceInfo> {
    const response = await this.post<ServerResourceInfo>('GetServerResourceInfo', {});
    return response as ServerResourceInfo;
  }

  async listServerSettings(): Promise<{ settings: Record<string, unknown> } | APIError> {
    const response = await this.post<{ settings: Record<string, unknown> } | APIError>(
      'ListServerSettings',
      {}
    );
    return response;
  }

  async changeServerSettings(
    settings: Record<string, unknown>
  ): Promise<{ success?: boolean; changed_settings?: string[]; error?: string }> {
    const response = await this.post<{
      success?: boolean;
      changed_settings?: string[];
      error?: string;
    }>('ChangeServerSettings', { settings });
    return response as { success?: boolean; changed_settings?: string[]; error?: string };
  }

  async checkForUpdates(): Promise<UpdateCheckResponse> {
    const response = await this.post<unknown>('CheckForUpdates', {});
    return normalizeUpdateCheckResponse(response);
  }

  async updateAndRestart(params?: {
    updateExtensions?: boolean;
    updateBackends?: boolean;
    extensionsToUpdate?: string[];
    backendsToUpdate?: string[];
    doUpdateServer?: boolean;
    aggressive?: boolean;
    force?: boolean;
  }): Promise<UpdateAndRestartResponse> {
    const extensionsToUpdate = params?.extensionsToUpdate ?? [];
    const backendsToUpdate = params?.backendsToUpdate ?? [];
    const request = {
      updateExtensions: params?.updateExtensions ?? extensionsToUpdate.length > 0,
      updateBackends: params?.updateBackends ?? backendsToUpdate.length > 0,
      extensionsToUpdate,
      backendsToUpdate,
      doUpdateServer: params?.doUpdateServer ?? true,
      aggressive: params?.aggressive ?? false,
      force: params?.force ?? false,
    };
    const response = await this.post<UpdateAndRestartResponse>(
      'UpdateAndRestart',
      request
    );
    return response as UpdateAndRestartResponse;
  }

  async installExtension(extensionName: string): Promise<{ success?: boolean; error?: string }> {
    const response = await this.post<{ success?: boolean; error?: string }>(
      'InstallExtension',
      { extensionName }
    );
    return response as { success?: boolean; error?: string };
  }

  async updateExtension(extensionName: string): Promise<{ success?: boolean; error?: string }> {
    const response = await this.post<{ success?: boolean; error?: string }>(
      'UpdateExtension',
      { extensionName }
    );
    return response as { success?: boolean; error?: string };
  }

  async uninstallExtension(extensionName: string): Promise<{ success?: boolean; error?: string }> {
    const response = await this.post<{ success?: boolean; error?: string }>(
      'UninstallExtension',
      { extensionName }
    );
    return response as { success?: boolean; error?: string };
  }

  async listConnectedUsers(): Promise<{ users?: unknown[]; error?: string }> {
    const response = await this.post<{ users?: unknown[]; error?: string }>(
      'ListConnectedUsers',
      {}
    );
    return response as { users?: unknown[]; error?: string };
  }

  async getGlobalStatus(): Promise<Record<string, unknown>> {
    const response = await this.post<Record<string, unknown>>('GetGlobalStatus', {});
    return response as Record<string, unknown>;
  }

  async logSubmitToPastebin(type: 'verbose' | 'debug' | 'info' = 'info'): Promise<{ url?: string; error?: string }> {
    const response = await this.post<{ url?: string; error?: string }>('LogSubmitToPastebin', {
      type,
    });
    return response as { url?: string; error?: string };
  }

  async serverDebugMessage(message: string): Promise<{ success?: boolean; error?: string }> {
    const response = await this.post<{ success?: boolean; error?: string }>('ServerDebugMessage', {
      message,
    });
    return response as { success?: boolean; error?: string };
  }

  async debugLanguageAdd(set: string[]): Promise<{ success?: boolean; error?: string }> {
    const response = await this.post<{ success?: boolean; error?: string }>('DebugLanguageAdd', {
      set,
    });
    return response as { success?: boolean; error?: string };
  }

  async debugGenDocs(): Promise<{ success?: boolean; error?: string }> {
    const response = await this.post<{ success?: boolean; error?: string }>('DebugGenDocs', {});
    return response as { success?: boolean; error?: string };
  }

  // === ACCOUNT ENDPOINTS ===

  async changePassword(oldPassword: string, newPassword: string): Promise<{ success?: boolean; error?: string }> {
    const response = await this.post<{ success?: boolean; error?: string }>('ChangePassword', {
      oldPassword,
      newPassword,
    });
    return response as { success?: boolean; error?: string };
  }

  async setAPIKey(keyType: string, key: string): Promise<{ success?: boolean; error?: string }> {
    const response = await this.post<{ success?: boolean; error?: string }>('SetAPIKey', { keyType, key });
    return response as { success?: boolean; error?: string };
  }

  async getAPIKeyStatus(keyType: string): Promise<{ status: string }> {
    const response = await this.post<{ status: string }>('GetAPIKeyStatus', { keyType });
    return response as { status: string };
  }

  async adminListUsers(): Promise<{ users?: string[]; error?: string }> {
    const response = await this.post<{ users?: string[]; error?: string }>('AdminListUsers', {});
    return response as { users?: string[]; error?: string };
  }

  async adminAddUser(
    name: string,
    password: string,
    role: string
  ): Promise<{ success?: boolean; error?: string }> {
    const response = await this.post<{ success?: boolean; error?: string }>('AdminAddUser', {
      name,
      password,
      role,
    });
    return response as { success?: boolean; error?: string };
  }

  async adminSetUserPassword(
    name: string,
    password: string
  ): Promise<{ success?: boolean; error?: string }> {
    const response = await this.post<{ success?: boolean; error?: string }>(
      'AdminSetUserPassword',
      { name, password }
    );
    return response as { success?: boolean; error?: string };
  }

  async adminSetUserOAuthEmail(
    name: string,
    email: string
  ): Promise<{ success?: boolean; error?: string }> {
    const response = await this.post<{ success?: boolean; error?: string }>(
      'AdminSetUserOAuthEmail',
      { name, email }
    );
    return response as { success?: boolean; error?: string };
  }

  async adminChangeUserSettings(
    name: string,
    settings: Record<string, unknown>
  ): Promise<{ success?: boolean; error?: string }> {
    const response = await this.post<{ success?: boolean; error?: string }>(
      'AdminChangeUserSettings',
      { name, settings }
    );
    return response as { success?: boolean; error?: string };
  }

  async adminDeleteUser(name: string): Promise<{ success?: boolean; error?: string }> {
    const response = await this.post<{ success?: boolean; error?: string }>(
      'AdminDeleteUser',
      { name }
    );
    return response as { success?: boolean; error?: string };
  }

  async adminGetUserInfo(name: string): Promise<Record<string, unknown>> {
    const response = await this.post<Record<string, unknown>>('AdminGetUserInfo', { name });
    return response as Record<string, unknown>;
  }

  async adminInterruptUser(name: string): Promise<{ success?: boolean; error?: string }> {
    const response = await this.post<{ success?: boolean; error?: string }>(
      'AdminInterruptUser',
      { name }
    );
    return response as { success?: boolean; error?: string };
  }

  async adminListRoles(): Promise<Record<string, unknown>> {
    const response = await this.post<Record<string, unknown>>('AdminListRoles', {});
    return response as Record<string, unknown>;
  }

  async adminAddRole(name: string): Promise<{ success?: boolean; error?: string }> {
    const response = await this.post<{ success?: boolean; error?: string }>('AdminAddRole', {
      name,
    });
    return response as { success?: boolean; error?: string };
  }

  async adminEditRole(params: {
    name: string;
    description: string;
    max_outpath_depth: number;
    max_t2i_simultaneous: number;
    allow_unsafe_outpaths: boolean;
    model_whitelist: string;
    model_blacklist: string;
    permissions: string[];
  }): Promise<{ success?: boolean; error?: string }> {
    const response = await this.post<{ success?: boolean; error?: string }>('AdminEditRole', params);
    return response as { success?: boolean; error?: string };
  }

  async adminDeleteRole(name: string): Promise<{ success?: boolean; error?: string }> {
    const response = await this.post<{ success?: boolean; error?: string }>(
      'AdminDeleteRole',
      { name }
    );
    return response as { success?: boolean; error?: string };
  }

  async adminListPermissions(): Promise<Record<string, unknown>> {
    const response = await this.post<Record<string, unknown>>('AdminListPermissions', {});
    return response as Record<string, unknown>;
  }

  // === ADMIN ENDPOINTS ===

  async shutdownServer(): Promise<void> {
    this.log('info', 'Sending shutdown request...');
    await this.post('ShutdownServer', {});
  }

  // === COMFYUI WORKFLOW ENDPOINTS ===

  /**
   * List all saved ComfyUI custom workflows
   */
  async listComfyWorkflows(): Promise<ComfyWorkflowInfo[]> {
    const response = await this.post<{ workflows: ComfyWorkflowInfo[] }>('ComfyListWorkflows', {});
    if ('workflows' in response) {
      return response.workflows;
    }
    return [];
  }

  /**
   * Get a specific ComfyUI workflow by name
   */
  async getComfyWorkflow(name: string): Promise<ComfyWorkflowData | null> {
    const response = await this.post<{ result: ComfyWorkflowData } | APIError>(
      'ComfyReadWorkflow',
      { name }
    );
    if ('result' in response) {
      return response.result;
    }
    return null;
  }

  /**
   * Save a ComfyUI workflow
   */
  async saveComfyWorkflow(params: {
    name: string;
    workflow: string;
    prompt: string;
    custom_params?: string;
    param_values?: string;
    image?: string;
    description?: string;
    enable_in_simple?: boolean;
    replace?: string;
  }): Promise<boolean> {
    const response = await this.post<{ success: boolean } | APIError>('ComfySaveWorkflow', params);
    return 'success' in response && response.success;
  }

  /**
   * Delete a saved ComfyUI workflow
   */
  async deleteComfyWorkflow(name: string): Promise<boolean> {
    const response = await this.post<{ success: boolean } | APIError>('ComfyDeleteWorkflow', {
      name,
    });
    return 'success' in response && response.success;
  }

  /**
   * Get a generated ComfyUI workflow from generation parameters (Import from Generate)
   */
  async getGeneratedWorkflow(params: GenerateParams): Promise<string | null> {
    const response = await this.post<{ workflow: string } | APIError>(
      'ComfyGetGeneratedWorkflow',
      params
    );
    if ('workflow' in response) {
      return response.workflow;
    }
    return null;
  }

  async comfyEnsureRefreshable(): Promise<{ success?: boolean; error?: string }> {
    const response = await this.post<{ success?: boolean; error?: string }>('ComfyEnsureRefreshable', {});
    return response as { success?: boolean; error?: string };
  }

  async comfyGetNodeTypesForBackend(
    backend: number
  ): Promise<{ node_types?: string[]; error?: string }> {
    const response = await this.post<{ node_types?: string[]; error?: string }>(
      'ComfyGetNodeTypesForBackend',
      { backend }
    );
    return response as { node_types?: string[]; error?: string };
  }

  async comfyInstallFeatures(
    features: string
  ): Promise<{ success?: boolean; installed?: string[]; error?: string }> {
    const response = await this.post<{ success?: boolean; installed?: string[]; error?: string }>(
      'ComfyInstallFeatures',
      { features }
    );
    return response as { success?: boolean; installed?: string[]; error?: string };
  }

  async getKohyaStatus(): Promise<KohyaStatusResponse> {
    return this.getJson<KohyaStatusResponse>('/api/kohya/status');
  }

  async getKohyaTrainingTemplate(): Promise<KohyaTrainingTemplate> {
    return this.getJson<KohyaTrainingTemplate>('/api/kohya/training-template');
  }

  async listKohyaDatasets(): Promise<KohyaDatasetInfo[]> {
    const response = await this.getJson<KohyaDatasetInfo[]>('/api/kohya/datasets');
    return Array.isArray(response) ? response : [];
  }

  async listKohyaTrainedLoras(): Promise<KohyaTrainedLoraInfo[]> {
    const response = await this.getJson<KohyaTrainedLoraInfo[]>('/api/kohya/trained-loras');
    return Array.isArray(response) ? response : [];
  }

  async listLoraProjects(): Promise<LoraProjectSummary[]> {
    const response = await this.post<{ projects?: LoraProjectSummary[] } | APIError>('ListLoraProjects', {});
    if ('projects' in response && Array.isArray(response.projects)) {
      return response.projects;
    }
    throw new Error((response as APIError).error || 'Failed to list LoRA projects');
  }

  async getLoraProject(characterId: string): Promise<LoraProject> {
    const response = await this.post<{ project?: LoraProject } | APIError>('GetLoraProject', {
      character_id: characterId,
    });
    if ('project' in response && response.project) {
      return response.project;
    }
    throw new Error((response as APIError).error || 'Failed to load LoRA project');
  }

  async saveLoraProject(params: {
    character_id: string;
    reference_image: string;
    base_prompt: string;
    variations: Record<string, string[]>;
    settings: Record<string, unknown>;
  }): Promise<LoraProject> {
    const response = await this.post<{ project?: LoraProject } | APIError>('SaveLoraProject', params);
    if ('project' in response && response.project) {
      return response.project;
    }
    throw new Error((response as APIError).error || 'Failed to save LoRA project');
  }

  async generateLoraBatchPlan(params: {
    character_id: string;
    reference_image: string;
    base_prompt: string;
    variations: Record<string, string[]>;
    settings: Record<string, unknown>;
  }): Promise<{ batch_id: string; job_count: number; jobs: LoraBatchPlanJob[]; workflow?: Record<string, unknown> }> {
    const response = await this.post<{ batch_id?: string; job_count?: number; jobs?: LoraBatchPlanJob[]; workflow?: Record<string, unknown> } | APIError>('GenerateLoraBatchPlan', params);
    if ('batch_id' in response && typeof response.batch_id === 'string') {
      return {
        batch_id: response.batch_id,
        job_count: response.job_count || 0,
        jobs: response.jobs || [],
        workflow: response.workflow,
      };
    }
    throw new Error((response as APIError).error || 'Failed to generate LoRA batch plan');
  }

  async listLoraBatchManifests(characterId: string): Promise<LoraBatchManifestSummary[]> {
    const response = await this.post<{ manifests?: LoraBatchManifestSummary[] } | APIError>('ListLoraBatchManifests', {
      character_id: characterId,
    });
    if ('manifests' in response && Array.isArray(response.manifests)) {
      return response.manifests;
    }
    throw new Error((response as APIError).error || 'Failed to list LoRA batch manifests');
  }

  async createLoraDatasetRecordsFromBatchPlan(params: {
    character_id: string;
    batch_id: string;
    overwrite?: boolean;
  }): Promise<{ created: number; updated: number }> {
    const response = await this.post<{ created?: number; updated?: number } | APIError>('CreateLoraDatasetRecordsFromBatchPlan', params);
    if (!('error' in response)) {
      const data = response as { created?: number; updated?: number };
      return {
        created: data.created || 0,
        updated: data.updated || 0,
      };
    }
    throw new Error(response.error || 'Failed to create dataset records');
  }

  async executeLoraBatchPlan(params: {
    character_id: string;
    batch_id: string;
    max_jobs?: number;
    workflow_mode?: string;
    workflow_name?: string;
  }): Promise<LoraBatchExecutionStatus> {
    const response = await this.post<{ execution?: LoraBatchExecutionStatus } | APIError>('ExecuteLoraBatchPlan', params, { timeout: 120000 });
    if ('execution' in response && response.execution) {
      return response.execution;
    }
    throw new Error((response as APIError).error || 'Failed to execute LoRA batch plan');
  }

  async getLoraBatchExecutionStatus(params: {
    character_id: string;
    batch_id: string;
  }): Promise<LoraBatchExecutionStatus> {
    const response = await this.post<{ execution?: LoraBatchExecutionStatus } | APIError>('GetLoraBatchExecutionStatus', params);
    if ('execution' in response && response.execution) {
      return response.execution;
    }
    throw new Error((response as APIError).error || 'Failed to load LoRA batch execution status');
  }

  async listLoraDataset(characterId: string): Promise<LoraDatasetItem[]> {
    const response = await this.post<{ items?: LoraDatasetItem[] } | APIError>('ListLoraDataset', {
      character_id: characterId,
    });
    if ('items' in response && Array.isArray(response.items)) {
      return response.items;
    }
    throw new Error((response as APIError).error || 'Failed to list LoRA dataset');
  }

  async approveLoraDatasetImage(params: {
    character_id: string;
    image_id: string;
    approved: boolean;
  }): Promise<LoraDatasetItem> {
    const response = await this.post<{ item?: LoraDatasetItem } | APIError>('ApproveLoraDatasetImage', params);
    if ('item' in response && response.item) {
      return response.item;
    }
    throw new Error((response as APIError).error || 'Failed to update LoRA dataset item');
  }

  async rejectLoraDatasetImage(params: {
    character_id: string;
    image_id: string;
  }): Promise<LoraDatasetItem | null> {
    const response = await this.post<{ item?: LoraDatasetItem } | APIError>('RejectLoraDatasetImage', params);
    if (!('error' in response)) {
      const data = response as { item?: LoraDatasetItem };
      return data.item || null;
    }
    throw new Error(response.error || 'Failed to reject LoRA dataset item');
  }

  async listTrainableLoraProjects(): Promise<LoraTrainableProject[]> {
    const response = await this.post<{ projects?: LoraTrainableProject[] } | APIError>('ListTrainableLoraProjects', {});
    if ('projects' in response && Array.isArray(response.projects)) {
      return response.projects;
    }
    throw new Error((response as APIError).error || 'Failed to list trainable LoRA projects');
  }

  async prepareLoraTraining(params: {
    character_id: string;
    base_model?: string;
    epochs?: number;
    dim?: number;
    alpha?: number;
    batch_size?: number;
    learning_rate?: number;
    resolution?: string;
    mixed_precision?: string;
    use_8bit_adam?: boolean;
    gradient_checkpointing?: boolean;
    xformers?: boolean;
    output_name?: string;
  }): Promise<{ job: LoraTrainingJob; launch_preview: Record<string, unknown> }> {
    const response = await this.post<{ job?: LoraTrainingJob; launch_preview?: Record<string, unknown> } | APIError>('PrepareLoraTraining', params);
    if ('job' in response && response.job) {
      return {
        job: response.job,
        launch_preview: response.launch_preview || {},
      };
    }
    throw new Error((response as APIError).error || 'Failed to prepare LoRA training');
  }

  async startLoraTraining(jobId?: string): Promise<{ started?: boolean; already_running?: boolean; process_id?: number; job?: LoraTrainingJob; status?: LoraTrainingStatus; launch_preview?: Record<string, unknown> }> {
    const response = await this.post<{ started?: boolean; already_running?: boolean; process_id?: number; job?: LoraTrainingJob; status?: LoraTrainingStatus; launch_preview?: Record<string, unknown> } | APIError>('StartLoraTraining', {
      job_id: jobId,
    }, { timeout: 30000 });
    if (!('error' in response)) {
      return response as { started?: boolean; already_running?: boolean; process_id?: number; job?: LoraTrainingJob; status?: LoraTrainingStatus; launch_preview?: Record<string, unknown> };
    }
    throw new Error(response.error || 'Failed to start LoRA training');
  }

  async interruptLoraTraining(jobId?: string): Promise<{ interrupted?: boolean; status?: LoraTrainingStatus }> {
    const response = await this.post<{ interrupted?: boolean; status?: LoraTrainingStatus } | APIError>('InterruptLoraTraining', {
      job_id: jobId,
    });
    if (!('error' in response)) {
      return response as { interrupted?: boolean; status?: LoraTrainingStatus };
    }
    throw new Error(response.error || 'Failed to interrupt LoRA training');
  }

  async getLoraTrainingStatus(): Promise<{ status: LoraTrainingStatus | null; recent_jobs: LoraTrainingJob[]; history_count: number; trainable_projects: LoraTrainableProject[] }> {
    const response = await this.post<{ status?: LoraTrainingStatus; recent_jobs?: LoraTrainingJob[]; history_count?: number; trainable_projects?: LoraTrainableProject[] } | APIError>('GetLoraTrainingStatus', {});
    if (!('error' in response)) {
      const data = response as { status?: LoraTrainingStatus; recent_jobs?: LoraTrainingJob[]; history_count?: number; trainable_projects?: LoraTrainableProject[] };
      return {
        status: data.status || null,
        recent_jobs: data.recent_jobs || [],
        history_count: data.history_count || 0,
        trainable_projects: data.trainable_projects || [],
      };
    }
    throw new Error(response.error || 'Failed to load LoRA training status');
  }

  async listLoraTrainingHistory(characterId?: string, limit: number = 20): Promise<LoraTrainingJob[]> {
    const response = await this.post<{ jobs?: LoraTrainingJob[] } | APIError>('ListLoraTrainingHistory', {
      character_id: characterId,
      limit,
    });
    if ('jobs' in response && Array.isArray(response.jobs)) {
      return response.jobs;
    }
    throw new Error((response as APIError).error || 'Failed to list LoRA training history');
  }

  doTensorRTCreate(
    params: {
      model: string;
      aspect: string;
      aspectRange: string;
      optBatch: number;
      maxBatch: number;
    },
    callbacks: {
      onMessage?: (data: WebSocketMessage) => void;
      onError?: (error: string) => void;
      onComplete?: () => void;
    }
  ): WebSocket {
    return this.createWebSocket(
      'DoTensorRTCreateWS',
      params,
      (data) => {
        if (data.error) {
          callbacks.onError?.(data.error);
          return;
        }
        callbacks.onMessage?.(data);
      },
      (error) => callbacks.onError?.(`WebSocket error: ${error}`),
      callbacks.onComplete
    );
  }

  doLoraExtraction(
    params: {
      baseModel: string;
      otherModel: string;
      rank: number;
      outName: string;
    },
    callbacks: {
      onMessage?: (data: WebSocketMessage) => void;
      onError?: (error: string) => void;
      onComplete?: () => void;
    }
  ): WebSocket {
    return this.createWebSocket(
      'DoLoraExtractionWS',
      params,
      (data) => {
        if (data.error) {
          callbacks.onError?.(data.error);
          return;
        }
        callbacks.onMessage?.(data);
      },
      (error) => callbacks.onError?.(`WebSocket error: ${error}`),
      callbacks.onComplete
    );
  }

  // === MODEL DOWNLOAD ENDPOINTS ===

  /**
   * Forward a metadata request to external APIs (e.g., CivitAI API)
   * Used to fetch model info from CivitAI URLs
   */
  async forwardMetadataRequest(url: string): Promise<any | null> {
    const response = await this.post<{ response: any; error?: string } | APIError>('ForwardMetadataRequest', {
      url,
    }, { timeout: 30000 });
    if ('response' in response) {
      return response.response;
    }
    if ('error' in response && response.error) {
      return { error: response.error };
    }
    return null;
  }

  async forwardMetadataImageRequest(url: string): Promise<string | null> {
    const response = await this.forwardMetadataImageRequestDetailed(url);
    return response.image;
  }

  async forwardMetadataImageRequestDetailed(url: string): Promise<{ image: string | null; error: string | null }> {
    const response = await this.post<{ image?: string; error?: string }>('ForwardMetadataImageRequest', {
      url,
    }, { timeout: 15000 });
    if ('image' in response && typeof response.image === 'string' && response.image.startsWith('data:image/')) {
      return { image: response.image, error: null };
    }
    if ('error' in response && response.error) {
      this.log('error', `ForwardMetadataImageRequest failed for ${url}: ${response.error}`);
      return { image: null, error: response.error };
    }
    return { image: null, error: 'No image data returned by backend proxy.' };
  }

  async setModelPreviewFromMetadataUrl(params: {
    model: string;
    image_url: string;
    subtype?: string;
    preview_image_metadata?: string | null;
  }): Promise<{ success?: boolean; error?: string }> {
    const response = await this.post<{ success?: boolean; error?: string }>(
      'SetModelPreviewFromMetadataUrl',
      params,
      { timeout: 20000 }
    );
    if ('error' in response && response.error) {
      this.log('error', `SetModelPreviewFromMetadataUrl failed for ${params.image_url}: ${response.error}`);
    }
    return response as { success?: boolean; error?: string };
  }

  async listModelNamesFromRefresh(subtype: string): Promise<string[]> {
    const response = await this.post<any>('TriggerRefresh', { strong: false });
    if (!response || !('models' in response) || !response.models) {
      return [];
    }
    const modelSet = response.models[subtype];
    if (!Array.isArray(modelSet)) {
      return [];
    }
    return modelSet
      .map((entry: unknown) => {
        if (Array.isArray(entry) && typeof entry[0] === 'string') {
          return entry[0];
        }
        if (typeof entry === 'string') {
          return entry;
        }
        return '';
      })
      .filter((name: string) => !!name && name !== '(None)');
  }

  /**
   * Download a model from URL with WebSocket progress updates
   */
  downloadModel(
    params: {
      url: string;
      type: string; // 'Stable-Diffusion', 'LoRA', 'VAE', 'Embedding', 'ControlNet', 'Clip', 'ClipVision'
      name: string;
      metadata?: string; // JSON string of metadata
    },
    callbacks: {
      onProgress?: (data: {
        overall_percent: number;
        current_percent: number;
        per_second: number;
      }) => void;
      onSuccess?: () => void;
      onError?: (error: string) => void;
      onSocket?: (socket: WebSocket) => void;
    }
  ): WebSocket {
    return this.createWebSocket(
      'DoModelDownloadWS',
      params,
      (data) => {
        if (data.error) {
          this.log('error', `Download error: ${data.error}`);
          callbacks.onError?.(data.error);
          return;
        }
        if (data.overall_percent !== undefined) {
          callbacks.onProgress?.({
            overall_percent: data.overall_percent,
            current_percent: data.current_percent || 0,
            per_second: data.per_second || 0,
          });
        }
        if (data.success) {
          this.log('info', 'Model download complete');
          callbacks.onSuccess?.();
        }
      },
      (error) => {
        callbacks.onError?.(`WebSocket error: ${error}`);
      },
      undefined
    );
  }

  /**
   * Get list of available model folders for save location
   */
  async listModelFolders(subtype: string = 'Stable-Diffusion'): Promise<string[]> {
    const response = await this.post<{ files: any[]; folders: string[] }>('ListModels', {
      path: '',
      depth: 10,
      subtype: subtype,
    });

    if (
      'folders' in response &&
      Array.isArray(response.folders) &&
      response.folders.length > 0
    ) {
      return response.folders;
    }

    // Extract folder paths from file names as fallback when folders are missing or empty.
    if ('files' in response && Array.isArray(response.files)) {
      const folderSet = new Set<string>();
      for (const file of response.files) {
        const parts = (file.name || '').split(/[\\/]/);
        if (parts.length > 1) {
          for (let i = 1; i < parts.length; i++) {
            folderSet.add(parts.slice(0, i).join('/'));
          }
        }
      }
      return Array.from(folderSet).sort();
    }

    return [];
  }

  async listModelFolderCandidates(subtype: string = 'Stable-Diffusion'): Promise<string[]> {
    const response = await this.post<{ files: any[]; folders: string[] }>('ListModels', {
      path: '',
      depth: 20,
      subtype,
    });

    const folderSet = new Set<string>();

    if ('folders' in response && Array.isArray(response.folders)) {
      for (const folder of response.folders) {
        const normalized = (folder || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim();
        if (normalized) {
          folderSet.add(normalized);
        }
      }
    }

    if ('files' in response && Array.isArray(response.files)) {
      for (const file of response.files) {
        const rawName = typeof file?.name === 'string' ? file.name : '';
        if (!rawName) continue;
        const parts = rawName.split(/[\\/]/).filter(Boolean);
        if (parts.length <= 1) continue;
        for (let i = 1; i < parts.length; i++) {
          folderSet.add(parts.slice(0, i).join('/'));
        }
      }
    }

    return Array.from(folderSet).sort();
  }

  async listModelFoldersAtPath(
    subtype: string = 'Stable-Diffusion',
    path: string = '',
    depth: number = 20
  ): Promise<string[]> {
    const response = await this.post<{ files: any[]; folders: string[] }>('ListModels', {
      path,
      depth,
      subtype,
    });

    const folderSet = new Set<string>();
    if ('folders' in response && Array.isArray(response.folders)) {
      for (const folder of response.folders) {
        const normalized = (folder || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim();
        if (normalized) {
          folderSet.add(normalized);
        }
      }
    }

    if ('files' in response && Array.isArray(response.files)) {
      for (const file of response.files) {
        const rawName = typeof file?.name === 'string' ? file.name : '';
        if (!rawName) continue;
        const filePath = rawName.replace(/\\/g, '/');
        const relative = path
          ? filePath.toLowerCase().startsWith(path.toLowerCase().replace(/\\/g, '/') + '/')
            ? filePath.slice(path.length + 1)
            : filePath
          : filePath;
        const parts = relative.split('/').filter(Boolean);
        if (parts.length <= 1) continue;
        for (let i = 1; i < parts.length; i++) {
          folderSet.add(parts.slice(0, i).join('/'));
        }
      }
    }

    return Array.from(folderSet).sort();
  }

  /**
   * Trigger a model list refresh after download completes
   */
  async triggerModelRefresh(): Promise<void> {
    await this.post('TriggerRefresh', { strong: true });
    this.triggerRefreshCache = null;
    this.triggerRefreshPromise = null;
  }

  async deleteWildcard(card: string): Promise<{ success?: boolean; error?: string }> {
    const response = await this.post<{ success?: boolean; error?: string }>('DeleteWildcard', {
      card,
    });
    return response as { success?: boolean; error?: string };
  }

  async editWildcard(params: {
    card: string;
    options: string;
    preview_image?: string | null;
    preview_image_metadata?: string | null;
  }): Promise<{ success?: boolean; error?: string }> {
    const response = await this.post<{ success?: boolean; error?: string }>('EditWildcard', params);
    return response as { success?: boolean; error?: string };
  }

  async testPromptFill(prompt: string): Promise<{ result?: string; error?: string }> {
    const response = await this.post<{ result?: string; error?: string }>('TestPromptFill', {
      prompt,
    });
    return response as { result?: string; error?: string };
  }

  async getModelHeaders(
    model: string,
    subtype: string = 'Stable-Diffusion'
  ): Promise<Record<string, unknown>> {
    const response = await this.post<Record<string, unknown>>('GetModelHeaders', {
      model,
      subtype,
    });
    return response as Record<string, unknown>;
  }

  async getModelHash(
    modelName: string,
    subtype: string = 'Stable-Diffusion'
  ): Promise<Record<string, unknown>> {
    const response = await this.post<Record<string, unknown>>('GetModelHash', {
      modelName,
      subtype,
    });
    return response as Record<string, unknown>;
  }

  // === CACHE MANAGEMENT ENDPOINTS ===

  /**
   * Get current cache statistics (prompt cache, init image cache, model cache)
   */
  async getCacheStatus(): Promise<{
    prompt_cache: { count: number; max_entries: number; total_hits: number };
    init_image_cache: { count: number; max_entries: number; total_hits: number };
    model_cache: { loaded_models: number };
  }> {
    const response = await this.post<any>('GetCacheStatus', {});
    return response;
  }

  /**
   * Clear specific cache types
   * @param cacheType - 'prompt', 'initimage', or 'all'
   */
  async clearCache(cacheType: 'prompt' | 'initimage' | 'all' = 'all'): Promise<{
    success: boolean;
    cleared_count: number;
    cache_type: string;
  }> {
    const response = await this.post<any>('ClearCache', { cache_type: cacheType });
    return response;
  }

  /**
   * Get detailed prompt cache statistics
   */
  async getPromptCacheStats(limit: number = 20): Promise<{
    total_entries: number;
    top_entries: Array<{
      hash: string;
      prompt_preview: string;
      model: string;
      hit_count: number;
      last_accessed: number;
    }>;
  }> {
    const response = await this.post<any>('GetPromptCacheStats', { limit });
    return response;
  }

  /**
   * Add a prompt to the backend cache (called after generation)
   */
  async addPromptToCache(
    prompt: string,
    model: string,
    negativePrompt?: string
  ): Promise<{
    success: boolean;
    hash: string;
    cached: boolean;
    hit_count: number;
  }> {
    const response = await this.post<any>('AddPromptToCache', {
      prompt,
      model,
      negative_prompt: negativePrompt || '',
    });
    return response;
  }

  /**
   * Check if a prompt is cached and get similarity info
   */
  async checkPromptCache(
    prompt: string,
    model: string
  ): Promise<{
    found: boolean;
    exact_match?: boolean;
    hash?: string;
    hit_count?: number;
    best_similarity?: number;
    best_match_hash?: string;
    best_match_preview?: string;
    similar_count?: number;
    can_quick_generate?: boolean;
  }> {
    const response = await this.post<any>('CheckPromptCache', { prompt, model });
    return response;
  }

  /**
   * Prune old cache entries
   * @param maxAgeMs - Maximum age in milliseconds (default: 24 hours)
   */
  async pruneCaches(maxAgeMs: number = 86400000): Promise<{
    pruned_prompts: number;
    pruned_images: number;
    remaining_prompts: number;
    remaining_images: number;
  }> {
    const response = await this.post<any>('PruneCaches', { max_age_ms: maxAgeMs });
    return response;
  }
}

// Export singleton instance
export const swarmClient = new SwarmUIClient();
