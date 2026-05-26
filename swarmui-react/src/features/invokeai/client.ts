import { buildInvokeGraph } from './graphBuilders';
import type {
    InvokeAIEnqueueBatchResult,
    InvokeAIGraph,
    InvokeAIImageCategory,
    InvokeAIImageDTO,
    InvokeAIModelRecord,
    InvokeAIQueueItem,
    InvokeAIRunParams,
    InvokeAIRunResult,
    InvokeAISessionResult,
} from './types';

interface InvokeAIHealthResult {
    version: string | null;
    runtimeConfig: Record<string, unknown> | null;
}

interface InvokeAIUploadOptions {
    category: InvokeAIImageCategory;
    isIntermediate?: boolean;
    sessionId?: string;
    metadata?: Record<string, unknown>;
    fileName?: string;
}

interface InvokeAIEnqueueOptions {
    queueId?: string;
    prepend?: boolean;
    origin?: string;
    destination?: string;
}

interface InvokeAIWaitOptions {
    queueId?: string;
    timeoutMs?: number;
    pollMs?: number;
    signal?: AbortSignal;
}

interface InvokeAIClientOptions {
    baseUrl: string;
    queueId?: string;
}

interface InvokeAIModelListResponse {
    models?: InvokeAIModelRecord[];
}

interface InvokeAIErrorResponse {
    detail?: unknown;
    message?: string;
    error?: string;
}

function normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.trim().replace(/\/+$/, '');
}

function buildPath(path: string, query: Record<string, string | number | boolean | null | undefined> = {}): string {
    const urlPath = path.startsWith('/') ? path : `/${path}`;
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
            queryParams.set(key, String(value));
        }
    }
    const queryString = queryParams.toString();
    return queryString ? `${urlPath}?${queryString}` : urlPath;
}

async function readErrorMessage(response: Response): Promise<string> {
    try {
        const data = await response.json() as InvokeAIErrorResponse;
        if (typeof data.message === 'string') {
            return data.message;
        }
        if (typeof data.error === 'string') {
            return data.error;
        }
        if (typeof data.detail === 'string') {
            return data.detail;
        }
        if (Array.isArray(data.detail) && data.detail.length > 0) {
            return JSON.stringify(data.detail);
        }
    } catch {
        try {
            const text = await response.text();
            if (text.trim()) {
                return text;
            }
        } catch {
            return `InvokeAI request failed with status ${response.status}.`;
        }
    }
    return `InvokeAI request failed with status ${response.status}.`;
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
    const response = await fetch(dataUrl);
    if (!response.ok) {
        throw new Error('Failed to read image data for InvokeAI upload.');
    }
    return response.blob();
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error ?? new Error('Failed to read InvokeAI image response.'));
        reader.readAsDataURL(blob);
    });
}

function extractImageNameFromOutput(output: InvokeAISessionResult | undefined): string | null {
    const imageName = output?.image?.image_name;
    if (typeof imageName === 'string' && imageName.trim()) {
        return imageName;
    }
    return null;
}

function extractOutputForNode(item: InvokeAIQueueItem, outputNodeId: string): InvokeAISessionResult {
    const results = item.session?.results ?? {};
    const preparedMapping = item.session?.source_prepared_mapping ?? {};
    const preparedOutputIds = preparedMapping[outputNodeId] ?? [];
    for (const preparedOutputId of preparedOutputIds) {
        const output = results[preparedOutputId];
        if (extractImageNameFromOutput(output)) {
            return output;
        }
    }

    const directOutput = results[outputNodeId];
    if (extractImageNameFromOutput(directOutput)) {
        return directOutput;
    }

    const imageOutput = Object.values(results).find((output) => extractImageNameFromOutput(output));
    if (imageOutput) {
        return imageOutput;
    }

    throw new Error('InvokeAI completed without returning an image output.');
}

function sortModels(models: InvokeAIModelRecord[]): InvokeAIModelRecord[] {
    return [...models].sort((left, right) => left.name.localeCompare(right.name));
}

export class InvokeAIClient {
    private readonly baseUrl: string;
    private readonly queueId: string;

    constructor(options: InvokeAIClientOptions) {
        this.baseUrl = normalizeBaseUrl(options.baseUrl);
        this.queueId = options.queueId || 'default';
    }

    private url(path: string): string {
        return `${this.baseUrl}${path}`;
    }

    toAbsoluteUrl(pathOrUrl: string): string {
        if (!pathOrUrl) {
            return pathOrUrl;
        }
        if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://') || pathOrUrl.startsWith('data:')) {
            return pathOrUrl;
        }
        return this.url(pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`);
    }

    private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
        const response = await fetch(this.url(path), init);
        if (!response.ok) {
            throw new Error(await readErrorMessage(response));
        }
        if (response.status === 204) {
            return undefined as T;
        }
        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.includes('application/json')) {
            return undefined as T;
        }
        return response.json() as Promise<T>;
    }

    async getVersion(): Promise<string> {
        const response = await this.request<{ version?: string }>('/api/v1/app/version');
        return response.version ?? 'unknown';
    }

    async getRuntimeConfig(): Promise<Record<string, unknown>> {
        return this.request<Record<string, unknown>>('/api/v1/app/runtime_config');
    }

    async healthCheck(): Promise<InvokeAIHealthResult> {
        const version = await this.getVersion();
        let runtimeConfig: Record<string, unknown> | null = null;
        try {
            runtimeConfig = await this.getRuntimeConfig();
        } catch {
            runtimeConfig = null;
        }
        return { version, runtimeConfig };
    }

    async listMainModels(): Promise<InvokeAIModelRecord[]> {
        const response = await this.request<InvokeAIModelListResponse | InvokeAIModelRecord[]>(
            buildPath('/api/v2/models/', { model_type: 'main' })
        );
        const models = Array.isArray(response) ? response : response.models ?? [];
        return sortModels(models);
    }

    async uploadImage(dataUrl: string, options: InvokeAIUploadOptions): Promise<InvokeAIImageDTO> {
        const blob = await dataUrlToBlob(dataUrl);
        const formData = new FormData();
        formData.append('file', blob, options.fileName || 'swarm-invoke-image.png');
        if (options.metadata) {
            formData.append('metadata', JSON.stringify(options.metadata));
        }
        return this.request<InvokeAIImageDTO>(buildPath('/api/v1/images/upload', {
            image_category: options.category,
            is_intermediate: options.isIntermediate ?? true,
            session_id: options.sessionId,
        }), {
            method: 'POST',
            body: formData,
        });
    }

    async enqueueGraph(graph: InvokeAIGraph, options: InvokeAIEnqueueOptions = {}): Promise<InvokeAIEnqueueBatchResult> {
        const queueId = options.queueId || this.queueId;
        return this.request<InvokeAIEnqueueBatchResult>(`/api/v1/queue/${encodeURIComponent(queueId)}/enqueue_batch`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prepend: options.prepend ?? false,
                batch: {
                    graph,
                    runs: 1,
                    origin: options.origin ?? 'swarmui-react',
                    destination: options.destination ?? 'swarmui-react-invokeai',
                },
            }),
        });
    }

    async getQueueItem(itemId: number, queueId = this.queueId): Promise<InvokeAIQueueItem> {
        return this.request<InvokeAIQueueItem>(`/api/v1/queue/${encodeURIComponent(queueId)}/i/${encodeURIComponent(String(itemId))}`);
    }

    async waitForQueueItem(itemId: number, options: InvokeAIWaitOptions = {}): Promise<InvokeAIQueueItem> {
        const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
        const pollMs = options.pollMs ?? 2000;
        const startedAt = Date.now();

        while (Date.now() - startedAt < timeoutMs) {
            if (options.signal?.aborted) {
                throw new Error('InvokeAI request was canceled.');
            }
            const item = await this.getQueueItem(itemId, options.queueId || this.queueId);
            if (item.status === 'completed') {
                return item;
            }
            if (item.status === 'failed' || item.status === 'canceled') {
                throw new Error(item.error_message || item.error || `InvokeAI queue item ${item.status}.`);
            }
            await new Promise((resolve) => window.setTimeout(resolve, pollMs));
        }

        throw new Error('InvokeAI generation timed out.');
    }

    async downloadImageDataUrl(imageName: string): Promise<string> {
        const response = await fetch(this.url(`/api/v1/images/i/${encodeURIComponent(imageName)}/full`));
        if (!response.ok) {
            throw new Error(await readErrorMessage(response));
        }
        return blobToDataUrl(await response.blob());
    }

    async runGeneration(params: InvokeAIRunParams, model: InvokeAIModelRecord, signal?: AbortSignal): Promise<InvokeAIRunResult> {
        const initImage = params.initImageDataUrl
            ? await this.uploadImage(params.initImageDataUrl, {
                category: 'general',
                isIntermediate: true,
                metadata: { source: 'swarmui-react', mode: params.mode },
                fileName: 'swarm-invoke-source.png',
            })
            : null;
        const maskImage = params.maskImageDataUrl
            ? await this.uploadImage(params.maskImageDataUrl, {
                category: 'mask',
                isIntermediate: true,
                metadata: { source: 'swarmui-react', mode: params.mode },
                fileName: 'swarm-invoke-mask.png',
            })
            : null;

        const builtGraph = buildInvokeGraph(params, model, {
            initImageName: initImage?.image_name,
            maskImageName: maskImage?.image_name,
        });
        const enqueueResult = await this.enqueueGraph(builtGraph.graph, {
            origin: 'swarmui-react',
            destination: params.mode === 'txt2img' ? 'invokeai-utility' : 'invokeai-canvas-edit',
        });
        const itemId = enqueueResult.item_ids[0];
        if (typeof itemId !== 'number') {
            throw new Error('InvokeAI did not return a queue item id.');
        }

        const queueItem = await this.waitForQueueItem(itemId, { signal });
        const output = extractOutputForNode(queueItem, builtGraph.outputNodeId);
        const imageName = extractImageNameFromOutput(output);
        if (!imageName) {
            throw new Error('InvokeAI completed without a downloadable image.');
        }

        const imageDataUrl = await this.downloadImageDataUrl(imageName);
        return {
            mode: params.mode,
            batchId: enqueueResult.batch.batch_id,
            itemId,
            imageName,
            imageUrl: this.toAbsoluteUrl(`/api/v1/images/i/${encodeURIComponent(imageName)}/full`),
            imageDataUrl,
            output,
            queueItem,
        };
    }
}
