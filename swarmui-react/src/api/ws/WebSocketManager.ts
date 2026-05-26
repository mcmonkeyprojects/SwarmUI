/**
 * Centralized WebSocket Manager
 * 
 * Features:
 * - Connection pooling (max connections per endpoint)
 * - Automatic reconnection with exponential backoff
 * - Event-based message dispatching
 * - Connection health monitoring
 */

import type {
    WSManagerConfig,
    ConnectionState,
    BackendWSMessage,
    GenerationImageData,
    ModelProgressData,
    DownloadProgressData,
    WSEventType,
    WSCallback,
} from './types';
import { EventEmitter } from './EventEmitter';
import { recordWSReconnect, recordWSSessionRecovery } from '../../utils/perfDiagnostics';
import { clientLogger } from '../../utils/clientLogger';
import {
    generationPreviewFromProgress,
    normalizeGenerationProgress,
} from '../../utils/generationProgress';

// ============================================================================
// Constants
// ============================================================================

type WSManagerResolvedConfig = Omit<Required<WSManagerConfig>, 'refreshSession'> & {
    refreshSession?: WSManagerConfig['refreshSession'];
};

const DEFAULT_CONFIG: Omit<WSManagerResolvedConfig, 'baseUrl' | 'sessionId'> = {
    maxReconnectAttempts: 5,
    reconnectBaseDelay: 1000,
    reconnectMaxDelay: 30000,
    connectionTimeout: 10000,
    debug: false,
    enableHeartbeat: true,
    heartbeatInterval: 30000,
    heartbeatTimeout: 5000,
    maxSessionRecoveryAttempts: 1,
};

// Swarm generation sockets treat every message as request input, so app-level
// heartbeat payloads must not be sent on GenerateText2ImageWS.
const HEARTBEAT_SUPPORTED_ENDPOINTS = new Set<string>();
const HIDDEN_HEARTBEAT_INTERVAL_MULTIPLIER = 4;
const HIDDEN_RECONNECT_DELAY_MULTIPLIER = 2;

function readFiniteNumber(value: unknown): number | undefined {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

interface GenerationConnectionState {
    hasProgress: boolean;
    hasImage: boolean;
    requestId: string | null;
    generationId: string | null;
    messageSequence: number;
}

interface PendingReconnect {
    endpoint: string;
    params: Record<string, unknown>;
    attempt: number;
}

// ============================================================================
// WebSocket Manager
// ============================================================================

export class WebSocketManager {
    private config: WSManagerResolvedConfig;
    private connections: Map<string, WebSocket> = new Map();
    private connectionStates: Map<string, ConnectionState> = new Map();
    private eventEmitter: EventEmitter;
    private reconnectTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
    private heartbeatTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
    private pongTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
    private sessionRecoveryAttempts: Map<string, number> = new Map();
    private recoveringConnections: Set<string> = new Set();
    private generationStates: Map<string, GenerationConnectionState> = new Map();
    private pendingReconnects: Map<string, PendingReconnect> = new Map();
    private isAppVisible = typeof document === 'undefined' ? true : document.visibilityState !== 'hidden';
    private isNetworkOnline = typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean'
        ? true
        : navigator.onLine;
    private readonly handleVisibilityChange = () => {
        const nextVisibility = document.visibilityState !== 'hidden';
        if (this.isAppVisible === nextVisibility) {
            return;
        }
        this.isAppVisible = nextVisibility;
        this.log('debug', `App visibility changed: ${nextVisibility ? 'visible' : 'hidden'}`);
        if (this.isNetworkOnline) {
            this.restartHeartbeats();
        }
    };
    private readonly handleOnline = () => {
        if (this.isNetworkOnline) {
            return;
        }
        this.isNetworkOnline = true;
        this.log('info', 'Network restored, resuming websocket activity');
        this.restartHeartbeats();
        this.flushPendingReconnects();
    };
    private readonly handleOffline = () => {
        if (!this.isNetworkOnline) {
            return;
        }
        this.isNetworkOnline = false;
        this.log('info', 'Network offline, pausing websocket heartbeats and reconnects');
        this.stopAllHeartbeats();
    };

    constructor(config: WSManagerConfig) {
        this.config = {
            ...DEFAULT_CONFIG,
            ...config,
            baseUrl: config.baseUrl,
            sessionId: config.sessionId,
        };
        this.eventEmitter = new EventEmitter(this.config.debug);
        this.registerLifecycleListeners();

        if (this.config.debug) {
            this.log('info', 'WebSocketManager initialized', this.config);
        }
    }

    // ==========================================================================
    // Public API
    // ==========================================================================

    /**
     * Update session ID (e.g., after session refresh)
     */
    updateSessionId(sessionId: string): void {
        this.config.sessionId = sessionId;
    }

    dispose(): void {
        this.disconnectAll();
        this.unregisterLifecycleListeners();
    }

    /**
     * Connect to a WebSocket endpoint and send initial params
     */
    connect(
        endpoint: string,
        params: Record<string, unknown> = {},
        connectionId?: string
    ): string {
        const id = connectionId || `${endpoint}_${Date.now()}`;

        // Close existing connection if any
        this.disconnect(id);

        const url = `${this.config.baseUrl}/API/${endpoint}`;
        this.log('info', `Connecting: ${id} -> ${url}`);

        // Initialize connection state
        this.connectionStates.set(id, {
            status: 'connecting',
            endpoint,
            connectedAt: null,
            reconnectAttempts: 0,
            lastError: null,
            lastPingTime: null,
            lastPongTime: null,
            missedPongs: 0,
        });
        if (endpoint === 'GenerateText2ImageWS') {
            this.generationStates.set(id, {
                hasProgress: false,
                hasImage: false,
                requestId: null,
                generationId: null,
                messageSequence: 0,
            });
        }

        this.emitConnectionEvent(id, 'connecting');

        // Create WebSocket
        const socket = new WebSocket(url);
        this.connections.set(id, socket);

        // Connection timeout
        const timeoutId = setTimeout(() => {
            if (socket.readyState === WebSocket.CONNECTING) {
                this.log('error', `Connection timeout: ${id}`);
                this.updateConnectionState(id, {
                    status: 'error',
                    lastError: 'Connection timeout',
                });
                socket.close();
                this.emitEvent('error', endpoint, { error: 'Connection timeout' });
            }
        }, this.config.connectionTimeout);

        // Socket event handlers
        socket.onopen = () => {
            clearTimeout(timeoutId);
            this.log('info', `Connected: ${id}`);
            this.sessionRecoveryAttempts.set(id, 0);
            this.recoveringConnections.delete(id);

            this.updateConnectionState(id, {
                status: 'connected',
                connectedAt: Date.now(),
                reconnectAttempts: 0,
                lastError: null,
            });

            // Send initial params with session
            const payload: Record<string, unknown> = {
                session_id: this.config.sessionId,
                ...params,
            };

            if (endpoint === 'GenerateText2ImageWS') {
                const payloadModel = this.normalizeModelValue(payload.model);
                const payloadKeys = Object.keys(payload).sort();

                if (!payloadModel) {
                    this.log('error', `Generation payload missing model before send: ${id}`, {
                        payloadKeys,
                        rawModel: payload.model,
                    });
                    const genState = this.generationStates.get(id);
                    this.emitEvent('generation:error', endpoint, {
                        error: 'Model was missing in frontend payload before send.',
                        errorId: 'frontend_missing_model',
                        requestId: undefined,
                        generationId: genState?.generationId,
                        errorData: {
                            payloadKeys,
                            rawModel: payload.model ?? null,
                            connectionId: id,
                        },
                    });
                    this.updateConnectionState(id, {
                        status: 'error',
                        lastError: 'Missing model in payload',
                    });
                    socket.close();
                    return;
                }

                payload.model = payloadModel;
                this.log('info', `Generation payload preflight: ${id}`, {
                    model: payloadModel,
                    images: payload.images,
                    steps: payload.steps,
                    hasRefinerUpscale: payload.refinerupscale,
                    refinerUpscaleMethod: payload.refinerupscalemethod,
                });
            }

            if (this.config.debug) {
                this.log('debug', `Sending initial payload: ${id}`, payload);
            }

            socket.send(JSON.stringify(payload));
            const openGenState = endpoint === 'GenerateText2ImageWS' ? this.generationStates.get(id) : undefined;
            this.emitEvent('open', endpoint, { connectionId: id, generationId: openGenState?.generationId });

            // Start heartbeat monitoring only where backend supports ping/pong control messages.
            if (HEARTBEAT_SUPPORTED_ENDPOINTS.has(endpoint)) {
                this.startHeartbeat(id, socket);
            } else {
                this.stopHeartbeat(id);
            }
        };

        socket.onmessage = (event) => {
            try {
                const data: BackendWSMessage = JSON.parse(event.data);
                this.handleMessage(id, endpoint, data, params);
            } catch (error) {
                this.log('error', `Parse error: ${id}`, error);
            }
        };

        socket.onerror = (error) => {
            clearTimeout(timeoutId);
            this.log('error', `Socket error: ${id}`, error);
            this.updateConnectionState(id, {
                status: 'error',
                lastError: 'WebSocket error',
            });
            this.emitEvent('error', endpoint, { error: 'WebSocket error' });
        };

        socket.onclose = (event) => {
            clearTimeout(timeoutId);

            const state = this.connectionStates.get(id);
            const wasConnected = state?.status === 'connected';

            this.log('info', `Closed: ${id} (code=${event.code}, clean=${event.wasClean})`);
            this.stopHeartbeat(id);

            // Only attempt reconnect for unexpected closures
            if (!event.wasClean && wasConnected) {
                this.attemptReconnect(id, endpoint, params);
            } else {
                this.updateConnectionState(id, { status: 'disconnected' });
                this.emitEvent('close', endpoint, { connectionId: id, code: event.code });
            }

            this.connections.delete(id);
            this.recoveringConnections.delete(id);
        };

        return id;
    }

    /**
     * Disconnect a specific connection
     */
    disconnect(connectionId: string): void {
        const socket = this.connections.get(connectionId);
        if (socket) {
            this.log('info', `Disconnecting: ${connectionId}`);
            socket.close();
            this.connections.delete(connectionId);
        }

        // Clear any pending reconnect
        const timer = this.reconnectTimers.get(connectionId);
        if (timer) {
            clearTimeout(timer);
            this.reconnectTimers.delete(connectionId);
        }

        // Stop heartbeat
        this.stopHeartbeat(connectionId);
        this.pendingReconnects.delete(connectionId);

        this.connectionStates.delete(connectionId);
        this.sessionRecoveryAttempts.delete(connectionId);
        this.recoveringConnections.delete(connectionId);
        this.generationStates.delete(connectionId);
    }

    /**
     * Disconnect all connections
     */
    disconnectAll(): void {
        for (const id of this.connections.keys()) {
            this.disconnect(id);
        }
        this.pendingReconnects.clear();
    }

    /**
     * Subscribe to events
     */
    on<T = unknown>(eventType: WSEventType | '*', callback: WSCallback<T>, once = false): () => void {
        return this.eventEmitter.on(eventType, callback, once);
    }

    once<T = unknown>(eventType: WSEventType | '*', callback: WSCallback<T>): () => void {
        return this.eventEmitter.once(eventType, callback);
    }

    /**
     * Get connection state
     */
    getConnectionState(connectionId: string): ConnectionState | undefined {
        return this.connectionStates.get(connectionId);
    }

    /**
     * Get all connection states
     */
    getAllConnectionStates(): Map<string, ConnectionState> {
        return new Map(this.connectionStates);
    }

    // ==========================================================================
    // High-Level Generation API
    // ==========================================================================

    /**
     * Start image generation with reactive events
     */
    startGeneration(params: Record<string, unknown>, generationId?: string): string {
        const normalizedParams = this.normalizeGenerationParams(params);
        const connectionId = this.connect('GenerateText2ImageWS', normalizedParams, 'generation');
        // Attach client-side generationId nonce to the connection state
        if (generationId) {
            const genState = this.generationStates.get(connectionId);
            if (genState) {
                genState.generationId = generationId;
            }
        }
        this.emitEvent('generation:start', 'GenerateText2ImageWS', { params: normalizedParams, generationId });
        clientLogger.info('ws', 'Generation WebSocket connected', {
            metadata: { connectionId, generationId },
            correlationId: generationId,
        });
        return connectionId;
    }

    /**
     * Stop current generation
     */
    stopGeneration(): void {
        clientLogger.info('ws', 'Generation WebSocket disconnected');
        this.disconnect('generation');
    }

    /**
     * Load model with progress
     */
    loadModel(modelName: string): string {
        for (const id of Array.from(this.connections.keys())) {
            if (id.startsWith('model_') && id !== `model_${modelName}`) {
                this.disconnect(id);
            }
        }
        return this.connect('SelectModelWS', { model: modelName }, `model_${modelName}`);
    }

    /**
     * Start model download
     */
    startDownload(params: {
        url: string;
        type: string;
        name: string;
        metadata?: string;
    }): string {
        const downloadId = `download_${Date.now()}`;
        return this.connect('DoModelDownloadWS', params, downloadId);
    }

    // ==========================================================================
    // Heartbeat Methods
    // ==========================================================================

    /**
     * Start heartbeat monitoring for a connection
     */
    private startHeartbeat(connectionId: string, socket: WebSocket): void {
        if (!this.config.enableHeartbeat || !this.isNetworkOnline) return;

        this.stopHeartbeat(connectionId);
        this.scheduleHeartbeat(connectionId, socket);
        this.log('debug', `Heartbeat started: ${connectionId}`);
    }

    /**
     * Stop heartbeat monitoring for a connection
     */
    private stopHeartbeat(connectionId: string): void {
        const timer = this.heartbeatTimers.get(connectionId);
        if (timer) {
            clearTimeout(timer);
            this.heartbeatTimers.delete(connectionId);
        }

        const timeout = this.pongTimeouts.get(connectionId);
        if (timeout) {
            clearTimeout(timeout);
            this.pongTimeouts.delete(connectionId);
        }
    }

    /**
     * Send ping and set up pong timeout
     */
    private sendPing(connectionId: string, socket: WebSocket): void {
        const pingTime = Date.now();

        this.updateConnectionState(connectionId, { lastPingTime: pingTime });

        // Send ping message
        try {
            socket.send(JSON.stringify({ type: 'ping', timestamp: pingTime }));
            this.log('debug', `Ping sent: ${connectionId}`);
        } catch (error) {
            this.log('error', `Failed to send ping: ${connectionId}`, error);
            return;
        }

        // Set up timeout for pong response
        const timeout = setTimeout(() => {
            this.handlePongTimeout(connectionId);
        }, this.config.heartbeatTimeout);

        this.pongTimeouts.set(connectionId, timeout);
    }

    private scheduleHeartbeat(connectionId: string, socket: WebSocket): void {
        const timer = setTimeout(() => {
            this.heartbeatTimers.delete(connectionId);

            if (socket.readyState !== WebSocket.OPEN) {
                this.stopHeartbeat(connectionId);
                return;
            }

            if (!this.isNetworkOnline) {
                this.startHeartbeat(connectionId, socket);
                return;
            }

            this.sendPing(connectionId, socket);
            this.scheduleHeartbeat(connectionId, socket);
        }, this.getHeartbeatInterval());

        this.heartbeatTimers.set(connectionId, timer);
    }

    private getHeartbeatInterval(): number {
        if (this.isAppVisible) {
            return this.config.heartbeatInterval;
        }
        return this.config.heartbeatInterval * HIDDEN_HEARTBEAT_INTERVAL_MULTIPLIER;
    }

    /**
     * Handle pong response from server
     */
    private handlePong(connectionId: string): void {
        const pongTime = Date.now();
        const state = this.connectionStates.get(connectionId);

        // Clear pong timeout
        const timeout = this.pongTimeouts.get(connectionId);
        if (timeout) {
            clearTimeout(timeout);
            this.pongTimeouts.delete(connectionId);
        }

        // Calculate latency
        const latency = state?.lastPingTime ? pongTime - state.lastPingTime : 0;
        const wasDegraded = state?.missedPongs && state.missedPongs > 0;

        this.updateConnectionState(connectionId, {
            lastPongTime: pongTime,
            missedPongs: 0,
        });

        this.log('debug', `Pong received: ${connectionId} (latency: ${latency}ms)`);

        // Emit healthy event if recovering from degraded state
        if (wasDegraded && state) {
            this.emitEvent('connection:healthy', state.endpoint, {
                connectionId,
                latency,
                reason: 'heartbeat_restored',
            });
        }
    }

    /**
     * Handle missed pong response
     */
    private handlePongTimeout(connectionId: string): void {
        const state = this.connectionStates.get(connectionId);
        if (!state) return;

        const missedPongs = (state.missedPongs || 0) + 1;
        const now = Date.now();
        const hasEverReceivedPong = typeof state.lastPongTime === 'number' && state.lastPongTime > 0;
        // Some backends don't implement app-level ping/pong on generation sockets.
        // If we never received a single pong, treat heartbeat as unsupported and disable it.
        if (!hasEverReceivedPong) {
            this.log('info', `Heartbeat unsupported for ${connectionId}, disabling heartbeat monitor for this connection`);
            this.updateConnectionState(connectionId, { missedPongs: 0, lastPingTime: null });
            this.stopHeartbeat(connectionId);
            return;
        }
        const sinceLastPongMs = now - (state.lastPongTime as number);
        const reason = 'Heartbeat response timed out';

        this.updateConnectionState(connectionId, { missedPongs });

        this.log('info', `Pong timeout: ${connectionId} (missed: ${missedPongs}, reason: ${reason})`);

        if (missedPongs === 1) {
            this.emitEvent('connection:degraded', state.endpoint, {
                connectionId,
                missedPongs,
                reason,
                sinceLastPongMs,
            });
        } else if (missedPongs >= 3) {
            this.emitEvent('connection:unhealthy', state.endpoint, {
                connectionId,
                missedPongs,
                reason,
                sinceLastPongMs,
            });

            // Force reconnection after 3 missed pongs
            const socket = this.connections.get(connectionId);
            if (socket) {
                this.log('info', `Forcing reconnection due to heartbeat failure: ${connectionId}`);
                socket.close();
            }
        }
    }

    // ==========================================================================
    // Private Methods
    // ==========================================================================

    private handleMessage(
        connectionId: string,
        endpoint: string,
        data: BackendWSMessage,
        params: Record<string, unknown>
    ): void {
        const managerReceivedAtMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
        let managerEventSequence: number | undefined;
        if (endpoint === 'GenerateText2ImageWS') {
            const generationState = this.generationStates.get(connectionId);
            const nextSequence = (generationState?.messageSequence ?? 0) + 1;
            managerEventSequence = nextSequence;
            this.generationStates.set(connectionId, {
                hasProgress: generationState?.hasProgress ?? false,
                hasImage: generationState?.hasImage ?? false,
                requestId: generationState?.requestId ?? null,
                generationId: generationState?.generationId ?? null,
                messageSequence: nextSequence,
            });
        }
        const eventSequence = readFiniteNumber(data.sui_event_sequence ?? data.gen_progress?.event_sequence) ?? managerEventSequence;
        const serverElapsedMs = readFiniteNumber(data.sui_event_ms ?? data.gen_progress?.server_time_ms);

        if (this.config.debug) {
            this.log('debug', `Message: ${connectionId}`, data);
        }

        // Handle pong response for heartbeat
        if (data.type === 'pong') {
            this.handlePong(connectionId);
            return;
        }

        // Handle session expiry first so we can recover instead of surfacing a hard error.
        if (data.error_id === 'invalid_session_id') {
            void this.handleInvalidSession(connectionId, endpoint, params);
            return;
        }

        // Handle generic errors
        if (data.error) {
            const requestId = data.request_id || data.gen_progress?.request_id;
            if (endpoint === 'GenerateText2ImageWS' && this.shouldSuppressGenerationError(connectionId, data.error, data.error_id, requestId)) {
                this.log('info', `Suppressing recoverable generation error: ${connectionId}`, {
                    error: data.error,
                    errorId: data.error_id,
                    requestId,
                    state: this.generationStates.get(connectionId),
                });
                return;
            }
            this.log('error', `Server error: ${data.error} (${data.error_id})`);

            if (endpoint === 'GenerateText2ImageWS') {
                const errGenState = this.generationStates.get(connectionId);
                this.emitEvent('generation:error', endpoint, {
                    error: data.error,
                    errorId: data.error_id,
                    requestId,
                    generationId: errGenState?.generationId,
                    errorData: data.error_data,
                });
            } else if (endpoint === 'SelectModelWS') {
                this.emitEvent('model:error', endpoint, {
                    error: data.error,
                    errorId: data.error_id,
                });
            } else if (endpoint === 'DoModelDownloadWS') {
                this.emitEvent('download:error', endpoint, {
                    downloadId: connectionId,
                    error: data.error,
                });
            }
            return;
        }

        // Handle generation progress
        if (data.gen_progress) {
            const progressState = this.generationStates.get(connectionId);
            const progress = normalizeGenerationProgress({
                progress: data.gen_progress,
                params,
                generationId: progressState?.generationId ?? undefined,
                eventSequence,
                serverElapsedMs,
                managerReceivedAtMs,
            });
            if (progressState) {
                this.generationStates.set(connectionId, {
                    ...progressState,
                    hasProgress: true,
                    requestId: data.gen_progress.request_id || progressState.requestId,
                });
            }
            this.emitEvent('generation:progress', endpoint, progress);

            const preview = generationPreviewFromProgress(progress);
            if (preview) {
                this.emitEvent('generation:preview', endpoint, preview);
            }
        }

        // Handle generated image
        if (data.image) {
            const imgGenState = this.generationStates.get(connectionId);
            const imageData: GenerationImageData = {
                image: data.image,
                comfyViewUrl: data.comfy_view_url,
                batch: data.batch_index || 0,
                genNumber: data.gen_number || 0,
                requestId: data.request_id,
                generationId: imgGenState?.generationId ?? undefined,
                eventSequence,
                serverElapsedMs,
                managerReceivedAtMs,
            };
            const state = imgGenState;
            if (state) {
                this.generationStates.set(connectionId, {
                    ...state,
                    hasImage: true,
                    requestId: data.request_id || state.requestId,
                });
            }
            this.emitEvent('generation:image', endpoint, imageData);
        }

        // Handle model loading status
        if (data.status && endpoint === 'SelectModelWS') {
            const loadingCountRaw = Number(data.status.loading_models ?? 0);
            const loadingCount = Number.isFinite(loadingCountRaw) ? Math.max(loadingCountRaw, 0) : 0;

            // Some backends may provide load_progress (0..1 or 0..100). Use it when available.
            const rawLoadProgress = Number(data.load_progress);
            const hasDeterministicProgress = Number.isFinite(rawLoadProgress);
            const normalizedProgress = hasDeterministicProgress
                ? (rawLoadProgress <= 1 ? rawLoadProgress * 100 : rawLoadProgress)
                : undefined;
            const progress = normalizedProgress !== undefined
                ? Math.min(100, Math.max(0, normalizedProgress))
                : undefined;

            const progressData: ModelProgressData = {
                modelName: connectionId.replace('model_', ''),
                progress,
                loadingCount,
                isEstimated: !hasDeterministicProgress,
            };
            this.emitEvent('model:progress', endpoint, progressData);
        }

        // Handle download progress
        if (data.overall_percent !== undefined && endpoint === 'DoModelDownloadWS') {
            const downloadProgress: DownloadProgressData = {
                downloadId: connectionId,
                overallPercent: data.overall_percent,
                currentPercent: data.current_percent || 0,
                bytesPerSecond: data.per_second || 0,
            };
            this.emitEvent('download:progress', endpoint, downloadProgress);
        }

        // Handle success/completion
        if (data.success) {
            const requestId = data.request_id || data.gen_progress?.request_id;
            if (endpoint === 'GenerateText2ImageWS') {
                const successGenState = this.generationStates.get(connectionId);
                this.emitEvent('generation:complete', endpoint, {
                    success: true,
                    requestId,
                    generationId: successGenState?.generationId,
                    eventSequence,
                    serverElapsedMs,
                    managerReceivedAtMs,
                });
            } else if (endpoint === 'SelectModelWS') {
                this.emitEvent('model:loaded', endpoint, {
                    modelName: connectionId.replace('model_', ''),
                });
            } else if (endpoint === 'DoModelDownloadWS') {
                this.emitEvent('download:complete', endpoint, {
                    downloadId: connectionId,
                });
            }
        }

        // Handle socket close intention - this is how the backend signals generation completion
        if (data.socket_intention === 'close') {
            this.log('info', `Server requested close: ${connectionId}`);
            const requestId = data.request_id || data.gen_progress?.request_id;

            // For generation, this means the generation is complete
            if (endpoint === 'GenerateText2ImageWS') {
                const closeGenState = this.generationStates.get(connectionId);
                this.emitEvent('generation:complete', endpoint, {
                    success: true,
                    requestId,
                    generationId: closeGenState?.generationId,
                    eventSequence,
                    serverElapsedMs,
                    managerReceivedAtMs,
                });
            } else if (endpoint === 'SelectModelWS') {
                // Model selection sockets can close without explicit success payload.
                this.emitEvent('model:loaded', endpoint, {
                    modelName: connectionId.replace('model_', ''),
                });
            }

            // Proactively disconnect to prevent unwanted reconnection when the
            // backend closes the socket a few seconds later. Without this, an
            // unclean close can trigger attemptReconnect which re-sends the
            // generation params and produces a spurious "missing_model_input" error.
            this.disconnect(connectionId);
        }
    }

    private async handleInvalidSession(
        connectionId: string,
        endpoint: string,
        params: Record<string, unknown>
    ): Promise<void> {
        if (this.recoveringConnections.has(connectionId)) {
            this.log('debug', `Session recovery already in progress: ${connectionId}`);
            return;
        }

        const currentAttempts = this.sessionRecoveryAttempts.get(connectionId) || 0;
        if (currentAttempts >= this.config.maxSessionRecoveryAttempts) {
            this.log('error', `Session recovery attempts exhausted for ${connectionId}`);
            this.emitEvent('session:recovery-failed', endpoint, {
                connectionId,
                attempts: currentAttempts,
                error: 'max_session_recovery_attempts',
            });
            this.emitEvent('error', endpoint, { error: 'Session expired and recovery limit reached' });
            this.disconnect(connectionId);
            return;
        }

        this.recoveringConnections.add(connectionId);
        const nextAttempt = currentAttempts + 1;
        this.sessionRecoveryAttempts.set(connectionId, nextAttempt);

        this.emitEvent('session:expired', endpoint, {
            connectionId,
            attempts: nextAttempt,
        });

        if (!this.config.refreshSession) {
            this.log('error', 'No refreshSession callback configured; cannot recover session');
            this.emitEvent('session:recovery-failed', endpoint, {
                connectionId,
                attempts: nextAttempt,
                error: 'missing_refresh_callback',
            });
            this.emitEvent('error', endpoint, { error: 'Session expired and no refresh callback available' });
            this.recoveringConnections.delete(connectionId);
            return;
        }

        try {
            const newSessionId = await this.config.refreshSession();
            if (newSessionId) {
                this.updateSessionId(newSessionId);
            }

            this.emitEvent('session:recovered', endpoint, {
                connectionId,
                attempts: nextAttempt,
                sessionId: newSessionId,
            });
            recordWSSessionRecovery();

            const existingSocket = this.connections.get(connectionId);
            if (existingSocket && existingSocket.readyState === WebSocket.OPEN) {
                existingSocket.close(4001, 'Session refreshed, reconnecting');
            }
            this.connect(endpoint, params, connectionId);
        } catch (error) {
            this.log('error', `Session recovery failed for ${connectionId}`, error);
            this.emitEvent('session:recovery-failed', endpoint, {
                connectionId,
                attempts: nextAttempt,
                error: error instanceof Error ? error.message : 'session_refresh_failed',
            });
            this.emitEvent('error', endpoint, {
                error: error instanceof Error ? error.message : 'session_refresh_failed',
            });
        } finally {
            this.recoveringConnections.delete(connectionId);
        }
    }

    private attemptReconnect(
        connectionId: string,
        endpoint: string,
        params: Record<string, unknown>
    ): void {
        const state = this.connectionStates.get(connectionId);
        if (!state) return;

        if (state.reconnectAttempts >= this.config.maxReconnectAttempts) {
            this.log('error', `Max reconnect attempts reached: ${connectionId}`);
            this.updateConnectionState(connectionId, { status: 'error' });
            this.emitEvent('error', endpoint, { error: 'Max reconnect attempts reached' });
            clientLogger.error('ws', `Max reconnect attempts reached: ${connectionId}`, {
                metadata: { endpoint, attempts: state.reconnectAttempts },
            });
            return;
        }

        const attempt = state.reconnectAttempts + 1;
        if (!this.isNetworkOnline) {
            this.log('info', `Queueing reconnect until network is restored: ${connectionId} (attempt ${attempt})`);
            this.updateConnectionState(connectionId, {
                status: 'reconnecting',
                reconnectAttempts: attempt,
            });
            this.pendingReconnects.set(connectionId, { endpoint, params, attempt });
            this.emitEvent('reconnect', endpoint, { connectionId, attempt, delay: null, waitingFor: 'online' });
            return;
        }

        const delay = this.getReconnectDelay(attempt);

        this.log('info', `Reconnecting: ${connectionId} (attempt ${attempt}, delay ${delay}ms)`);
        recordWSReconnect(endpoint);
        clientLogger.warn('ws', `WebSocket reconnecting (attempt ${attempt})`, {
            metadata: { endpoint, attempt, delay },
        });

        this.updateConnectionState(connectionId, {
            status: 'reconnecting',
            reconnectAttempts: attempt,
        });

        this.emitEvent('reconnect', endpoint, { connectionId, attempt, delay });

        const timer = setTimeout(() => {
            this.reconnectTimers.delete(connectionId);
            if (!this.isNetworkOnline) {
                this.pendingReconnects.set(connectionId, { endpoint, params, attempt });
                return;
            }
            this.connect(endpoint, params, connectionId);
        }, delay);

        this.reconnectTimers.set(connectionId, timer);
    }

    private getReconnectDelay(attempt: number): number {
        const baseDelay = Math.min(
            this.config.reconnectBaseDelay * Math.pow(2, attempt - 1),
            this.config.reconnectMaxDelay
        );

        if (this.isAppVisible) {
            return baseDelay;
        }

        return Math.min(baseDelay * HIDDEN_RECONNECT_DELAY_MULTIPLIER, this.config.reconnectMaxDelay);
    }

    private restartHeartbeats(): void {
        if (!this.isNetworkOnline) {
            return;
        }

        for (const [connectionId, socket] of this.connections.entries()) {
            const state = this.connectionStates.get(connectionId);
            if (!state || !HEARTBEAT_SUPPORTED_ENDPOINTS.has(state.endpoint) || socket.readyState !== WebSocket.OPEN) {
                continue;
            }
            this.startHeartbeat(connectionId, socket);
        }
    }

    private stopAllHeartbeats(): void {
        for (const connectionId of this.connections.keys()) {
            this.stopHeartbeat(connectionId);
        }
    }

    private flushPendingReconnects(): void {
        for (const [connectionId, reconnect] of this.pendingReconnects.entries()) {
            this.pendingReconnects.delete(connectionId);
            this.log('info', `Resuming queued reconnect: ${connectionId}`);
            this.connect(reconnect.endpoint, reconnect.params, connectionId);
        }
    }

    private registerLifecycleListeners(): void {
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', this.handleVisibilityChange);
        }
        if (typeof window !== 'undefined') {
            window.addEventListener('online', this.handleOnline);
            window.addEventListener('offline', this.handleOffline);
        }
    }

    private unregisterLifecycleListeners(): void {
        if (typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        }
        if (typeof window !== 'undefined') {
            window.removeEventListener('online', this.handleOnline);
            window.removeEventListener('offline', this.handleOffline);
        }
    }

    private updateConnectionState(
        connectionId: string,
        updates: Partial<ConnectionState>
    ): void {
        const current = this.connectionStates.get(connectionId);
        if (current) {
            this.connectionStates.set(connectionId, { ...current, ...updates });
        }
    }

    private normalizeGenerationParams(params: Record<string, unknown>): Record<string, unknown> {
        const normalized = { ...params };
        if (
            normalized.refinercontrolpercentage === undefined &&
            normalized.refinercontrol !== undefined &&
            normalized.refinercontrol !== null &&
            normalized.refinercontrol !== ''
        ) {
            normalized.refinercontrolpercentage = normalized.refinercontrol;
        }
        delete normalized.refinercontrol;
        return normalized;
    }

    private shouldSuppressGenerationError(
        connectionId: string,
        error: string | undefined,
        errorId: string | undefined,
        requestId: string | undefined
    ): boolean {
        if (!this.isMissingModelGenerationError(error, errorId)) {
            return false;
        }
        const state = this.generationStates.get(connectionId);
        if (!state) {
            return false;
        }
        if (state.hasProgress || state.hasImage) {
            return true;
        }
        if (!state.requestId) {
            return false;
        }
        return !requestId || requestId === state.requestId;
    }

    private isMissingModelGenerationError(error: string | undefined, errorId: string | undefined): boolean {
        if (errorId === 'missing_model_input') {
            return true;
        }
        if (typeof error !== 'string') {
            return false;
        }
        return error.trim().toLowerCase().startsWith('no model input given');
    }

    private normalizeModelValue(value: unknown): string | null {
        if (typeof value === 'string') {
            const trimmed = value.trim();
            return trimmed.length > 0 ? trimmed : null;
        }
        if (value && typeof value === 'object') {
            const obj = value as Record<string, unknown>;
            const candidates = [obj.name, obj.model, obj.model_name, obj.id, obj.value, obj.title];
            for (const candidate of candidates) {
                if (typeof candidate === 'string') {
                    const trimmed = candidate.trim();
                    if (trimmed.length > 0) {
                        return trimmed;
                    }
                }
            }
        }
        return null;
    }

    private emitConnectionEvent(connectionId: string, status: string): void {
        const state = this.connectionStates.get(connectionId);
        if (state) {
            this.emitEvent('message', state.endpoint, { connectionId, status });
        }
    }

    private emitEvent<T>(type: WSEventType, endpoint: string, data: T): void {
        this.eventEmitter.emit({
            type,
            endpoint,
            timestamp: Date.now(),
            data,
        });
    }

    private log(level: 'info' | 'error' | 'debug', message: string, ...args: unknown[]): void {
        const prefix = '[WSManager]';
        if (level === 'debug' && !this.config.debug) return;

        if (level === 'error') {
            console.error(prefix, message, ...args);
        } else if (level === 'debug') {
            console.debug(prefix, message, ...args);
        } else {
            console.debug(prefix, message, ...args);
        }
    }
}

// ============================================================================
// Singleton Instance (will be initialized with session)
// ============================================================================

let wsManager: WebSocketManager | null = null;

export function getWSManager(): WebSocketManager {
    if (!wsManager) {
        throw new Error('WebSocketManager not initialized. Call initWSManager first.');
    }
    return wsManager;
}

export function initWSManager(config: WSManagerConfig): WebSocketManager {
    if (wsManager) {
        wsManager.dispose();
    }
    wsManager = new WebSocketManager(config);
    return wsManager;
}

export function updateWSManagerSession(sessionId: string): void {
    if (wsManager) {
        wsManager.updateSessionId(sessionId);
    }
}
