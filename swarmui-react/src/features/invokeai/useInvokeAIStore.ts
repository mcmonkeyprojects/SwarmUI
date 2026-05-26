import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { InvokeAIClient } from './client';
import type {
    InvokeAIConnectionState,
    InvokeAIModelRecord,
    InvokeAIRunParams,
    InvokeAIRunResult,
} from './types';

interface InvokeAIStore {
    baseUrl: string;
    queueId: string;
    connectionState: InvokeAIConnectionState;
    version: string | null;
    lastError: string | null;
    lastCheckedAt: number | null;
    models: InvokeAIModelRecord[];
    selectedModelKey: string | null;
    isRefreshingModels: boolean;
    isRunning: boolean;
    activeMode: InvokeAIRunParams['mode'] | null;
    lastResult: InvokeAIRunResult | null;
    setBaseUrl: (baseUrl: string) => void;
    setQueueId: (queueId: string) => void;
    setSelectedModelKey: (modelKey: string | null) => void;
    checkConnection: () => Promise<void>;
    refreshModels: () => Promise<void>;
    runGeneration: (params: InvokeAIRunParams) => Promise<InvokeAIRunResult>;
}

function createClient(baseUrl: string, queueId: string): InvokeAIClient {
    return new InvokeAIClient({ baseUrl, queueId });
}

function pickSelectedModel(models: InvokeAIModelRecord[], selectedModelKey: string | null): string | null {
    if (selectedModelKey && models.some((model) => model.key === selectedModelKey)) {
        return selectedModelKey;
    }
    return models[0]?.key ?? null;
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'InvokeAI request failed.';
}

export const useInvokeAIStore = create<InvokeAIStore>()(
    persist(
        (set, get) => ({
            baseUrl: 'http://127.0.0.1:9090',
            queueId: 'default',
            connectionState: 'idle',
            version: null,
            lastError: null,
            lastCheckedAt: null,
            models: [],
            selectedModelKey: null,
            isRefreshingModels: false,
            isRunning: false,
            activeMode: null,
            lastResult: null,

            setBaseUrl: (baseUrl) => set({
                baseUrl,
                connectionState: 'idle',
                version: null,
                lastError: null,
                models: [],
                selectedModelKey: null,
            }),

            setQueueId: (queueId) => set({ queueId }),

            setSelectedModelKey: (selectedModelKey) => set({ selectedModelKey }),

            checkConnection: async () => {
                const { baseUrl, queueId, selectedModelKey } = get();
                set({ connectionState: 'checking', lastError: null });
                try {
                    const client = createClient(baseUrl, queueId);
                    const health = await client.healthCheck();
                    const models = await client.listMainModels();
                    set({
                        connectionState: 'connected',
                        version: health.version,
                        models,
                        selectedModelKey: pickSelectedModel(models, selectedModelKey),
                        lastCheckedAt: Date.now(),
                        lastError: null,
                    });
                } catch (error) {
                    set({
                        connectionState: 'error',
                        version: null,
                        lastCheckedAt: Date.now(),
                        lastError: getErrorMessage(error),
                    });
                    throw error;
                }
            },

            refreshModels: async () => {
                const { baseUrl, queueId, selectedModelKey } = get();
                set({ isRefreshingModels: true, lastError: null });
                try {
                    const client = createClient(baseUrl, queueId);
                    const models = await client.listMainModels();
                    set({
                        models,
                        selectedModelKey: pickSelectedModel(models, selectedModelKey),
                        isRefreshingModels: false,
                    });
                } catch (error) {
                    set({
                        isRefreshingModels: false,
                        lastError: getErrorMessage(error),
                    });
                    throw error;
                }
            },

            runGeneration: async (params) => {
                const { baseUrl, queueId, models, selectedModelKey } = get();
                const selectedModel = models.find((model) => model.key === selectedModelKey);
                if (!selectedModel) {
                    throw new Error('Select an InvokeAI model before running this action.');
                }

                set({
                    isRunning: true,
                    activeMode: params.mode,
                    lastError: null,
                });
                try {
                    const client = createClient(baseUrl, queueId);
                    const result = await client.runGeneration(params, selectedModel);
                    set({
                        isRunning: false,
                        activeMode: null,
                        lastResult: result,
                    });
                    return result;
                } catch (error) {
                    set({
                        isRunning: false,
                        activeMode: null,
                        lastError: getErrorMessage(error),
                    });
                    throw error;
                }
            },
        }),
        {
            name: 'swarmui-invokeai',
            partialize: (state) => ({
                baseUrl: state.baseUrl,
                queueId: state.queueId,
                selectedModelKey: state.selectedModelKey,
            }),
        }
    )
);
