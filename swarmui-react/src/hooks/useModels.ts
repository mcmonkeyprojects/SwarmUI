import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { swarmClient } from '../api/client';
import { queryKeys } from '../api/queryClient';
import { useBackendBootstrap } from './useBackendBootstrap';
import type { BackendBootstrapSnapshot, Model, VAEModel } from '../api/types';

interface ModelQueryOptions {
    enabled?: boolean;
}

interface BackendQueryOptions extends ModelQueryOptions {
    autoRefresh?: boolean;
}

function selectModelCatalog(data: BackendBootstrapSnapshot | undefined, subtype: string): Model[] {
    return (data?.modelCatalog?.[subtype] as Model[] | undefined) ?? [];
}

/**
 * Hook to fetch and cache Stable Diffusion models
 */
export function useModels(subtype: string = 'Stable-Diffusion', options: ModelQueryOptions = {}) {
    const bootstrap = useBackendBootstrap(options);

    return {
        ...bootstrap,
        data: selectModelCatalog(bootstrap.data, subtype),
    };
}

/**
 * Hook to fetch and cache VAE models
 */
export function useVAEs(options: ModelQueryOptions = {}) {
    const bootstrap = useBackendBootstrap(options);

    return {
        ...bootstrap,
        data: (bootstrap.data?.modelCatalog?.VAE as VAEModel[] | undefined) ?? [],
    };
}

/**
 * Hook to fetch and cache LoRA models
 */
export function useLoRAs(options: ModelQueryOptions = {}) {
    return useQuery({
        queryKey: queryKeys.loras.list(),
        queryFn: () => swarmClient.listLoRAs(),
        staleTime: 5 * 60 * 1000,
        enabled: options.enabled ?? true,
    });
}

/**
 * Hook to fetch and cache backends
 */
export function useBackends(options: BackendQueryOptions = {}) {
    const bootstrap = useBackendBootstrap(options);

    return {
        ...bootstrap,
        data: bootstrap.data?.backendStatus ?? [],
    };
}

/**
 * Hook to fetch and cache ControlNet models
 */
export function useControlNets(options: ModelQueryOptions = {}) {
    return useQuery({
        queryKey: queryKeys.controlnets.list(),
        queryFn: () => swarmClient.listControlNets(),
        staleTime: 10 * 60 * 1000,
        enabled: options.enabled ?? true,
    });
}

/**
 * Hook to fetch and cache upscaler models
 */
export function useUpscalers(options: ModelQueryOptions = {}) {
    return useQuery({
        queryKey: queryKeys.upscalers.list(),
        queryFn: () => swarmClient.listUpscalers(),
        staleTime: 10 * 60 * 1000,
        enabled: options.enabled ?? true,
    });
}

/**
 * Hook to fetch and cache embeddings
 */
export function useEmbeddings(options: ModelQueryOptions = {}) {
    return useQuery({
        queryKey: queryKeys.embeddings.list(),
        queryFn: () => swarmClient.listEmbeddings(),
        staleTime: 10 * 60 * 1000,
        enabled: options.enabled ?? true,
    });
}

/**
 * Hook to fetch and cache wildcards
 */
export function useWildcards(options: ModelQueryOptions = {}) {
    return useQuery({
        queryKey: queryKeys.wildcards.list(),
        queryFn: () => swarmClient.listWildcards(),
        staleTime: 10 * 60 * 1000,
        enabled: options.enabled ?? true,
    });
}

/**
 * Hook to fetch images from a path
 */
export function useImages(path: string = '') {
    return useQuery({
        queryKey: queryKeys.images.list(path),
        queryFn: () => swarmClient.listImages(path),
        staleTime: 1 * 60 * 1000, // Images may be generated frequently
    });
}

/**
 * Combined hook to fetch all model-related data at once
 * Useful for the GeneratePage that needs multiple data types
 * Uses React Query for caching - prevents duplicate API calls
 */
export function useAllModelData(options: { enabled?: boolean; autoRefreshBackends?: boolean } = {}) {
    const enabled = options.enabled ?? true;
    const models = useModels('Stable-Diffusion', { enabled });
    const vaes = useVAEs({ enabled });
    // Note: LoRAs are lazy-loaded by LoRABrowser when opened
    const backends = useBackends({ enabled, autoRefresh: options.autoRefreshBackends ?? false });
    const controlnets = useControlNets({ enabled });
    const upscalers = useUpscalers({ enabled });
    const embeddings = useEmbeddings({ enabled });
    const wildcards = useWildcards({ enabled });

    // Pre-computed options for Select components
    const vaeOptions = useMemo(() => {
        const baseOptions = [
            { value: 'Automatic', label: 'Automatic' },
            { value: 'None', label: 'None' },
        ];
        const baseValues = new Set(baseOptions.map(o => o.value));
        // Filter out any VAEs that match base option values to prevent duplicates
        const dataOptions = (vaes.data ?? [])
            .filter(vae => !baseValues.has(vae.name))
            .map(vae => ({
                value: vae.name,
                label: vae.title || vae.name,
            }));
        return [...baseOptions, ...dataOptions];
    }, [vaes.data]);

    const controlNetOptions = useMemo(() => {
        return (controlnets.data ?? []).map(cn => ({
            value: cn.name,
            label: cn.title || cn.name,
        }));
    }, [controlnets.data]);

    const backendOptions = useMemo(() => {
        return (backends.data ?? []).map(backend => ({
            value: backend.id,
            label: `${backend.type} (${backend.status})`,
            disabled: backend.status !== 'running',
        }));
    }, [backends.data]);

    const embeddingOptions = useMemo(() => {
        return (embeddings.data ?? []).map(e => ({
            value: e.name,
            label: e.title || e.name,
        }));
    }, [embeddings.data]);

    const wildcardOptions = useMemo(() => {
        return (wildcards.data ?? []).map(w => ({
            value: w.name,
            label: w.title || w.name,
        }));
    }, [wildcards.data]);

    return {
        // Raw data (matching useDataLoaders naming)
        models: models.data ?? [],
        vaeModels: vaes.data ?? [],
        controlNetModels: controlnets.data ?? [],
        backends: backends.data ?? [],
        upscaleModels: upscalers.data ?? [],
        embeddingModels: embeddings.data ?? [],
        wildcardModels: wildcards.data ?? [],

        // Also keep original names for compatibility
        vaes: vaes.data ?? [],
        // loras: loaded lazily by LoRABrowser
        controlnets: controlnets.data ?? [],
        upscalers: upscalers.data ?? [],
        embeddings: embeddings.data ?? [],
        wildcards: wildcards.data ?? [],

        // Loading states (matching useDataLoaders naming)
        loadingModels: models.isLoading,
        loadingVAEs: vaes.isLoading,
        loadingControlNets: controlnets.isLoading,
        loadingBackends: backends.isLoading,

        // Combined loading states
        isLoading: models.isLoading || vaes.isLoading || backends.isLoading,
        isError: models.isError || vaes.isError || backends.isError,

        loadingStates: {
            models: models.isLoading,
            vaes: vaes.isLoading,
            // loras: loaded lazily
            backends: backends.isLoading,
            controlnets: controlnets.isLoading,
            upscalers: upscalers.isLoading,
            embeddings: embeddings.isLoading,
            wildcards: wildcards.isLoading,
        },

        // Pre-computed options for Select components
        vaeOptions,
        controlNetOptions,
        backendOptions,
        embeddingOptions,
        wildcardOptions,

        // Refetch functions (matching useDataLoaders naming)
        loadModels: models.refetch,
        loadVAEs: vaes.refetch,
        loadControlNets: controlnets.refetch,
        loadBackends: backends.refetch,
        loadUpscalers: upscalers.refetch,
        loadEmbeddings: embeddings.refetch,
        loadWildcards: wildcards.refetch,
        loadAll: () => {
            models.refetch();
            vaes.refetch();
            // loras: loaded lazily by LoRABrowser
            backends.refetch();
            controlnets.refetch();
            upscalers.refetch();
            embeddings.refetch();
            wildcards.refetch();
        },

        // Also keep refetch object for compatibility
        refetch: {
            models: models.refetch,
            vaes: vaes.refetch,
            // loras: loaded lazily by LoRABrowser
            backends: backends.refetch,
            all: () => {
                models.refetch();
                vaes.refetch();
                // loras: loaded lazily
                backends.refetch();
                controlnets.refetch();
                upscalers.refetch();
                embeddings.refetch();
                wildcards.refetch();
            },
        },
    };
}

