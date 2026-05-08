import { probeAssistantConnection } from './magicPromptService';
import type { AssistantRequestConfig, AssistantServerMode } from '../types/assistant';
import type {
    ChatMessage,
    RoleplayCharacter,
    RoleplayModelCompatibilitySettings,
    RoleplayPromptBudgetMode,
} from '../types/roleplay';
import { ROLEPLAY_MAX_MEMORY_FACTS } from '../features/roleplay/roleplayMemory';

export { probeAssistantConnection };

/**
 * Parses and removes a [SCENE: prompt] tag from AI-generated text.
 * The AI is instructed to write these tags when it wants to suggest a scene image.
 */
export function parseSceneTag(text: string): { cleanText: string; scenePrompt: string | null } {
    const match = text.match(/\[SCENE:\s*([\s\S]*?)\]/i);
    if (match) {
        return {
            cleanText: text.replace(/\[SCENE:[\s\S]*?\]/i, '').trim(),
            scenePrompt: match[1].trim(),
        };
    }
    return { cleanText: text, scenePrompt: null };
}

function normalizeUrl(url: string): string {
    return url.replace(/\/+$/, '');
}

function normalizeOpenAIBaseUrl(endpointUrl: string): string {
    const base = normalizeUrl(endpointUrl);
    return base.endsWith('/v1') ? base : `${base}/v1`;
}

function buildAssistantHeaders(config?: AssistantRequestConfig): HeadersInit {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    const apiKey = config?.apiKey?.trim();
    if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
    }
    if (config?.provider === 'openrouter') {
        if (config.referer?.trim()) {
            headers['HTTP-Referer'] = config.referer.trim();
        }
        headers['X-OpenRouter-Title'] = config.title?.trim() || 'SwarmUI Roleplay';
    }
    return headers;
}

interface StreamChatInput {
    endpointUrl: string;
    serverMode: AssistantServerMode;
    modelId: string;
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    onToken: (token: string) => void;
    onDone: (fullText: string) => void;
    onError: (error: string) => void;
    onServerModeCorrection?: (mode: AssistantServerMode) => void;
    signal?: AbortSignal;
    temperature?: number;
    maxTokens?: number;
    compatibility?: RoleplayModelCompatibilitySettings;
    requestConfig?: AssistantRequestConfig;
}

interface NonStreamingChatInput {
    endpointUrl: string;
    serverMode: AssistantServerMode;
    modelId: string;
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    temperature?: number;
    maxTokens?: number;
    compatibility?: RoleplayModelCompatibilitySettings;
    requestConfig?: AssistantRequestConfig;
}

interface NonStreamingChatResult {
    success: boolean;
    content: string;
    error?: string;
    correctedMode?: AssistantServerMode;
}

interface SSEChunk {
    choices?: Array<{
        delta?: { content?: string };
        finish_reason?: string | null;
    }>;
}

function getChatUrl(base: string, serverMode: AssistantServerMode): string {
    if (serverMode === 'legacy-lmstudio') return `${base}/api/v1/chat`;
    if (serverMode === 'openai-responses') return `${normalizeOpenAIBaseUrl(base)}/responses`;
    return `${normalizeOpenAIBaseUrl(base)}/chat/completions`;
}

function buildChatBody(
    serverMode: AssistantServerMode,
    modelId: string,
    messages: Array<{ role: string; content: string }>,
    options: { temperature?: number; max_tokens?: number; stream?: boolean } = {}
): string {
    const { temperature = 0.8, max_tokens = 2048, stream = true } = options;

    if (serverMode === 'openai-responses') {
        return JSON.stringify({
            model: modelId,
            input: messages,
            temperature,
            max_output_tokens: max_tokens,
            stream,
        });
    }

    return JSON.stringify({
        model: modelId,
        messages,
        temperature,
        max_tokens,
        stream,
    });
}

/**
 * Checks if a 400 error response indicates the server wants the Responses API
 * format (uses 'input' instead of 'messages').
 */
function isInputRequiredError(errorText: string): boolean {
    try {
        const parsed = JSON.parse(errorText);
        return parsed?.error?.param === 'input' && parsed?.error?.message?.includes("'input' is required");
    } catch {
        return errorText.includes("'input' is required");
    }
}

async function parseSSEStream(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    onToken: (token: string) => void,
    signal?: AbortSignal
): Promise<string> {
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    while (true) {
        if (signal?.aborted) {
            reader.cancel();
            break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        // Keep the last potentially incomplete line in the buffer
        buffer = lines.pop() ?? '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue;

            if (trimmed === 'data: [DONE]') {
                return fullText;
            }

            if (trimmed.startsWith('data: ')) {
                const jsonStr = trimmed.slice(6);
                try {
                    const chunk = JSON.parse(jsonStr) as SSEChunk;
                    const content = chunk.choices?.[0]?.delta?.content;
                    if (content) {
                        fullText += content;
                        onToken(content);
                    }
                } catch {
                    // Skip malformed JSON chunks
                }
            }
        }
    }

    return fullText;
}

/**
 * Parses SSE stream from the OpenAI Responses API format.
 * Events use `response.output_text.delta` with a `delta` field.
 */
async function parseResponsesAPIStream(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    onToken: (token: string) => void,
    signal?: AbortSignal
): Promise<string> {
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    while (true) {
        if (signal?.aborted) {
            reader.cancel();
            break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        let currentEvent = '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) {
                currentEvent = '';
                continue;
            }

            if (trimmed.startsWith('event: ')) {
                currentEvent = trimmed.slice(7);
                continue;
            }

            if (trimmed.startsWith('data: ')) {
                const jsonStr = trimmed.slice(6);

                // End of stream
                if (currentEvent === 'response.completed' || currentEvent === 'response.done') {
                    return fullText;
                }

                try {
                    const data = JSON.parse(jsonStr) as Record<string, unknown>;

                    // Handle response.output_text.delta events
                    if (
                        currentEvent === 'response.output_text.delta' ||
                        data.type === 'response.output_text.delta'
                    ) {
                        const delta = data.delta as string | undefined;
                        if (delta) {
                            fullText += delta;
                            onToken(delta);
                        }
                    }

                    // Also handle content_part delta format (some servers)
                    if (
                        currentEvent === 'response.content_part.delta' ||
                        data.type === 'response.content_part.delta'
                    ) {
                        const delta = data.delta as string | undefined;
                        if (delta) {
                            fullText += delta;
                            onToken(delta);
                        }
                    }

                    // Fallback: check for chat-completions-style delta in the data
                    const choices = (data as SSEChunk).choices;
                    if (choices?.[0]?.delta?.content) {
                        const content = choices[0].delta.content;
                        fullText += content;
                        onToken(content);
                    }
                } catch {
                    // Skip malformed JSON
                }
            }
        }
    }

    return fullText;
}

async function doStreamRequest(
    url: string,
    body: string,
    serverMode: AssistantServerMode,
    input: StreamChatInput
): Promise<{ ok: true } | { ok: false; status: number; errorText: string }> {
    const response = await fetch(url, {
        method: 'POST',
        headers: buildAssistantHeaders(input.requestConfig),
        body,
        signal: input.signal,
    });

    if (!response.ok) {
        const errText = await response.text().catch(() => response.statusText);
        return { ok: false, status: response.status, errorText: errText };
    }

    if (!response.body) {
        input.onError('Response body is not readable');
        return { ok: true };
    }

    const reader = response.body.getReader();
    const parser = serverMode === 'openai-responses' ? parseResponsesAPIStream : parseSSEStream;
    const fullText = await parser(reader, input.onToken, input.signal);
    if (!input.signal?.aborted && !fullText.trim()) {
        input.onError('Chat server ended the stream without response text.');
        return { ok: true };
    }
    input.onDone(fullText);
    return { ok: true };
}

export async function streamRoleplayChat(input: StreamChatInput): Promise<void> {
    const base = normalizeUrl(input.endpointUrl);
    const compatibleMessages = applyCompatibilitySettings(input.messages, input.compatibility);

    try {
        const url = getChatUrl(base, input.serverMode);
        const body = buildChatBody(input.serverMode, input.modelId, compatibleMessages, {
            temperature: input.temperature,
            max_tokens: input.maxTokens,
        });

        const result = await doStreamRequest(url, body, input.serverMode, input);

        if (!result.ok) {
            // If server returned 400 asking for 'input', auto-retry with Responses API format
            if (
                result.status === 400 &&
                input.serverMode !== 'openai-responses' &&
                isInputRequiredError(result.errorText)
            ) {
                const retryUrl = getChatUrl(base, 'openai-responses');
                const retryBody = buildChatBody('openai-responses', input.modelId, compatibleMessages, {
                    temperature: input.temperature,
                    max_tokens: input.maxTokens,
                });
                const retryResult = await doStreamRequest(retryUrl, retryBody, 'openai-responses', input);

                if (retryResult.ok) {
                    // Notify caller to update stored server mode
                    input.onServerModeCorrection?.('openai-responses');
                    return;
                }

                // Retry also failed — report the retry error
                if (!retryResult.ok) {
                    input.onError(`Server error ${retryResult.status}: ${retryResult.errorText}`);
                    return;
                }
            }

            input.onError(`Server error ${result.status}: ${result.errorText}`);
        }
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            return;
        }
        input.onError(
            `Failed to reach chat server: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
    }
}

async function extractTextFromResponse(
    response: Response,
    serverMode: AssistantServerMode
): Promise<NonStreamingChatResult> {
    const data = await response.json();

    let content: string | undefined;

    if (serverMode === 'openai-responses') {
        // Responses API format: prefer assistant message output_text over reasoning_text.
        const output = (data as Record<string, unknown>).output;
        if (Array.isArray(output)) {
            for (const item of output) {
                const typedItem = item as Record<string, unknown>;
                if (typedItem.type !== 'message' || typedItem.role !== 'assistant') {
                    continue;
                }

                const itemContent = typedItem.content;
                if (Array.isArray(itemContent)) {
                    for (const part of itemContent) {
                        const typedPart = part as Record<string, unknown>;
                        const text = typedPart.text;
                        if (
                            (typedPart.type === 'output_text' || typedPart.type === 'text') &&
                            typeof text === 'string'
                        ) {
                            content = text.trim();
                            break;
                        }
                    }
                }
                if (content) break;
            }
        }

        if (!content) {
            const fallbackOutput = (data as Record<string, unknown>).output;
            if (Array.isArray(fallbackOutput)) {
                for (const item of fallbackOutput) {
                    const itemContent = (item as Record<string, unknown>).content;
                    if (Array.isArray(itemContent)) {
                        for (const part of itemContent) {
                            const typedPart = part as Record<string, unknown>;
                            const text = typedPart.text;
                            if (typeof text === 'string') {
                                content = text.trim();
                                break;
                            }
                        }
                    }
                    if (content) break;
                }
            }
        }
    } else {
        // Chat Completions format
        const choices = (data as { choices?: Array<{ message?: { content?: string } }> }).choices;
        content = choices?.[0]?.message?.content?.trim();
    }

    if (!content) {
        return { success: false, content: '', error: 'Empty response from server' };
    }

    return { success: true, content };
}

function applyCompatibilitySettings(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    compatibility?: RoleplayModelCompatibilitySettings
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    let nextMessages = messages
        .map((message) => ({
            ...message,
            content: message.content.trim(),
        }))
        .filter((message) => message.content)
        .filter((message, index, source) => {
            const previousMessage = source[index - 1];
            if (!previousMessage) {
                return true;
            }

            return !(
                previousMessage.role === message.role &&
                previousMessage.content === message.content
            );
        });

    if (!compatibility) {
        return nextMessages;
    }

    if (compatibility.inlineSystemPrompt) {
        const systemInstructions = nextMessages
            .filter((message) => message.role === 'system')
            .map((message) => message.content)
            .join('\n\n')
            .trim();
        nextMessages = nextMessages.filter((message) => message.role !== 'system');

        if (systemInstructions) {
            const firstUserIndex = nextMessages.findIndex((message) => message.role === 'user');
            const instructionPrefix =
                'Follow these instructions for the entire conversation:\n' +
                systemInstructions;

            if (firstUserIndex >= 0) {
                nextMessages[firstUserIndex] = {
                    ...nextMessages[firstUserIndex],
                    content:
                        `${instructionPrefix}\n\nCurrent user request:\n` +
                        nextMessages[firstUserIndex].content,
                };
            } else {
                nextMessages.unshift({
                    role: 'user',
                    content:
                        `${instructionPrefix}\n\nRespond to the conversation so far while staying in character.`,
                });
            }
        }
    }

    if (!nextMessages.some((message) => message.role === 'user')) {
        nextMessages.push({
            role: 'user',
            content: 'Respond appropriately while following all prior instructions and context.',
        });
    }

    if (compatibility.forceFinalUserTurn && nextMessages[nextMessages.length - 1]?.role !== 'user') {
        nextMessages.push({
            role: 'user',
            content:
                'Continue naturally from the conversation so far while following all prior instructions and staying in character.',
        });
    }

    return nextMessages;
}

async function requestNonStreamingChat(input: NonStreamingChatInput): Promise<NonStreamingChatResult> {
    const base = normalizeUrl(input.endpointUrl);
    const url = getChatUrl(base, input.serverMode);
    const compatibleMessages = applyCompatibilitySettings(input.messages, input.compatibility);
    const body = buildChatBody(input.serverMode, input.modelId, compatibleMessages, {
        temperature: input.temperature,
        max_tokens: input.maxTokens,
        stream: false,
    });

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: buildAssistantHeaders(input.requestConfig),
            body,
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => response.statusText);

            if (response.status === 400 && input.serverMode !== 'openai-responses' && isInputRequiredError(errText)) {
                const retryUrl = getChatUrl(base, 'openai-responses');
                const retryBody = buildChatBody('openai-responses', input.modelId, compatibleMessages, {
                    temperature: input.temperature,
                    max_tokens: input.maxTokens,
                    stream: false,
                });
                const retryResponse = await fetch(retryUrl, {
                    method: 'POST',
                    headers: buildAssistantHeaders(input.requestConfig),
                    body: retryBody,
                });

                if (!retryResponse.ok) {
                    const retryErr = await retryResponse.text().catch(() => retryResponse.statusText);
                    return {
                        success: false,
                        content: '',
                        error: `Server error ${retryResponse.status}: ${retryErr}`,
                    };
                }

                const retryResult = await extractTextFromResponse(retryResponse, 'openai-responses');
                return {
                    ...retryResult,
                    correctedMode: retryResult.success ? 'openai-responses' : undefined,
                };
            }

            return { success: false, content: '', error: `Server error ${response.status}: ${errText}` };
        }

        return extractTextFromResponse(response, input.serverMode);
    } catch (error) {
        return {
            success: false,
            content: '',
            error: `Failed to reach server: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
    }
}

export async function testRoleplayServerReply(input: {
    endpointUrl: string;
    serverMode: AssistantServerMode;
    modelId: string;
    compatibility?: RoleplayModelCompatibilitySettings;
    requestConfig?: AssistantRequestConfig;
}): Promise<{ success: boolean; content: string; error?: string; correctedMode?: AssistantServerMode }> {
    const result = await requestNonStreamingChat({
        endpointUrl: input.endpointUrl,
        serverMode: input.serverMode,
        modelId: input.modelId,
        messages: [
            {
                role: 'system',
                content:
                    'You are testing a local roleplay model connection. Reply in character as a concise fantasy innkeeper. Keep it under 35 words.',
            },
            {
                role: 'user',
                content: 'A traveler steps inside and asks whether the road ahead is safe.',
            },
        ],
        temperature: 0.7,
        maxTokens: 80,
        compatibility: input.compatibility,
        requestConfig: input.requestConfig,
    });

    return result;
}

function extractJsonObject(text: string): string | null {
    const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fencedMatch?.[1]?.trim() || text.trim();
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');

    if (start === -1 || end === -1 || end <= start) {
        return null;
    }

    return candidate.slice(start, end + 1);
}

export async function generateSceneDescription(input: {
    endpointUrl: string;
    serverMode: AssistantServerMode;
    modelId: string;
    conversationContext: string;
    sceneSuggestionPrompt: string;
    compatibility?: RoleplayModelCompatibilitySettings;
    requestConfig?: AssistantRequestConfig;
}): Promise<{ success: boolean; description: string; error?: string; correctedMode?: AssistantServerMode }> {
    const result = await requestNonStreamingChat({
        endpointUrl: input.endpointUrl,
        serverMode: input.serverMode,
        modelId: input.modelId,
        messages: [
            { role: 'system', content: input.sceneSuggestionPrompt },
            { role: 'user', content: input.conversationContext },
        ],
        temperature: 0.7,
        maxTokens: 200,
        compatibility: input.compatibility,
        requestConfig: input.requestConfig,
    });

    if (!result.success) {
        return { success: false, description: '', error: result.error };
    }

    return {
        success: true,
        description: result.content,
        correctedMode: result.correctedMode,
    };
}

export async function generateRoleplayMemory(input: {
    endpointUrl: string;
    serverMode: AssistantServerMode;
    modelId: string;
    character: Pick<RoleplayCharacter, 'name' | 'interactionStyle' | 'personality' | 'systemPrompt' | 'conversationSummary' | 'continuity' | 'memoryFacts'>;
    sourceMessages: ChatMessage[];
    conversationContext: string;
    memoryBudgetMode?: RoleplayPromptBudgetMode;
    compatibility?: RoleplayModelCompatibilitySettings;
    requestConfig?: AssistantRequestConfig;
}): Promise<{
    success: boolean;
    conversationSummary: string;
    continuity: RoleplayCharacter['continuity'];
    memoryFacts: string[];
    error?: string;
    correctedMode?: AssistantServerMode;
}> {
    const existingPinnedFacts = input.character.memoryFacts
        .filter((fact) => fact.pinned)
        .map((fact) => fact.text.trim())
        .filter((fact) => fact);
    const existingFacts = input.character.memoryFacts
        .map((fact) => fact.text.trim())
        .filter((fact) => fact);
    const compactMemory = input.memoryBudgetMode === 'compact' || input.memoryBudgetMode === 'micro';

    const result = await requestNonStreamingChat({
        endpointUrl: input.endpointUrl,
        serverMode: input.serverMode,
        modelId: input.modelId,
        messages: [
            {
                role: 'system',
                content:
                    'You maintain long-term memory for a roleplay conversation. ' +
                    'Summarize only durable context and extract only stable, important facts. ' +
                    (compactMemory
                        ? 'Be terse. Prefer short clauses and preserve only the highest-value continuity. '
                        : '') +
                    'Keep names, relationship state, promises, preferences, unresolved threads, ' +
                    'major events, current location, current situation, and lasting details. Exclude fluff, one-off wording, and purely ' +
                    'stylistic phrases. Return JSON only with this exact shape: ' +
                    '{"conversationSummary":"string","continuity":{"relationshipSummary":"string","currentLocation":"string","currentSituation":"string","openThreads":["thread 1"]},"memoryFacts":["fact 1","fact 2"]}.',
            },
            {
                role: 'user',
                content: JSON.stringify({
                    characterName: input.character.name,
                    interactionStyle: input.character.interactionStyle,
                    personality: input.character.personality,
                    systemPrompt: input.character.systemPrompt,
                    existingSummary: input.character.conversationSummary,
                    existingContinuity: input.character.continuity,
                    existingFacts,
                    pinnedFacts: existingPinnedFacts,
                    maxFacts: ROLEPLAY_MAX_MEMORY_FACTS,
                    sourceMessageCount: input.sourceMessages.length,
                    conversationContext: input.conversationContext,
                }),
            },
        ],
        temperature: 0.3,
        maxTokens: input.memoryBudgetMode === 'micro' ? 360 : compactMemory ? 520 : 800,
        compatibility: input.compatibility,
        requestConfig: input.requestConfig,
    });

    if (!result.success) {
        return {
            success: false,
            conversationSummary: '',
            continuity: {
                relationshipSummary: '',
                currentLocation: '',
                currentSituation: '',
                openThreads: [],
            },
            memoryFacts: [],
            error: result.error,
        };
    }

    const jsonText = extractJsonObject(result.content);
    if (!jsonText) {
        return {
            success: false,
            conversationSummary: '',
            continuity: {
                relationshipSummary: '',
                currentLocation: '',
                currentSituation: '',
                openThreads: [],
            },
            memoryFacts: [],
            error: 'Memory response was not valid JSON.',
        };
    }

    try {
        const parsed = JSON.parse(jsonText) as {
            conversationSummary?: unknown;
            continuity?: unknown;
            memoryFacts?: unknown;
        };
        const conversationSummary =
            typeof parsed.conversationSummary === 'string'
                ? parsed.conversationSummary.trim()
                : '';
        const parsedContinuity =
            parsed.continuity && typeof parsed.continuity === 'object'
                ? (parsed.continuity as Record<string, unknown>)
                : {};
        const continuity = {
            relationshipSummary:
                typeof parsedContinuity.relationshipSummary === 'string'
                    ? parsedContinuity.relationshipSummary.trim()
                    : '',
            currentLocation:
                typeof parsedContinuity.currentLocation === 'string'
                    ? parsedContinuity.currentLocation.trim()
                    : '',
            currentSituation:
                typeof parsedContinuity.currentSituation === 'string'
                    ? parsedContinuity.currentSituation.trim()
                    : '',
            openThreads: Array.isArray(parsedContinuity.openThreads)
                ? parsedContinuity.openThreads
                      .filter((thread): thread is string => typeof thread === 'string')
                      .map((thread) => thread.trim())
                      .filter((thread) => thread)
                      .slice(0, 6)
                : [],
        };
        const memoryFacts = Array.isArray(parsed.memoryFacts)
            ? parsed.memoryFacts
                  .filter((fact): fact is string => typeof fact === 'string')
                  .map((fact) => fact.trim())
                  .filter((fact) => fact)
                  .slice(0, ROLEPLAY_MAX_MEMORY_FACTS)
            : [];

        return {
            success: true,
            conversationSummary,
            continuity,
            memoryFacts,
            correctedMode: result.correctedMode,
        };
    } catch (error) {
        return {
            success: false,
            conversationSummary: '',
            continuity: {
                relationshipSummary: '',
                currentLocation: '',
                currentSituation: '',
                openThreads: [],
            },
            memoryFacts: [],
            error: `Failed to parse memory JSON: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
    }
}
