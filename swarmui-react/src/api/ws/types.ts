/**
 * WebSocket Types for Reactive Architecture
 */

// ============================================================================
// Connection States
// ============================================================================

export type ConnectionStatus =
    | 'disconnected'
    | 'connecting'
    | 'connected'
    | 'reconnecting'
    | 'error';

export interface ConnectionState {
    status: ConnectionStatus;
    endpoint: string;
    connectedAt: number | null;
    reconnectAttempts: number;
    lastError: string | null;
    /** Timestamp of last ping sent */
    lastPingTime: number | null;
    /** Timestamp of last pong received */
    lastPongTime: number | null;
    /** Number of consecutive missed pong responses */
    missedPongs: number;
}

// ============================================================================
// WebSocket Events
// ============================================================================

export type WSEventType =
    | 'open'
    | 'close'
    | 'error'
    | 'message'
    | 'reconnect'
    | 'session:expired'
    | 'session:recovered'
    | 'session:recovery-failed'
    | 'generation:start'
    | 'generation:progress'
    | 'generation:preview'
    | 'generation:image'
    | 'generation:complete'
    | 'generation:error'
    | 'model:loading'
    | 'model:progress'
    | 'model:loaded'
    | 'model:error'
    | 'download:progress'
    | 'download:complete'
    | 'download:error'
    | 'connection:healthy'
    | 'connection:degraded'
    | 'connection:unhealthy';

export interface WSEvent<T = unknown> {
    type: WSEventType;
    endpoint: string;
    timestamp: number;
    data: T;
}

// ============================================================================
// Generation Events
// ============================================================================

export interface GenerationProgressData {
    currentStep: number;      // Current stage step, when backend provides sampler-stage detail
    totalSteps: number;       // Total steps for the active stage
    stepSource?: 'backend' | 'node_percent' | 'unknown';
    overallPercent: number;   // overall_percent * 100 (as percentage)
    batch: number;
    batchTotal: number;
    requestId?: string;
    generationId?: string;    // Client-side nonce for request scoping
    eventSequence?: number;
    serverElapsedMs?: number;
    managerReceivedAtMs?: number;
    previewImage?: string;
    previewFrameSequence?: number;
    backendProgressSequence?: number;
    nodeIndex?: number;
    nodeCount?: number;
    currentNode?: string;
    currentPercentSource?: string;
    stageId?: string | null;
    stageLabel?: string | null;
    stageDetail?: string | null;
    stageIndex?: number;
    stageCount?: number;
    stagesRemaining?: number;
    stageTaskIndex?: number;
    stageTaskCount?: number;
    stageTasksRemaining?: number;
    backendPreview?: {
        previewMode?: string;
        previewMethod?: string;
        warning?: string | null;
        promptQueuedMs?: number;
        executionStartMs?: number;
        firstProgressMs?: number;
        firstPreviewMs?: number;
        firstImageMs?: number;
        completeMs?: number;
        previewEventCount?: number;
        firstPreviewBytes?: number;
        averagePreviewBytes?: number;
        finalImageBytes?: number;
        isFinal?: boolean;
    };
}

export interface GenerationPreviewData {
    image: string;
    requestId?: string;
    generationId?: string;
    eventSequence?: number;
    serverElapsedMs?: number;
    managerReceivedAtMs?: number;
    previewFrameSequence?: number;
    backendProgressSequence?: number;
    currentStep?: number;
    totalSteps?: number;
    stepSource?: 'backend' | 'node_percent' | 'unknown';
    overallPercent?: number;
    batch?: number;
    batchTotal?: number;
    nodeIndex?: number;
    nodeCount?: number;
    currentNode?: string;
    currentPercentSource?: string;
    stageId?: string | null;
    stageLabel?: string | null;
    stageDetail?: string | null;
    stageIndex?: number;
    stageCount?: number;
    stagesRemaining?: number;
    stageTaskIndex?: number;
    stageTaskCount?: number;
    stageTasksRemaining?: number;
}

export interface GenerationImageData {
    image: string;
    comfyViewUrl?: string;
    batch: number;
    genNumber: number;
    requestId?: string;
    generationId?: string;
    eventSequence?: number;
    serverElapsedMs?: number;
    managerReceivedAtMs?: number;
}

export interface GenerationCompleteData {
    images?: string[];
    totalTime?: number;
    requestId?: string;
    generationId?: string;
    success?: boolean;
    eventSequence?: number;
    serverElapsedMs?: number;
    managerReceivedAtMs?: number;
}

export interface GenerationErrorData {
    error: string;
    errorId?: string;
    requestId?: string;
    generationId?: string;
    errorData?: unknown;
}

// ============================================================================
// Model Loading Events
// ============================================================================

export interface ModelLoadingData {
    modelName: string;
    status: 'loading' | 'loaded' | 'error';
}

export interface ModelProgressData {
    modelName: string;
    /** Optional percentage if backend provides a deterministic value. */
    progress?: number;
    loadingCount: number;
    /** True when progress is inferred from status instead of a real percentage. */
    isEstimated: boolean;
}

// ============================================================================
// Download Events
// ============================================================================

export interface DownloadProgressData {
    downloadId: string;
    overallPercent: number;
    currentPercent: number;
    bytesPerSecond: number;
}

// ============================================================================
// WebSocket Manager Config
// ============================================================================

export interface WSManagerConfig {
    /** Base WebSocket URL */
    baseUrl: string;

    /** Session ID for authentication */
    sessionId: string | null;

    /** Max reconnection attempts (default: 5) */
    maxReconnectAttempts?: number;

    /** Base delay between reconnects in ms (default: 1000) */
    reconnectBaseDelay?: number;

    /** Max delay between reconnects in ms (default: 30000) */
    reconnectMaxDelay?: number;

    /** Connection timeout in ms (default: 10000) */
    connectionTimeout?: number;

    /** Enable debug logging (default: false) */
    debug?: boolean;

    /** Enable heartbeat ping-pong (default: true) */
    enableHeartbeat?: boolean;

    /** Interval between pings in ms (default: 30000) */
    heartbeatInterval?: number;

    /** Timeout for pong response in ms (default: 5000) */
    heartbeatTimeout?: number;

    /** Callback used for session refresh when backend reports invalid_session_id */
    refreshSession?: () => Promise<string | null>;

    /** Max session recovery attempts per connection before surfacing a hard error */
    maxSessionRecoveryAttempts?: number;
}

// ============================================================================
// Subscription Types
// ============================================================================

export type WSCallback<T = unknown> = (event: WSEvent<T>) => void;

export interface Subscription {
    id: string;
    eventType: WSEventType | '*';
    callback: WSCallback;
    once: boolean;
}

// ============================================================================
// Backend Message Types (from SwarmUI)
// ============================================================================

export interface BackendWSMessage {
    // Control messages
    type?: string;

    // Status updates
    status?: {
        loading_models?: number;
        [key: string]: unknown;
    };

    // Generation progress (matches ComfyUIAPIAbstractBackend.cs output)
    gen_progress?: {
        batch_index: string;       // Backend sends as string
        request_id: string;
        overall_percent: number;   // (nodesDone + curPercent) / expectedNodes
        current_percent: number;   // progress within current backend node
        event_sequence?: number;
        server_time_ms?: number;
        backend_progress_sequence?: number;
        preview_frame_sequence?: number;
        node_index?: number;
        node_count?: number;
        current_node?: string;
        current_percent_source?: string;
        current_percent_is_step?: boolean;
        metadata?: string;
        preview?: string;
        stage_id?: string | null;
        stage_label?: string | null;
        backend_preview?: {
            preview_mode?: string;
            preview_method?: string;
            warning?: string | null;
            prompt_queued_ms?: number;
            execution_start_ms?: number;
            first_progress_ms?: number;
            first_preview_ms?: number;
            first_image_ms?: number;
            complete_ms?: number;
            preview_event_count?: number;
            first_preview_bytes?: number;
            average_preview_bytes?: number;
            final_image_bytes?: number;
            is_final?: boolean;
        };
        stage_detail?: string | null;
        stage_index?: number | string | null;
        stage_count?: number | string | null;
        stages_remaining?: number | string | null;
        stage_task_index?: number | string | null;
        stage_task_count?: number | string | null;
        stage_tasks_remaining?: number | string | null;
        stage_current_step?: number | string | null;
        stage_total_steps?: number | string | null;
    };

    // Generated image
    image?: string;
    comfy_view_url?: string;
    batch_index?: number;
    gen_number?: number;
    request_id?: string;
    sui_event_sequence?: number;
    sui_event_ms?: number;

    // Errors
    error?: string;
    error_id?: string;
    error_data?: unknown;

    // Connection control
    socket_intention?: 'close' | 'keep';

    // Success indicator
    success?: boolean;
    load_progress?: number;

    // Download progress
    overall_percent?: number;
    current_percent?: number;
    per_second?: number;
}
