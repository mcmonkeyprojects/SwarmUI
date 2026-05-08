import type {
    AssistantChatTurn,
    AssistantConnectionStatus,
    AssistantModel,
    AssistantProbeResult,
    AssistantRequestConfig,
    AssistantResponseDraft,
    AssistantServerMode,
} from '../types/assistant';
import {
    inferPromptPresetKey,
    resolvePromptEnhancePreset,
} from '../stores/promptEnhanceStore';
import type {
    PromptEnhanceCreativeStrength,
    PromptEnhanceFormatMode,
    PromptPresetKey,
} from '../stores/promptEnhanceStore';

export interface MagicPromptModel {
    model: string;
    name: string;
}

interface EnhanceResponse {
    success: boolean;
    response: string;
    error?: string;
}

interface AssistantActionResponse {
    success: boolean;
    error?: string;
}

interface AssistantChatResponse extends EnhanceResponse {
    draft?: AssistantResponseDraft;
}

export function inferPromptFormatPreset(modelName: string | null | undefined): PromptPresetKey {
    return inferPromptPresetKey(modelName);
}

export interface PromptEnhancementDraft {
    message: string;
    promptDraft: string | null;
    negativePromptDraft: string | null;
    formatPreset: PromptPresetKey;
    reasoningNote: string | null;
}

export interface RoleplayImageEnhancementDraft {
    sceneSummary: string;
    promptDraft: string | null;
    negativePromptDraft: string | null;
    reasoningNote: string | null;
}

interface PromptEnhanceResponse extends EnhanceResponse {
    draft?: PromptEnhancementDraft;
}

interface RoleplayImageEnhanceResponse extends EnhanceResponse {
    draft?: RoleplayImageEnhancementDraft;
}

export interface PromptEnhanceRequestOptions {
    formatMode?: PromptEnhanceFormatMode;
    creativeStrength?: PromptEnhanceCreativeStrength;
    imageModelId?: string;
    promptRole?: 'prompt' | 'negative';
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

const PROMPT_ENHANCEMENT_JSON_INSTRUCTION = [
    'Respond with valid JSON only.',
    'Use this exact shape:',
    '{"message":"string","promptDraft":"string|null","negativePromptDraft":"string|null","formatPreset":"sd|illustrious|pony|flux|zimage","reasoningNote":"string|null"}',
    'Do not wrap the JSON in markdown fences.',
    'Do not include chain-of-thought, analysis, planning, commentary, apologies, preambles, or postambles.',
    'For reasoning models: no <think> blocks and no hidden reasoning text. Put only a short user-facing summary in reasoningNote if helpful.',
    'Do not repeat the original prompt. promptDraft must contain only the rewritten enhanced prompt, and negativePromptDraft must contain only the rewritten negative prompt.',
].join(' ');

const ROLEPLAY_IMAGE_ENHANCEMENT_JSON_INSTRUCTION = [
    'Respond with valid JSON only.',
    'Use this exact shape:',
    '{"sceneSummary":"string","promptDraft":"string|null","negativePromptDraft":"string|null","reasoningNote":"string|null"}',
    'Do not wrap the JSON in markdown fences.',
    'Do not include chain-of-thought, analysis, planning, commentary, apologies, preambles, or postambles.',
].join(' ');

const FORMAT_INSTRUCTIONS: Record<PromptPresetKey, string> = {
    sd: [
        'Use SD/SDXL-friendly formatting: a concise comma-separated prompt with natural-language phrases.',
        'Include subject, medium, style, composition, lighting, camera/view, environment, detail, and quality modifiers.',
        'Quality modifiers may include terms like masterpiece, best quality, highly detailed, sharp focus, cinematic lighting when appropriate.',
    ].join(' '),
    illustrious: [
        'Use Illustrious/anime XL formatting: Booru-style tags mixed with short natural-language phrases.',
        'Include character details, pose, expression, outfit, environment, composition, lighting, anime coloring, cel shading, masterpiece, best quality, absurdres when appropriate.',
    ].join(' '),
    pony: [
        'Use Pony Diffusion formatting.',
        'Start the positive prompt with score_9, score_8_up, score_7_up, score_6_up, score_5_up, score_4_up, then a source tag such as source_anime, source_cartoon, or source_pony when appropriate.',
        'Continue with descriptive Booru-style tags for subject, character details, pose, style, composition, lighting, and quality.',
    ].join(' '),
    flux: [
        'Use Flux formatting: detailed natural-language prose rather than Booru tags or generic comma keyword spam.',
        'Write fluent sentences covering the subject, scene, mood, lighting, materials, camera angle, composition, and visual style.',
    ].join(' '),
    zimage: [
        'Use Z Image formatting: descriptive natural-language phrases with selective quality modifiers.',
        'Include subject, environment, lighting, mood, materials, camera perspective, style, and clean quality terms.',
    ].join(' '),
};

const STRENGTH_INSTRUCTIONS: Record<PromptEnhanceCreativeStrength, string> = {
    conservative: 'Conservative expansion: mostly clean up, format, and clarify what the user wrote with only light extra detail.',
    balanced: 'Balanced expansion: preserve the core idea while adding useful composition, lighting, medium, style, detail, and negative prompt coverage without inventing major new content.',
    rich: 'Cinematic rich expansion: add stronger mood, setting, camera, materials, lighting, and artistic direction while keeping the main subject recognizable.',
};

const ANATOMY_DETAIL_INSTRUCTION = [
    'Character and anatomy detail policy:',
    'If the prompt includes a person, character, animal, creature, humanoid, or body-focused subject, explicitly define visible anatomy and presentation details.',
    'Cover eyes, hair, face, expression, head angle, hands, arms, legs, body shape, pose, clothing fit, skin/fur/scale/material texture, and other visible body parts when relevant.',
    'If the user omits those details, fill them in with plausible coherent choices that support the prompt instead of leaving the subject generic.',
    'Do not contradict explicit user details. Avoid adding extra people, species, limbs, or anatomy mutations unless requested.',
].join(' ');

const PROMPT_CRAFT_INSTRUCTION = [
    'Composition hierarchy:',
    'Order prompt details from most important to least important: subject, anatomy/identity, pose/action, clothing/materials, environment, lighting, camera/composition, style/quality.',
    'Model-friendly restraint: Do not overload the prompt with redundant synonyms, filler adjectives, or too many quality tags. Prefer precise visual details over repeated boosters.',
    'Camera and framing defaults: If framing is missing, choose a clear framing such as close-up, medium shot, full body, wide shot, macro, or overhead view based on the subject.',
    'Style consistency: Keep medium, style, lighting, and rendering language compatible. Do not mix contradictory styles unless requested.',
    'Ambiguity resolution: When user input is vague, choose one coherent interpretation instead of listing alternatives.',
    'Prompt length control: Keep enhanced prompts concise but complete, usually 60-140 words for prose formats or 25-60 tags for tag formats.',
    'Identity preservation: Do not change age category, gender presentation, species, ethnicity, body type, hairstyle, outfit, expression, or other specified identity details.',
].join(' ');

const NEGATIVE_PROMPT_TARGETING_INSTRUCTION = [
    'Negative prompt targeting:',
    'Tailor negative prompts to the subject instead of using only generic quality terms.',
    'For people and characters, cover anatomy/rendering defects such as bad anatomy, extra fingers, missing fingers, malformed hands, asymmetrical eyes, distorted face, broken limbs, and unwanted deformations.',
    'For landscapes and environments, cover clutter, bad perspective, warped horizon, muddy details, compression artifacts, excessive haze, and unwanted objects.',
    'For products, UI, typography, or logos, cover warped text, unreadable letters, bad reflections, distorted geometry, deformed logos, and incorrect branding artifacts.',
].join(' ');

const ADULT_DETAIL_INSTRUCTION = [
    'Adult and NSFW detail policy:',
    'Enhance sensual or NSFW details only when the user explicitly requests adult or NSFW content and all subjects are clearly adults.',
    'When allowed by the prompt, define adult presentation details such as confident pose, body shape, skin texture, intimate mood, styling, wardrobe state, lighting, framing, and tasteful erotic visual emphasis.',
    'Fill in missing adult visual details with coherent choices that match the requested style and scene.',
    'Do not add NSFW details to ordinary prompts, ambiguous-age subjects, youthful-coded subjects, or prompts that do not ask for adult content.',
    'Do not change stated identity, age category, body type, clothing, relationship context, or boundaries.',
].join(' ');

const FULL_PROMPT_EVALUATION_INSTRUCTION = [
    'Full prompt evaluation:',
    'Evaluate the entire prompt between the prompt delimiters, from first character to last character.',
    'Preserve and improve all explicit clauses, subjects, actions, constraints, style requests, exclusions, and late prompt details.',
    'Do not summarize only the beginning, echo the prompt unchanged, or drop trailing details.',
    'If the prompt is long, compress and organize the whole prompt while retaining every important instruction.',
].join(' ');

const SWARM_PROMPT_SYNTAX_INSTRUCTION = [
    'SwarmUI prompt syntax policy:',
    'Preserve existing SwarmUI syntax tags exactly unless improving the surrounding natural-language prompt requires moving them.',
    'Do not corrupt angle-bracket syntax such as <random:...>, <alternate:...>, <fromto[0.5]:...>, <wildcard:...>, <setvar[name]:...>, <var:name>, <macro:name>, <trigger>, <lora:...>, <embed:...>, <preset:...>, <param[name]:...>, <segment:...>, <region:...>, or <object:...>.',
    'Use syntax sparingly and only when it clearly helps the user request.',
    'For SD/SDXL-style prompts, weighting like (important detail:1.2) may be used for one or two key concepts, but avoid weighting spam and avoid adding weighting for Flux-style prose.',
    'Subject emphasis weighting: for SD/SDXL, Pony, and Illustrious formats, use moderate weights for critical subject count, identity, and anatomy constraints when they must not be ignored, usually 1.1-1.35.',
    'Good emphasis examples include (exactly two characters:1.3), (both characters clearly visible:1.25), (distinct faces:1.2), (detailed hands:1.2), and (expressive eyes:1.15).',
    'Pair subject-count emphasis with plain text constraints and negative prompt terms such as extra people, third person, duplicate character, missing character, or cropped character.',
    'Avoid extreme weights, avoid weighting every tag, and avoid weighting for Flux or other natural-language formats where parentheses may be treated as literal text.',
    'For variation requests, use <random:option1|option2|option3> or <alternate:optionA,optionB> only if the user wants controlled variation.',
    'For repeated randomized attributes, use <setvar[name]:...> and <var:name> to keep details consistent across the prompt.',
    'For character detail improvement, suggest <segment:face,0.6,0.5> or <segment:hands,0.6,0.5> only when localized refinement is useful and compatible with the prompt.',
    'Do not invent LoRA, embedding, preset, wildcard, trigger, or parameter names that are not present in the original prompt or current context.',
].join(' ');

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

function buildAssistantGetHeaders(config?: AssistantRequestConfig): HeadersInit {
    return {
        ...buildAssistantHeaders(config),
        Accept: 'application/json',
    };
}

function stripJsonFences(content: string): string {
    const trimmed = content.trim();
    return trimmed.startsWith('```')
        ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
        : trimmed;
}

function stripReasoningText(content: string): string {
    return content
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<analysis>[\s\S]*?<\/analysis>/gi, '')
        .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
        .trim();
}

function extractFirstJsonObject(content: string): string | null {
    const start = content.indexOf('{');
    if (start < 0) {
        return null;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < content.length; i++) {
        const char = content[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (char === '\\') {
            escaped = true;
            continue;
        }
        if (char === '"') {
            inString = !inString;
            continue;
        }
        if (inString) {
            continue;
        }
        if (char === '{') {
            depth++;
        } else if (char === '}') {
            depth--;
            if (depth === 0) {
                return content.slice(start, i + 1);
            }
        }
    }

    return null;
}

function normalizeAssistantJsonContent(content: string): string {
    const withoutReasoning = stripReasoningText(stripJsonFences(content));
    return extractFirstJsonObject(withoutReasoning) || withoutReasoning;
}

function cleanDraftText(text: string, preferredLabels: string[]): string {
    let cleaned = stripReasoningText(text).trim();
    for (const label of preferredLabels) {
        const pattern = new RegExp(`${label}\\s*:\\s*`, 'i');
        const match = pattern.exec(cleaned);
        if (match && match.index >= 0) {
            cleaned = cleaned.slice(match.index + match[0].length).trim();
            break;
        }
    }
    cleaned = cleaned
        .replace(/^(?:enhanced prompt|new prompt|rewritten prompt|prompt draft|prompt)\s*:\s*/i, '')
        .replace(/^(?:negative prompt|negative prompt draft)\s*:\s*/i, '')
        .trim();
    const nextSection = cleaned.search(/\n\s*(?:negative prompt|negative prompt draft|reasoning|notes?|original prompt)\s*:/i);
    return (nextSection >= 0 ? cleaned.slice(0, nextSection) : cleaned).trim();
}

function isPromptPresetKey(value: unknown): value is PromptPresetKey {
    return value === 'sd' || value === 'illustrious' || value === 'pony' || value === 'flux' || value === 'zimage';
}

function resolvePromptFormatPreset(options?: PromptEnhanceRequestOptions): PromptPresetKey {
    return resolvePromptEnhancePreset(options?.formatMode, options?.imageModelId);
}

function buildPromptEnhancementSystemPrompt(
    baseSystemPrompt: string,
    options?: PromptEnhanceRequestOptions
): string {
    const formatPreset = resolvePromptFormatPreset(options);
    const strength = options?.creativeStrength || 'balanced';
    const roleInstruction = options?.promptRole === 'negative'
        ? 'The user is editing a negative prompt. Improve the negative prompt and put the result in negativePromptDraft. Only provide promptDraft if a positive prompt is truly needed.'
        : 'The user is editing a positive prompt. Improve the positive prompt and put the result in promptDraft. Provide a useful negativePromptDraft when it helps image quality.';

    return [
        baseSystemPrompt,
        roleInstruction,
        `Selected image model: ${options?.imageModelId || '(not provided)'}.`,
        `Resolved prompt format: ${formatPreset}.`,
        FORMAT_INSTRUCTIONS[formatPreset],
        STRENGTH_INSTRUCTIONS[strength],
        ANATOMY_DETAIL_INSTRUCTION,
        PROMPT_CRAFT_INSTRUCTION,
        NEGATIVE_PROMPT_TARGETING_INSTRUCTION,
        ADULT_DETAIL_INSTRUCTION,
        FULL_PROMPT_EVALUATION_INSTRUCTION,
        SWARM_PROMPT_SYNTAX_INSTRUCTION,
        'Quality rules: preserve explicit user intent, keep text directly usable in an image prompt field, avoid markdown, avoid explanations inside promptDraft, and keep negative prompts focused on defects, artifacts, unwanted anatomy/rendering issues, and style conflicts.',
        PROMPT_ENHANCEMENT_JSON_INSTRUCTION,
    ].join('\n\n');
}

function buildPromptEnhancementUserMessage(text: string, promptRole?: 'prompt' | 'negative'): string {
    const label = promptRole === 'negative' ? 'Current negative prompt' : 'Current prompt';
    return [
        `${label}:`,
        `Prompt character count: ${text.length}`,
        '<prompt_to_enhance>',
        text,
        '</prompt_to_enhance>',
        'Enhance the complete prompt above. Do not omit or ignore details near the end.',
    ].join('\n');
}

function buildRoleplayImageEnhancementSystemPrompt(
    baseSystemPrompt: string,
    options?: PromptEnhanceRequestOptions
): string {
    const formatPreset = resolvePromptFormatPreset(options);
    const strength = options?.creativeStrength || 'balanced';
    return [
        baseSystemPrompt,
        'You enhance roleplay image generation requests from an already compiled continuity pipeline.',
        'Preserve permanent character traits, current attire, scene state, lighting, props, injuries, and identity constraints.',
        'Summarize the current scene into sceneSummary, then produce a stronger final image prompt in promptDraft.',
        'Improve negativePromptDraft by preserving all identity and continuity negatives while adding targeted quality/anatomy/artifact negatives.',
        'Do not invent LoRA, embeddings, ControlNet, InstantID, IC-Light, or workflow nodes. Do not remove existing SwarmUI syntax.',
        `Selected image model: ${options?.imageModelId || '(not provided)'}.`,
        `Resolved prompt format: ${formatPreset}.`,
        FORMAT_INSTRUCTIONS[formatPreset],
        STRENGTH_INSTRUCTIONS[strength],
        ANATOMY_DETAIL_INSTRUCTION,
        PROMPT_CRAFT_INSTRUCTION,
        NEGATIVE_PROMPT_TARGETING_INSTRUCTION,
        ADULT_DETAIL_INSTRUCTION,
        FULL_PROMPT_EVALUATION_INSTRUCTION,
        SWARM_PROMPT_SYNTAX_INSTRUCTION,
        ROLEPLAY_IMAGE_ENHANCEMENT_JSON_INSTRUCTION,
    ].join('\n\n');
}

function buildRoleplayImageEnhancementUserMessage(input: {
    prompt: string;
    negativePrompt: string;
    promptBlocks: Array<{ label: string; content: string }>;
    negativePromptBlocks: Array<{ label: string; content: string }>;
    memorySummary?: string;
    openThreads?: string[];
}): string {
    return [
        'Compiled roleplay image context:',
        JSON.stringify({
            memorySummary: input.memorySummary || '',
            openThreads: input.openThreads || [],
            promptBlocks: input.promptBlocks,
            negativePromptBlocks: input.negativePromptBlocks,
            currentPrompt: input.prompt,
            currentNegativePrompt: input.negativePrompt,
        }),
        'Rewrite the currentPrompt and currentNegativePrompt for high-quality image generation while preserving continuity.',
    ].join('\n\n');
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
    mode: AssistantServerMode,
    requestConfig?: AssistantRequestConfig
): Promise<{ reachable: boolean; models: AssistantModel[]; error?: string }> {
    const base = normalizeUrl(endpointUrl);
    const modelUrl = mode === 'legacy-lmstudio'
        ? `${base}/api/v1/models`
        : `${normalizeOpenAIBaseUrl(base)}/models`;

    try {
        const response = await fetch(modelUrl, {
            method: 'GET',
            headers: buildAssistantGetHeaders(requestConfig),
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

export async function probeAssistantConnection(
    endpointUrl: string,
    requestConfig?: AssistantRequestConfig
): Promise<AssistantProbeResult> {
    const shouldProbeLegacy =
        requestConfig?.provider === 'local' ||
        (!requestConfig?.provider && !requestConfig?.apiKey?.trim());
    const legacy: { reachable: boolean; models: AssistantModel[]; error?: string } = shouldProbeLegacy
        ? await fetchModelsForMode(endpointUrl, 'legacy-lmstudio', requestConfig)
        : { reachable: false, models: [] };
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

    const openAI = await fetchModelsForMode(endpointUrl, 'openai-compatible', requestConfig);
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

export async function unloadMagicPromptModel(endpointUrl: string, modelId: string): Promise<AssistantActionResponse> {
    const instanceId = modelId.trim();
    if (!instanceId) {
        return {
            success: false,
            error: 'No assistant model selected to unload',
        };
    }

    try {
        const response = await fetch(`${normalizeUrl(endpointUrl)}/api/v1/models/unload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ instance_id: instanceId }),
        });

        if (!response.ok) {
            const errText = await readErrorText(response);
            return {
                success: false,
                error: `Assistant unload error ${response.status}: ${errText}`,
            };
        }

        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: `Failed to unload assistant model: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
    }
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
        return `${normalizeOpenAIBaseUrl(base)}/responses`;
    }
    return `${normalizeOpenAIBaseUrl(base)}/chat/completions`;
}

function buildChatBody(
    serverMode: AssistantServerMode,
    modelId: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    maxTokens = 2048
): string {
    if (serverMode === 'openai-responses') {
        return JSON.stringify({
            model: modelId,
            input: messages,
            temperature: 0.7,
            max_output_tokens: maxTokens,
        });
    }

    return JSON.stringify({
        model: modelId,
        messages,
        temperature: 0.7,
        max_tokens: maxTokens,
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
    maxTokens?: number;
    requestConfig?: AssistantRequestConfig;
}): Promise<EnhanceResponse> {
    const base = normalizeUrl(input.endpointUrl);
    const url = getChatUrl(base, input.serverMode);
    const body = buildChatBody(input.serverMode, input.modelId, input.messages, input.maxTokens);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: buildAssistantHeaders(input.requestConfig),
            body,
        });

        if (!response.ok) {
            const errText = await readErrorText(response);
            if (response.status === 400 && input.serverMode !== 'openai-responses' && isInputRequiredError(errText)) {
                const retryResponse = await fetch(getChatUrl(base, 'openai-responses'), {
                    method: 'POST',
                    headers: buildAssistantHeaders(input.requestConfig),
                    body: buildChatBody('openai-responses', input.modelId, input.messages, input.maxTokens),
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
    preferredMode?: AssistantServerMode | null,
    options?: PromptEnhanceRequestOptions
): Promise<PromptEnhanceResponse> {
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
            { role: 'system', content: buildPromptEnhancementSystemPrompt(systemPrompt, options) },
            { role: 'user', content: buildPromptEnhancementUserMessage(text, options?.promptRole) },
        ],
        maxTokens: 4096,
    }).then((response) => {
        if (!response.success) {
            return response;
        }

        const formatPreset = resolvePromptFormatPreset(options);
        const draft = safeParsePromptEnhancementDraft(response.response, formatPreset);
        const responseText = draft.promptDraft || draft.negativePromptDraft || response.response;
        return {
            ...response,
            response: responseText,
            draft,
        };
    });
}

export async function enhanceRoleplayImagePrompt(input: {
    prompt: string;
    negativePrompt: string;
    promptBlocks: Array<{ label: string; content: string }>;
    negativePromptBlocks: Array<{ label: string; content: string }>;
    memorySummary?: string;
    openThreads?: string[];
    modelId: string;
    systemPrompt: string;
    endpointUrl: string;
    preferredMode?: AssistantServerMode | null;
    options?: PromptEnhanceRequestOptions;
}): Promise<RoleplayImageEnhanceResponse> {
    const resolved = await resolveServerMode(input.endpointUrl, input.preferredMode);
    if (!resolved.serverMode) {
        return {
            success: false,
            response: '',
            error: resolved.error || 'No compatible assistant server detected',
        };
    }

    return requestChatCompletion({
        endpointUrl: input.endpointUrl,
        serverMode: resolved.serverMode,
        modelId: input.modelId,
        messages: [
            {
                role: 'system',
                content: buildRoleplayImageEnhancementSystemPrompt(input.systemPrompt, input.options),
            },
            {
                role: 'user',
                content: buildRoleplayImageEnhancementUserMessage(input),
            },
        ],
        maxTokens: 4096,
    }).then((response) => {
        if (!response.success) {
            return response;
        }

        const draft = safeParseRoleplayImageEnhancementDraft(response.response);
        return {
            ...response,
            response: draft.promptDraft || response.response,
            draft,
        };
    });
}

function safeParseAssistantDraft(content: string): AssistantResponseDraft | null {
    const normalized = normalizeAssistantJsonContent(content);

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

function safeParseRoleplayImageEnhancementDraft(content: string): RoleplayImageEnhancementDraft {
    const normalized = normalizeAssistantJsonContent(content);

    try {
        const parsed = JSON.parse(normalized) as Partial<RoleplayImageEnhancementDraft> & {
            prompt?: string;
            negativePrompt?: string;
        };
        const promptDraft = typeof parsed.promptDraft === 'string'
            ? cleanDraftText(parsed.promptDraft, ['enhanced prompt', 'prompt draft', 'prompt'])
            : typeof parsed.prompt === 'string'
                ? cleanDraftText(parsed.prompt, ['enhanced prompt', 'prompt draft', 'prompt'])
                : null;
        const negativePromptDraft = typeof parsed.negativePromptDraft === 'string'
            ? cleanDraftText(parsed.negativePromptDraft, ['negative prompt draft', 'negative prompt'])
            : typeof parsed.negativePrompt === 'string'
                ? cleanDraftText(parsed.negativePrompt, ['negative prompt draft', 'negative prompt'])
                : null;

        return {
            sceneSummary: typeof parsed.sceneSummary === 'string' ? parsed.sceneSummary.trim() : '',
            promptDraft,
            negativePromptDraft,
            reasoningNote: typeof parsed.reasoningNote === 'string' && parsed.reasoningNote.trim()
                ? parsed.reasoningNote.trim()
                : null,
        };
    } catch {
        return {
            sceneSummary: '',
            promptDraft: cleanDraftText(content, ['enhanced prompt', 'prompt draft', 'prompt']),
            negativePromptDraft: null,
            reasoningNote: null,
        };
    }
}

function safeParsePromptEnhancementDraft(content: string, fallbackFormat: PromptPresetKey): PromptEnhancementDraft {
    const normalized = normalizeAssistantJsonContent(content);

    try {
        const parsed = JSON.parse(normalized) as Partial<PromptEnhancementDraft> & {
            enhancedPrompt?: string;
            negativePrompt?: string;
        };
        const promptDraft = typeof parsed.promptDraft === 'string'
            ? cleanDraftText(parsed.promptDraft, ['enhanced prompt', 'new prompt', 'rewritten prompt', 'prompt draft'])
            : typeof parsed.enhancedPrompt === 'string'
                ? cleanDraftText(parsed.enhancedPrompt, ['enhanced prompt', 'new prompt', 'rewritten prompt', 'prompt draft'])
                : null;
        const negativePromptDraft = typeof parsed.negativePromptDraft === 'string'
            ? cleanDraftText(parsed.negativePromptDraft, ['negative prompt draft', 'negative prompt'])
            : typeof parsed.negativePrompt === 'string'
                ? cleanDraftText(parsed.negativePrompt, ['negative prompt draft', 'negative prompt'])
                : null;

        if (!promptDraft && !negativePromptDraft) {
            throw new Error('No prompt draft fields present');
        }

        return {
            message: typeof parsed.message === 'string' && parsed.message.trim()
                ? parsed.message.trim()
                : 'Enhanced prompt draft ready.',
            promptDraft,
            negativePromptDraft,
            formatPreset: isPromptPresetKey(parsed.formatPreset) ? parsed.formatPreset : fallbackFormat,
            reasoningNote: typeof parsed.reasoningNote === 'string' && parsed.reasoningNote.trim()
                ? parsed.reasoningNote.trim()
                : null,
        };
    } catch {
        return {
            message: 'Enhanced prompt draft ready.',
            promptDraft: cleanDraftText(content, ['enhanced prompt', 'new prompt', 'rewritten prompt', 'prompt draft']),
            negativePromptDraft: null,
            formatPreset: fallbackFormat,
            reasoningNote: null,
        };
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
