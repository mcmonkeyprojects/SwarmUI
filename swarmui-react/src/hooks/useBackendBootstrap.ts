import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { swarmBackendAdapter } from '../api/backendAdapter';
import { queryKeys } from '../api/queryClient';
import type { BackendBootstrapSnapshot, UserDataResponse } from '../api/types';
import { featureFlags } from '../config/featureFlags';

interface BackendBootstrapOptions {
  enabled?: boolean;
  autoRefresh?: boolean;
}

type BackendBootstrapQuery = ReturnType<typeof useBackendBootstrap>;
type BackendBootstrapValueQuery<T> = Omit<BackendBootstrapQuery, 'data'> & { data: T };

function resolveBootstrapRefreshInterval(autoRefresh: boolean | undefined): number | false {
  if (!autoRefresh) {
    return false;
  }

  return featureFlags.generateBootstrapRefreshMs > 0
    ? featureFlags.generateBootstrapRefreshMs
    : false;
}

export function useBackendBootstrap(options: BackendBootstrapOptions = {}) {
  return useQuery({
    queryKey: queryKeys.backend.bootstrap,
    queryFn: () => swarmBackendAdapter.getBootstrap('capability-refresh', { source: 'query' }),
    initialData: () => swarmBackendAdapter.getLatestBootstrap() ?? undefined,
    initialDataUpdatedAt: () => swarmBackendAdapter.getLatestBootstrap()?.refreshedAt,
    staleTime: 5 * 60 * 1000,
    enabled: options.enabled ?? true,
    refetchInterval: resolveBootstrapRefreshInterval(options.autoRefresh),
    refetchIntervalInBackground: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function useBackendBootstrapValue<T>(
  selector: (snapshot: BackendBootstrapSnapshot | undefined) => T,
  options: BackendBootstrapOptions = {}
): BackendBootstrapValueQuery<T> {
  const bootstrap = useBackendBootstrap(options);
  const selectedData = useMemo(() => selector(bootstrap.data), [bootstrap.data, selector]);

  return {
    ...bootstrap,
    data: selectedData,
  };
}

export function useBackendUserData(options: BackendBootstrapOptions = {}) {
  const selector = useCallback(
    (snapshot: BackendBootstrapSnapshot | undefined) => snapshot?.userData ?? null,
    []
  );

  return useBackendBootstrapValue<UserDataResponse | null>(
    selector,
    options
  );
}

export function useBackendAutocompletions(options: BackendBootstrapOptions = {}) {
  const selector = useCallback(
    (snapshot: BackendBootstrapSnapshot | undefined) => snapshot?.userData?.autocompletions ?? [],
    []
  );

  return useBackendBootstrapValue<string[]>(
    selector,
    options
  );
}

export function useBackendStarredModels(
  subtype: string,
  options: BackendBootstrapOptions = {}
) {
  const selector = useCallback(
    (snapshot: BackendBootstrapSnapshot | undefined) => snapshot?.userData?.starred_models?.[subtype] ?? [],
    [subtype]
  );

  return useBackendBootstrapValue<string[]>(
    selector,
    options
  );
}
