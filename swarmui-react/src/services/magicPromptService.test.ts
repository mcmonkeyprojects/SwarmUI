import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chatWithAssistant, enhancePrompt, probeAssistantConnection, unloadMagicPromptModel } from './magicPromptService';

function jsonResponse(body: unknown, init?: ResponseInit) {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        ...init,
    });
}

describe('magicPromptService', () => {
    const fetchMock = vi.fn<typeof fetch>();

    beforeEach(() => {
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('detects legacy LM Studio endpoints and normalizes models', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({
            models: [
                { key: 'local-llm', display_name: 'Local LLM', type: 'llm' },
                { key: 'ignored-embed', display_name: 'Embedding', type: 'embedding' },
            ],
        }));

        const result = await probeAssistantConnection('http://localhost:1234/');

        expect(result.ok).toBe(true);
        expect(result.connection.serverMode).toBe('legacy-lmstudio');
        expect(result.connection.models).toEqual([
            { id: 'local-llm', name: 'Local LLM', serverMode: 'legacy-lmstudio' },
        ]);
        expect(fetchMock).toHaveBeenCalledWith(
            'http://localhost:1234/api/v1/models',
            expect.objectContaining({ method: 'GET' })
        );
    });

    it('falls back to OpenAI-compatible endpoints when legacy path is unavailable', async () => {
        fetchMock
            .mockResolvedValueOnce(new Response('missing', { status: 404 }))
            .mockResolvedValueOnce(jsonResponse({
                data: [
                    { id: 'qwen3:latest' },
                    { id: 'llama-vision' },
                ],
            }));

        const result = await probeAssistantConnection('http://127.0.0.1:1234');

        expect(result.ok).toBe(true);
        expect(result.connection.serverMode).toBe('openai-compatible');
        expect(result.connection.models.map((model) => model.id)).toEqual(['qwen3:latest', 'llama-vision']);
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            'http://127.0.0.1:1234/v1/models',
            expect.objectContaining({ method: 'GET' })
        );
    });

    it('reports reachable servers with no models as actionable', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ models: [] }));

        const result = await probeAssistantConnection('http://localhost:1234');

        expect(result.ok).toBe(false);
        expect(result.connection.state).toBe('reachable_no_models');
        expect(result.connection.message).toContain('no text model');
    });

    it('handles malformed model payloads without crashing', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ nope: [] }))
            .mockResolvedValueOnce(jsonResponse({ data: 'broken' }));

        const result = await probeAssistantConnection('http://localhost:1234');

        expect(result.ok).toBe(false);
        expect(result.connection.state).toBe('reachable_no_models');
        expect(result.connection.models).toEqual([]);
    });

    it('maps chat responses from OpenAI-compatible endpoints into plain text and drafts', async () => {
        fetchMock
            .mockResolvedValueOnce(new Response('missing', { status: 404 }))
            .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'qwen3:latest' }] }))
            .mockResolvedValueOnce(jsonResponse({
                choices: [{
                    message: {
                        content: JSON.stringify({
                            message: 'Here is a stronger prompt.',
                            promptDraft: 'cinematic portrait, dramatic rim light',
                            negativePromptDraft: 'blurry, low quality',
                            parameterSuggestions: [{ key: 'steps', value: 30, reason: 'Adds detail' }],
                            reasoningNote: 'This keeps the composition tighter.',
                        }),
                    },
                }],
            }));

        const result = await chatWithAssistant({
            endpointUrl: 'http://localhost:1234',
            modelId: 'qwen3:latest',
            systemPrompt: 'Help write prompts.',
            conversation: [
                { id: '1', role: 'user', content: 'Rewrite this prompt', createdAt: Date.now() },
            ],
        });

        expect(result.success).toBe(true);
        expect(result.response).toBe('Here is a stronger prompt.');
        expect(result.draft?.promptDraft).toBe('cinematic portrait, dramatic rim light');
        expect(result.draft?.parameterSuggestions?.[0]).toEqual({
            key: 'steps',
            value: 30,
            reason: 'Adds detail',
        });
    });

    it('routes enhancePrompt through the detected server mode', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse({
                models: [{ key: 'local-llm', display_name: 'Local LLM', type: 'llm' }],
            }))
            .mockResolvedValueOnce(jsonResponse({
                choices: [{ message: { content: 'enhanced prompt text' } }],
            }));

        const result = await enhancePrompt(
            'a castle on a hill',
            'local-llm',
            'Rewrite only the prompt.',
            'http://localhost:1234',
            'legacy-lmstudio'
        );

        expect(result.success).toBe(true);
        expect(result.response).toBe('enhanced prompt text');
        expect(fetchMock).toHaveBeenCalledWith(
            'http://localhost:1234/api/v1/chat',
            expect.objectContaining({ method: 'POST' })
        );
    });

    it('parses structured prompt enhancement drafts with inferred format instructions', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'qwen3:latest' }] }))
            .mockResolvedValueOnce(jsonResponse({
                choices: [{
                    message: {
                        content: JSON.stringify({
                            message: 'Draft ready.',
                            promptDraft: 'score_9, score_8_up, source_anime, detailed character portrait',
                            negativePromptDraft: 'blurry, low quality, bad anatomy',
                            formatPreset: 'pony',
                            reasoningNote: 'Kept the subject and used Pony formatting.',
                        }),
                    },
                }],
            }));

        const result = await enhancePrompt(
            'character portrait',
            'qwen3:latest',
            'Improve image prompts.',
            'http://localhost:1234',
            'openai-compatible',
            {
                formatMode: 'auto',
                creativeStrength: 'balanced',
                imageModelId: 'my-pony-xl-model',
                promptRole: 'prompt',
            }
        );

        expect(result.success).toBe(true);
        expect(result.response).toBe('score_9, score_8_up, source_anime, detailed character portrait');
        expect(result.draft?.negativePromptDraft).toBe('blurry, low quality, bad anatomy');
        expect(result.draft?.formatPreset).toBe('pony');
        const body = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
        expect(body.messages[0].content).toContain('Resolved prompt format: pony');
        expect(body.messages[0].content).toContain('Character and anatomy detail policy');
        expect(body.messages[0].content).toContain('eyes, hair, face');
        expect(body.messages[0].content).toContain('fill them in with plausible coherent choices');
        expect(body.messages[0].content).toContain('Composition hierarchy');
        expect(body.messages[0].content).toContain('subject, anatomy/identity, pose/action');
        expect(body.messages[0].content).toContain('Do not overload the prompt');
        expect(body.messages[0].content).toContain('Negative prompt targeting');
        expect(body.messages[0].content).toContain('Choose a clear framing');
        expect(body.messages[0].content).toContain('Keep medium, style, lighting, and rendering language compatible');
        expect(body.messages[0].content).toContain('choose one coherent interpretation');
        expect(body.messages[0].content).toContain('60-140 words');
        expect(body.messages[0].content).toContain('Do not change age category');
        expect(body.messages[0].content).toContain('Adult and NSFW detail policy');
        expect(body.messages[0].content).toContain('only when the user explicitly requests');
        expect(body.messages[0].content).toContain('clearly adults');
        expect(body.messages[0].content).toContain('Do not add NSFW details');
        expect(body.messages[0].content).toContain('Evaluate the entire prompt');
        expect(body.messages[0].content).toContain('do not summarize only the beginning');
        expect(body.messages[0].content).toContain('Do not include chain-of-thought');
        expect(body.messages[0].content).toContain('no <think> blocks');
        expect(body.messages[0].content).toContain('Do not repeat the original prompt');
        expect(body.messages[0].content).toContain('SwarmUI prompt syntax policy');
        expect(body.messages[0].content).toContain('Preserve existing SwarmUI syntax tags');
        expect(body.messages[0].content).toContain('<segment:face');
        expect(body.messages[0].content).toContain('<random:');
        expect(body.messages[0].content).toContain('Do not invent LoRA');
        expect(body.messages[0].content).toContain('Subject emphasis weighting');
        expect(body.messages[0].content).toContain('subject count');
        expect(body.messages[0].content).toContain('1.1-1.35');
        expect(body.messages[0].content).toContain('avoid weighting for Flux');
        expect(body.max_tokens).toBe(4096);
        expect(body.messages[1].content).toContain('Current prompt');
        expect(body.messages[1].content).toContain('Prompt character count: 18');
        expect(body.messages[1].content).toContain('<prompt_to_enhance>');
        expect(body.messages[1].content).toContain('</prompt_to_enhance>');
    });

    it('falls back to a prompt draft when enhancement returns plain text', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'qwen3:latest' }] }))
            .mockResolvedValueOnce(jsonResponse({
                choices: [{ message: { content: 'cinematic landscape, golden hour, highly detailed' } }],
            }));

        const result = await enhancePrompt(
            'landscape',
            'qwen3:latest',
            'Improve image prompts.',
            'http://localhost:1234',
            'openai-compatible',
            {
                formatMode: 'auto',
                creativeStrength: 'balanced',
                imageModelId: 'sdxl-base',
                promptRole: 'prompt',
            }
        );

        expect(result.success).toBe(true);
        expect(result.draft?.promptDraft).toBe('cinematic landscape, golden hour, highly detailed');
        expect(result.draft?.formatPreset).toBe('sd');
    });

    it('extracts prompt enhancement JSON when reasoning models wrap it in extra text', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'qwen3:latest' }] }))
            .mockResolvedValueOnce(jsonResponse({
                choices: [{
                    message: {
                        content: [
                            '<think>I should inspect the full prompt.</think>',
                            'Here is the JSON:',
                            JSON.stringify({
                                message: 'Draft ready.',
                                promptDraft: 'full body character portrait, blue eyes, silver hair',
                                negativePromptDraft: 'bad anatomy, malformed hands',
                                formatPreset: 'sd',
                                reasoningNote: 'Full prompt covered.',
                            }),
                        ].join('\n'),
                    },
                }],
            }));

        const result = await enhancePrompt(
            'character portrait',
            'qwen3:latest',
            'Improve image prompts.',
            'http://localhost:1234',
            'openai-compatible',
            {
                formatMode: 'auto',
                creativeStrength: 'balanced',
                imageModelId: 'sdxl-base',
                promptRole: 'prompt',
            }
        );

        expect(result.success).toBe(true);
        expect(result.draft?.promptDraft).toBe('full body character portrait, blue eyes, silver hair');
        expect(result.draft?.negativePromptDraft).toBe('bad anatomy, malformed hands');
        expect(result.response).toBe('full body character portrait, blue eyes, silver hair');
    });

    it('strips reasoning blocks from plain text enhancement fallbacks', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'qwen3:latest' }] }))
            .mockResolvedValueOnce(jsonResponse({
                choices: [{
                    message: {
                        content: '<think>I need to improve the prompt.</think>\ncinematic landscape, golden hour, highly detailed',
                    },
                }],
            }));

        const result = await enhancePrompt(
            'landscape',
            'qwen3:latest',
            'Improve image prompts.',
            'http://localhost:1234',
            'openai-compatible',
            {
                formatMode: 'auto',
                creativeStrength: 'balanced',
                imageModelId: 'sdxl-base',
                promptRole: 'prompt',
            }
        );

        expect(result.success).toBe(true);
        expect(result.draft?.promptDraft).toBe('cinematic landscape, golden hour, highly detailed');
        expect(result.draft?.promptDraft).not.toContain('<think>');
    });

    it('removes original prompt wrappers from enhancement drafts', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'qwen3:latest' }] }))
            .mockResolvedValueOnce(jsonResponse({
                choices: [{
                    message: {
                        content: JSON.stringify({
                            message: 'Draft ready.',
                            promptDraft: 'Original prompt: landscape\nEnhanced prompt: cinematic mountain landscape, golden hour, volumetric light',
                            negativePromptDraft: 'Negative prompt: blurry, low quality',
                            formatPreset: 'sd',
                            reasoningNote: null,
                        }),
                    },
                }],
            }));

        const result = await enhancePrompt(
            'landscape',
            'qwen3:latest',
            'Improve image prompts.',
            'http://localhost:1234',
            'openai-compatible',
            {
                formatMode: 'auto',
                creativeStrength: 'balanced',
                imageModelId: 'sdxl-base',
                promptRole: 'prompt',
            }
        );

        expect(result.success).toBe(true);
        expect(result.draft?.promptDraft).toBe('cinematic mountain landscape, golden hour, volumetric light');
        expect(result.draft?.negativePromptDraft).toBe('blurry, low quality');
        expect(result.response).toBe('cinematic mountain landscape, golden hour, volumetric light');
    });

    it('retries prompt enhancement with Responses API format when input is required', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'gpt-oss' }] }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                error: {
                    message: "'input' is required",
                    param: 'input',
                },
            }), { status: 400 }))
            .mockResolvedValueOnce(jsonResponse({
                output: [{
                    type: 'message',
                    role: 'assistant',
                    content: [{ type: 'output_text', text: 'responses enhanced prompt' }],
                }],
            }));

        const result = await enhancePrompt(
            'a castle on a hill',
            'gpt-oss',
            'Rewrite only the prompt.',
            'http://localhost:1234',
            'openai-compatible'
        );

        expect(result.success).toBe(true);
        expect(result.response).toBe('responses enhanced prompt');
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            'http://localhost:1234/v1/chat/completions',
            expect.objectContaining({
                method: 'POST',
                body: expect.stringContaining('"messages"'),
            })
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            3,
            'http://localhost:1234/v1/responses',
            expect.objectContaining({
                method: 'POST',
                body: expect.stringContaining('"input"'),
            })
        );
        const retryBody = JSON.parse(String(fetchMock.mock.calls[2][1]?.body));
        expect(retryBody.max_output_tokens).toBe(4096);
    });

    it('sends prompt enhancement directly to Responses API when that mode is selected', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'gpt-oss' }] }))
            .mockResolvedValueOnce(jsonResponse({
                output: [{
                    type: 'message',
                    role: 'assistant',
                    content: [{ type: 'output_text', text: 'direct responses prompt' }],
                }],
            }));

        const result = await enhancePrompt(
            'a castle on a hill',
            'gpt-oss',
            'Rewrite only the prompt.',
            'http://localhost:1234',
            'openai-responses'
        );

        expect(result.success).toBe(true);
        expect(result.response).toBe('direct responses prompt');
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            'http://localhost:1234/v1/responses',
            expect.objectContaining({
                method: 'POST',
                body: expect.stringContaining('"max_output_tokens"'),
            })
        );
    });

    it('unloads LM Studio model instances by instance id', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ instance_id: 'local-llm' }));

        const result = await unloadMagicPromptModel('http://localhost:1234/', 'local-llm');

        expect(result.success).toBe(true);
        expect(fetchMock).toHaveBeenCalledWith(
            'http://localhost:1234/api/v1/models/unload',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ instance_id: 'local-llm' }),
            })
        );
    });

    it('reports unload failures without throwing', async () => {
        fetchMock.mockResolvedValueOnce(new Response('not found', { status: 404 }));

        const result = await unloadMagicPromptModel('http://localhost:1234', 'missing-model');

        expect(result.success).toBe(false);
        expect(result.error).toContain('Assistant unload error 404');
    });
});
