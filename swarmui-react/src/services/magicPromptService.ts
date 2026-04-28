import type {
    AssistantChatTurn,
    AssistantConnectionStatus,
    AssistantModel,
    AssistantProbeResult,
    AssistantResponseDraft,
    AssistantServerMode,
} from '../types/assistant';

export interface MagicPromptModel {
    model: string;
    name: string;
}

interface EnhanceResponse {
    success: boolean;
    response: string;
    error?: string;
}

interface AssistantChatResponse extends EnhanceResponse {
    draft?: AssistantResponseDraft;
}

interface LegacyModel {
    key: string;
    display_name?: string;
    type?: string;
    [key: string]: unknown;
}

interface OpenAIModel {
    id: string;
    object?: string;
    owned_by?: string;
    [key: string]: unknown;
}

interface LegacyModelsResponse {
    models?: LegacyModel[];
}

interface OpenAIModelsResponse {
    data?: OpenAIModel[];
}

interface ChatCompletionMessage {
    role?: string;
    content?: string | Array<{ type?: string; text?: string }>;
}

interface ChatCompletionResponse {
    choices?: Array<{
        message?: ChatCompletionMessage;
    }>;
}

interface ResponsesApiContentPart {
    type?: string;
    text?: string;
}

interface ResponsesApiOutputItem {
    type?: string;
    role?: string;
    content?: ResponsesApiContentPart[];
}

interface ResponsesApiResponse {
    output?: ResponsesApiOutputItem[];
}

const JSON_RESPONSE_INSTRUCTION = [
    'Respond with valid JSON only.',
    'Use this exact shape:',
    '{"message":"string","promptDraft":"string|null","negativePromptDraft":"string|null","parameterSuggestions":[{"key":"negativeprompt|steps|cfgscale|sampler|scheduler|width|height","value":"string|number","reason":"string"}],"reasoningNote":"string|null"}',
    'Do not wrap the JSON in markdown fences.',
].join(' ');

function normalizeUrl(url: string): string {
    return url.replace(/\/+$/, '');
}

function isLikelyLocalhostUrl(url: string): boolean {
    try {
        const parsed = new URL(normalizeUrl(url));
        return ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
    } catch {
        return false;
    }
}

function buildCorsHint(endpointUrl: string): string {
    return isLikelyLocalhostUrl(endpointUrl)
        ? 'Could not reach the assistant server.'
        : 'Could not read the assistant server response. If this is a LAN endpoint, enable CORS on the server.';
}

function getModelDisplayName(model: AssistantModel): string {
    return model.name || model.id;
}

async function readErrorText(response: Response): Promise<string> {
    return response.text().catch(() => response.statusText);
}

function normalizeLegacyModels(data: LegacyModelsResponse): AssistantModel[] {
    if (!Array.isArray(data.models)) {
        return [];
    }

    return data.models
        .filter((model) => {
            if (typeof model.key !== 'string' || !model.key.trim()) {
                return false;
            }
            return !model.type || String(model.type).toLowerCase() === 'llm';
        })
        .map((model) => ({
            id: model.key,
            name: model.display_name || model.key,
            serverMode: 'legacy-lmstudio' as const,
        }));
}

function normalizeOpenAIModels(data: OpenAIModelsResponse): AssistantModel[] {
    if (!Array.isArray(data.data)) {
        return [];
    }

    return data.data
        .filter((model) => typeof model.id === 'string' && model.id.trim().length > 0)
        .map((model) => ({
            id: model.id,
            name: model.id,
            serverMode: 'openai-compatible' as const,
        }));
}

async function fetchModelsForMode(
    endpointUrl: string,
    mode: AssistantServerMode
): Promise<{ reachable: boolean; models: AssistantModel[]; error?: string }> {
    const base = normalizeUrl(endpointUrl);
    const path = mode === 'legacy-lmstudio' ? '/api/v1/models' : '/v1/models';

    try {
        const response = await fetch(`${base}${path}`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
            return {
                reachable: false,
                models: [],
                error: `Server responded with ${response.status}`,
            };
        }

        const data = (await response.json()) as LegacyModelsResponse | OpenAIModelsResponse;
        const models = mode === 'legacy-lmstudio'
            ? normalizeLegacyModels(data as LegacyModelsResponse)
            : normalizeOpenAIModels(data as OpenAIModelsResponse);

        return { reachable: true, models };
    } catch (error) {
        return {
            reachable: false,
            models: [],
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

export async function probeAssistantConnection(endpointUrl: string): Promise<AssistantProbeResult> {
    const legacy = await fetchModelsForMode(endpointUrl, 'legacy-lmstudio');
    if (legacy.reachable) {
        const connection: AssistantConnectionStatus = {
            state: legacy.models.length > 0 ? 'connected' : 'reachable_no_models',
            message: legacy.models.length > 0
                ? `Connected to LM Studio legacy API. ${legacy.models.length} model(s) available.`
                : 'Server is reachable via LM Studio legacy API, but no text model was advertised.',
            serverMode: 'legacy-lmstudio',
            endpointUrl: normalizeUrl(endpointUrl),
            models: legacy.models,
            lastCheckedAt: Date.now(),
        };
        return { ok: legacy.models.length > 0, connection };
    }

    const openAI = await fetchModelsForMode(endpointUrl, 'openai-compatible');
    if (openAI.reachable) {
        const connection: AssistantConnectionStatus = {
            state: openAI.models.length > 0 ? 'connected' : 'reachable_no_models',
            message: openAI.models.length > 0
                ? `Connected to OpenAI-compatible API. ${openAI.models.length} model(s) available.`
                : 'Server is reachable via OpenAI-compatible API, but no text model was advertised.',
            serverMode: 'openai-compatible',
            endpointUrl: normalizeUrl(endpointUrl),
            models: openAI.models,
            lastCheckedAt: Date.now(),
        };
        return { ok: openAI.models.length > 0, connection };
    }

    return {
        ok: false,
        connection: {
            state: 'unreachable',
            message: legacy.error || openAI.error || buildCorsHint(endpointUrl),
            serverMode: null,
            endpointUrl: normalizeUrl(endpointUrl),
            models: [],
            lastCheckedAt: Date.now(),
        },
    };
}

export async function getMagicPromptModels(endpointUrl: string): Promise<MagicPromptModel[]> {
    const probe = await probeAssistantConnection(endpointUrl);
    return probe.connection.models.map((model) => ({
        model: model.id,
        name: getModelDisplayName(model),
    }));
}

function extractTextContent(content: ChatCompletionMessage['content']): string {
    if (typeof content === 'string') {
        return content.trim();
    }
    if (Array.isArray(content)) {
        return content
            .map((item) => item.text || '')
            .join('')
            .trim();
    }
    return '';
}

function getChatUrl(base: string, serverMode: AssistantServerMode): string {
    if (serverMode === 'legacy-lmstudio') {
        return `${base}/api/v1/chat`;
    }
    if (serverMode === 'openai-responses') {
        return `${base}/v1/responses`;
    }
    return `${base}/v1/chat/completions`;
}

function buildChatBody(
    serverMode: AssistantServerMode,
    modelId: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
): string {
    if (serverMode === 'openai-responses') {
        return JSON.stringify({
            model: modelId,
            input: messages,
            temperature: 0.7,
            max_output_tokens: 2048,
        });
    }

    return JSON.stringify({
        model: modelId,
        messages,
        temperature: 0.7,
        max_tokens: 2048,
    });
}

function isInputRequiredError(errorText: string): boolean {
    try {
        const parsed = JSON.parse(errorText);
        return parsed?.error?.param === 'input'
            && typeof parsed?.error?.message === 'string'
            && parsed.error.message.includes("'input' is required");
    } catch {
        return errorText.includes("'input' is required");
    }
}

function extractResponsesText(data: ResponsesApiResponse): string {
    const output = Array.isArray(data.output) ? data.output : [];
    for (const item of output) {
        if (item.type !== 'message' || item.role !== 'assistant' || !Array.isArray(item.content)) {
            continue;
        }
        for (const part of item.content) {
            if ((part.type === 'output_text' || part.type === 'text') && typeof part.text === 'string') {
                const text = part.text.trim();
                if (text) {
                    return text;
                }
            }
        }
    }

    for (const item of output) {
        if (!Array.isArray(item.content)) {
            continue;
        }
        for (const part of item.content) {
            if (typeof part.text === 'string') {
                const text = part.text.trim();
                if (text) {
                    return text;
                }
            }
        }
    }

    return '';
}

async function extractAssistantResponse(response: Response, serverMode: AssistantServerMode): Promise<string> {
    if (serverMode === 'openai-responses') {
        const data = (await response.json()) as ResponsesApiResponse;
        return extractResponsesText(data);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    return extractTextContent(data.choices?.[0]?.message?.content);
}

async function requestChatCompletion(input: {
    endpointUrl: string;
    serverMode: AssistantServerMode;
    modelId: string;
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
}): Promise<EnhanceResponse> {
    const base = normalizeUrl(input.endpointUrl);
    const url = getChatUrl(base, input.serverMode);
    const body = buildChatBody(input.serverMode, input.modelId, input.messages);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
        });

        if (!response.ok) {
            const errText = await readErrorText(response);
            if (response.status === 400 && input.serverMode !== 'openai-responses' && isInputRequiredError(errText)) {
                const retryResponse = await fetch(getChatUrl(base, 'openai-responses'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: buildChatBody('openai-responses', input.modelId, input.messages),
                });

                if (!retryResponse.ok) {
                    const retryErrText = await readErrorText(retryResponse);
                    return {
                        success: false,
                        response: '',
                        error: `Assistant server error ${retryResponse.status}: ${retryErrText}`,
                    };
                }

                const retryContent = await extractAssistantResponse(retryResponse, 'openai-responses');
                if (!retryContent) {
                    return {
                        success: false,
                        response: '',
                        error: 'Assistant server returned an empty response',
                    };
                }

                return { success: true, response: retryContent };
            }

            return {
                success: false,
                response: '',
                error: `Assistant server error ${response.status}: ${errText}`,
            };
        }

        const content = await extractAssistantResponse(response, input.serverMode);

        if (!content) {
            return {
                success: false,
                response: '',
                error: 'Assistant server returned an empty response',
            };
        }

        return { success: true, response: content };
    } catch (error) {
        return {
            success: false,
            response: '',
            error: `Failed to reach assistant server: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
    }
}

async function resolveServerMode(endpointUrl: string, preferredMode?: AssistantServerMode | null) {
    if (preferredMode) {
        const result = await fetchModelsForMode(endpointUrl, preferredMode);
        if (result.reachable) {
            return { serverMode: preferredMode, models: result.models };
        }
    }

    const probe = await probeAssistantConnection(endpointUrl);
    return {
        serverMode: probe.connection.serverMode,
        models: probe.connection.models,
        error: probe.connection.message || undefined,
    };
}

export async function enhancePrompt(
    text: string,
    modelId: string,
    systemPrompt: string,
    endpointUrl: string,
    preferredMode?: AssistantServerMode | null
): Promise<EnhanceResponse> {
    const resolved = await resolveServerMode(endpointUrl, preferredMode);
    if (!resolved.serverMode) {
        return {
            success: false,
            response: '',
            error: resolved.error || 'No compatible assistant server detected',
        };
    }

    return requestChatCompletion({
        endpointUrl,
        serverMode: resolved.serverMode,
        modelId,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text },
        ],
    });
}

function safeParseAssistantDraft(content: string): AssistantResponseDraft | null {
    const trimmed = content.trim();
    const normalized = trimmed.startsWith('```')
        ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
        : trimmed;

    try {
        const parsed = JSON.parse(normalized) as Partial<AssistantResponseDraft>;
        if (!parsed || typeof parsed.message !== 'string') {
            return null;
        }
        return {
            message: parsed.message,
            promptDraft: typeof parsed.promptDraft === 'string' ? parsed.promptDraft : null,
            negativePromptDraft: typeof parsed.negativePromptDraft === 'string' ? parsed.negativePromptDraft : null,
            parameterSuggestions: Array.isArray(parsed.parameterSuggestions)
                ? parsed.parameterSuggestions.filter((item): item is NonNullable<AssistantResponseDraft['parameterSuggestions']>[number] => {
                    return !!item
                        && typeof item === 'object'
                        && typeof item.key === 'string'
                        && ['negativeprompt', 'steps', 'cfgscale', 'sampler', 'scheduler', 'width', 'height'].includes(item.key)
                        && (typeof item.value === 'string' || typeof item.value === 'number');
                })
                : [],
            reasoningNote: typeof parsed.reasoningNote === 'string' ? parsed.reasoningNote : null,
        };
    } catch {
        return null;
    }
}

export async function chatWithAssistant(input: {
    endpointUrl: string;
    modelId: string;
    systemPrompt: string;
    conversation: AssistantChatTurn[];
    preferredMode?: AssistantServerMode | null;
}): Promise<AssistantChatResponse> {
    const resolved = await resolveServerMode(input.endpointUrl, input.preferredMode);
    if (!resolved.serverMode) {
        return {
            success: false,
            response: '',
            error: resolved.error || 'No compatible assistant server detected',
        };
    }

    const response = await requestChatCompletion({
        endpointUrl: input.endpointUrl,
        serverMode: resolved.serverMode,
        modelId: input.modelId,
        messages: [
            { role: 'system', content: `${input.systemPrompt}\n\n${JSON_RESPONSE_INSTRUCTION}` },
            ...input.conversation
                .filter((turn) => turn.role !== 'system')
                .map((turn) => ({ role: turn.role, content: turn.content })),
        ],
    });

    if (!response.success) {
        return response;
    }

    const draft = safeParseAssistantDraft(response.response);
    if (!draft) {
        return {
            success: true,
            response: response.response,
            draft: {
                message: response.response,
                promptDraft: null,
                negativePromptDraft: null,
                parameterSuggestions: [],
                reasoningNote: null,
            },
        };
    }

    return {
        success: true,
        response: draft.message,
        draft,
    };
}
