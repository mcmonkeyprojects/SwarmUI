import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { swarmBackendAdapter } from '../api/backendAdapter';
import { queryKeys } from '../api/queryClient';
import type { BackendBootstrapSnapshot, UserDataResponse } from '../api/types';

interface BackendBootstrapOptions {
  enabled?: boolean;
  autoRefresh?: boolean;
}

export function useBackendBootstrap(options: BackendBootstrapOptions = {}) {
  return useQuery({
    queryKey: queryKeys.backend.bootstrap,
    queryFn: () => swarmBackendAdapter.refreshCapabilities('capability-refresh'),
    staleTime: 60 * 1000,
    enabled: options.enabled ?? true,
    refetchInterval: options.autoRefresh ? 30 * 1000 : false,
    refetchIntervalInBackground: false,
  });
}

export function useBackendBootstrapValue<T>(
  selector: (snapshot: BackendBootstrapSnapshot | undefined) => T,
  options: BackendBootstrapOptions = {}
) {
  const bootstrap = useBackendBootstrap(options);

  return {
    ...bootstrap,
    data: useMemo(() => selector(bootstrap.data), [bootstrap.data, selector]),
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
