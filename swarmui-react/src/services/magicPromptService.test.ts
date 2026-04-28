import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chatWithAssistant, enhancePrompt, probeAssistantConnection } from './magicPromptService';

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
});
