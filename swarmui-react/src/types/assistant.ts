export type AssistantServerMode = 'legacy-lmstudio' | 'openai-compatible' | 'openai-responses';
export type AssistantProviderKind = 'local' | 'openrouter' | 'openai-compatible';

export interface AssistantRequestConfig {
    provider?: AssistantProviderKind;
    apiKey?: string;
    referer?: string;
    title?: string;
}

export interface AssistantModel {
    id: string;
    name: string;
    serverMode: AssistantServerMode;
}

export interface AssistantConnectionStatus {
    state: 'idle' | 'connecting' | 'connected' | 'reachable_no_models' | 'unreachable' | 'error';
    message: string | null;
    serverMode: AssistantServerMode | null;
    endpointUrl: string;
    models: AssistantModel[];
    lastCheckedAt: number | null;
}

export interface AssistantChatTurn {
    id: string;
    role: 'system' | 'user' | 'assistant';
    content: string;
    createdAt: number;
    draft?: AssistantResponseDraft | null;
}

export type AssistantParameterKey =
    | 'negativeprompt'
    | 'steps'
    | 'cfgscale'
    | 'sampler'
    | 'scheduler'
    | 'width'
    | 'height';

export interface AssistantParameterSuggestion {
    key: AssistantParameterKey;
    value: string | number;
    reason?: string;
}

export interface AssistantResponseDraft {
    message: string;
    promptDraft?: string | null;
    negativePromptDraft?: string | null;
    parameterSuggestions?: AssistantParameterSuggestion[];
    reasoningNote?: string | null;
}

export interface AssistantApplyPatch {
    prompt?: string;
    promptAppend?: string;
    negativeprompt?: string;
    parameters?: Partial<Record<AssistantParameterKey, string | number>>;
}

export interface AssistantProbeResult {
    ok: boolean;
    connection: AssistantConnectionStatus;
}
