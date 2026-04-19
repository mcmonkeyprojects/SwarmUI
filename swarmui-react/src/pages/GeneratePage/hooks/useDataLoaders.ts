import { useCallback, useMemo } from 'react';
import { useAllModelData } from '../../../hooks/useModels';
import { usePresetsStore } from '../../../stores/presets';

/**
 * Legacy compatibility hook for GeneratePage data loading.
 * Shared backend state now comes from React Query-backed hooks instead of local component fetch state.
 */
export function useDataLoaders() {
    const data = useAllModelData({ autoRefreshBackends: false });

    const loadAll = useCallback(() => {
        data.loadAll();
        void usePresetsStore.getState().loadFromBackend();
    }, [data]);

    return useMemo(() => ({
        models: data.models,
        vaeModels: data.vaeModels,
        controlNetModels: data.controlNetModels,
        backends: data.backends,
        upscaleModels: data.upscaleModels,
        embeddingModels: data.embeddingModels,
        wildcardModels: data.wildcardModels,

        loadingModels: data.loadingModels,
        loadingVAEs: data.loadingVAEs,
        loadingControlNets: data.loadingControlNets,
        loadingBackends: data.loadingBackends,

        loadModels: data.loadModels,
        loadVAEs: data.loadVAEs,
        loadControlNets: data.loadControlNets,
        loadBackends: data.loadBackends,
        loadUpscalers: data.loadUpscalers,
        loadEmbeddings: data.loadEmbeddings,
        loadWildcards: data.loadWildcards,
        loadAll,

        vaeOptions: data.vaeOptions,
        controlNetOptions: data.controlNetOptions,
        backendOptions: data.backendOptions,
        embeddingOptions: data.embeddingOptions,
        wildcardOptions: data.wildcardOptions,
    }), [data, loadAll]);
}

export type DataLoaders = ReturnType<typeof useDataLoaders>;
