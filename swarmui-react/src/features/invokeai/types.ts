export type InvokeAIConnectionState = 'idle' | 'checking' | 'connected' | 'error';

export type InvokeAIGenerationMode = 'txt2img' | 'img2img' | 'inpaint' | 'outpaint';

export type InvokeAIImageCategory = 'general' | 'mask' | 'control' | 'user' | 'other';

export interface InvokeAIModelRecord {
    key: string;
    hash?: string;
    name: string;
    base?: string;
    type?: string;
    submodel_type?: string | null;
    path?: string;
    description?: string | null;
    format?: string;
}

export interface InvokeAIModelIdentifierField {
    key: string;
    hash: string;
    name: string;
    base: string;
    type: string;
    submodel_type?: string | null;
}

export interface InvokeAIImageDTO {
    image_name: string;
    image_origin?: string;
    image_category?: InvokeAIImageCategory;
    width?: number;
    height?: number;
    created_at?: string;
    updated_at?: string;
    image_url?: string;
    thumbnail_url?: string;
    is_intermediate?: boolean;
    board_id?: string | null;
}

export interface InvokeAIGraphEdge {
    source: {
        node_id: string;
        field: string;
    };
    destination: {
        node_id: string;
        field: string;
    };
}

export interface InvokeAIGraph {
    id: string;
    nodes: Record<string, Record<string, unknown>>;
    edges: InvokeAIGraphEdge[];
}

export interface InvokeAIBuiltGraph {
    graph: InvokeAIGraph;
    outputNodeId: string;
    resolvedSeed: number;
    scheduler: string;
}

export interface InvokeAIEnqueueBatchResult {
    queue_id: string;
    enqueued: number;
    requested: number;
    priority: number;
    batch: {
        batch_id: string;
    };
    item_ids: number[];
}

export type InvokeAIQueueItemStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'canceled';

export interface InvokeAISessionResult {
    type?: string;
    image?: {
        image_name?: string;
    };
    width?: number;
    height?: number;
    [key: string]: unknown;
}

export interface InvokeAISession {
    id?: string;
    results?: Record<string, InvokeAISessionResult>;
    graph?: InvokeAIGraph;
    source_prepared_mapping?: Record<string, string[]>;
}

export interface InvokeAIQueueItem {
    item_id: number;
    batch_id: string;
    status: InvokeAIQueueItemStatus;
    error?: string | null;
    error_message?: string | null;
    error_type?: string | null;
    session?: InvokeAISession;
}

export interface InvokeAIRunParams {
    mode: InvokeAIGenerationMode;
    prompt: string;
    negativePrompt?: string;
    width: number;
    height: number;
    seed?: number | null;
    steps?: number;
    cfgScale?: number;
    scheduler?: string;
    clipSkip?: number;
    denoiseStrength?: number;
    initImageDataUrl?: string;
    maskImageDataUrl?: string | null;
    maskBlur?: number;
    coherenceMode?: string;
    coherenceMinDenoise?: number;
    coherenceEdgeSize?: number;
}

export interface InvokeAIRunResult {
    mode: InvokeAIGenerationMode;
    batchId: string;
    itemId: number;
    imageName: string;
    imageUrl: string;
    imageDataUrl: string;
    output: InvokeAISessionResult;
    queueItem: InvokeAIQueueItem;
}
