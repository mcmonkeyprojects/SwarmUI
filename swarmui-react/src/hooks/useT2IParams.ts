import { useMemo, useCallback } from 'react';
import { useSessionStore } from '../stores/session';
import type { T2IParam, T2IParamGroup, T2IParamsResponse } from '../api/types';
import { useBackendBootstrap } from './useBackendBootstrap';
import type { SamplerOption, SchedulerOption } from '../data/samplerData';
import {
  SAMPLER_OPTIONS as FALLBACK_SAMPLERS,
  SCHEDULER_OPTIONS as FALLBACK_SCHEDULERS,
  createUnknownSamplingOption,
} from '../data/samplerData';
import { logger } from '../utils/logger';

interface ParamRange {
  min: number;
  max: number;
  step?: number;
  default: number | string | boolean;
  viewMax?: number;
}

type SamplingOptionLike = SamplerOption | SchedulerOption;

interface T2IParamsState {
  params: T2IParam[];
  groups: T2IParamGroup[];
  isLoaded: boolean;
  isLoading: boolean;
  samplerOptions: SamplerOption[];
  schedulerOptions: SchedulerOption[];
  paramRanges: Record<string, ParamRange>;
  paramDefaults: Record<string, string | number | boolean>;
  extraParams: T2IParam[];
  reload: () => Promise<void>;
}

// Parameter IDs that have dedicated UI components
const KNOWN_PARAM_IDS = new Set([
  'prompt', 'negativeprompt', 'images', 'steps', 'cfgscale',
  'seed', 'width', 'height', 'model', 'sampler', 'scheduler',
  'clipstopatlayer', 'initimage', 'initimagecreativity',
  'initimageresettonorm', 'initimagenoise',
  'variationseed', 'variationseedstrength', 'vae',
  'refinermodel', 'refinercontrol', 'refinerupscale',
  'refinermethod', 'refinervae', 'refinersteps', 'refinercfgscale',
  'refinerdotiling', 'refinerupscalemethod',
  'loras', 'loraweights',
  'controlnetmodel', 'controlnetstrength', 'controlnetstart',
  'controlnetend', 'controlnetimageinput',
  'controlnettwomodel', 'controlnettwostrength', 'controlnettwostart',
  'controlnettwoend', 'controlnettwoimageinput',
  'controlnetthreemodel', 'controlnetthreestrength', 'controlnetthreestart',
  'controlnetthreeend', 'controlnetthreeimageinput',
  'batchsize', 'maskimage', 'maskblur', 'invertmask',
  'removebackground', 'donotsave', 'dontsaveintermediates',
  'nopreviews',
  'seamlesstileable', 'resizemode', 'coloradjust',
  'freeublockone', 'freeublocktwo', 'freeuskipone', 'freeuskiptwo',
  'videomodel', 'videoframes', 'videosteps', 'videocfg',
  'videofps', 'videoformat', 'videoboomerang',
  'text2videoframes', 'text2videofps', 'text2videoformat',
]);

export function mergeSamplingOptions<T extends SamplingOptionLike>(
  kind: 'sampler' | 'scheduler',
  backendValues: string[] | undefined,
  backendLabels: string[] | undefined,
  fallbackOptions: T[],
  fallbackLookup: Map<string, T>,
): T[] {
  if (!backendValues || backendValues.length === 0) {
    return fallbackOptions;
  }

  const mergedOptions = backendValues.map((value, index) => {
    const fallback = fallbackLookup.get(value);
    const backendLabel = backendLabels?.[index] || undefined;
    if (fallback) {
      return {
        ...fallback,
        label: backendLabel || fallback.label,
      };
    }
    return createUnknownSamplingOption(kind, value, backendLabel) as T;
  });

  const mergedLookup = new Set(mergedOptions.map((option) => option.value));
  const missingFallbacks = fallbackOptions.filter((option) => !mergedLookup.has(option.value));

  return [...mergedOptions, ...missingFallbacks];
}

export function useT2IParams(): T2IParamsState {
  const isInitialized = useSessionStore((state) => state.isInitialized);
  const query = useBackendBootstrap({ enabled: isInitialized });

  const loadParams = useCallback(async () => {
    try {
      await query.refetch();
    } catch (error) {
      logger.error('Failed to load T2I params:', error);
    }
  }, [query]);

  const rawResponse: T2IParamsResponse | null = query.data?.t2iParams ?? null;

  const params = useMemo(() => rawResponse?.list ?? [], [rawResponse]);
  const groups = useMemo(() => rawResponse?.groups ?? [], [rawResponse]);

  const samplerLookup = useMemo(() => {
    const map = new Map<string, SamplerOption>();
    FALLBACK_SAMPLERS.forEach((option) => map.set(option.value, option));
    return map;
  }, []);

  const schedulerLookup = useMemo(() => {
    const map = new Map<string, SchedulerOption>();
    FALLBACK_SCHEDULERS.forEach((option) => map.set(option.value, option));
    return map;
  }, []);

  const samplerOptions = useMemo((): SamplerOption[] => {
    const samplerParam = params.find(p => p.id === 'sampler');
    return mergeSamplingOptions(
      'sampler',
      samplerParam?.values ?? undefined,
      samplerParam?.value_names ?? undefined,
      FALLBACK_SAMPLERS,
      samplerLookup,
    );
  }, [params, samplerLookup]);

  const schedulerOptions = useMemo((): SchedulerOption[] => {
    const schedulerParam = params.find(p => p.id === 'scheduler');
    return mergeSamplingOptions(
      'scheduler',
      schedulerParam?.values ?? undefined,
      schedulerParam?.value_names ?? undefined,
      FALLBACK_SCHEDULERS,
      schedulerLookup,
    );
  }, [params, schedulerLookup]);

  const paramRanges = useMemo(() => {
    const ranges: Record<string, ParamRange> = {};
    for (const param of params) {
      if (param.min !== undefined && param.max !== undefined) {
        ranges[param.id] = {
          min: param.min,
          max: param.max,
          step: param.step,
          default: param.default,
          viewMax: param.view_max,
        };
      }
    }
    return ranges;
  }, [params]);

  const paramDefaults = useMemo(() => {
    const defaults: Record<string, string | number | boolean> = {};
    for (const param of params) {
      if (param.default !== undefined) {
        defaults[param.id] = param.default;
      }
    }
    return defaults;
  }, [params]);

  const extraParams = useMemo(
    () => params.filter(p => !KNOWN_PARAM_IDS.has(p.id) && p.visible && !p.extra_hidden),
    [params]
  );

  return {
    params,
    groups,
    isLoaded: rawResponse !== null,
    isLoading: query.isLoading || query.isFetching,
    samplerOptions,
    schedulerOptions,
    paramRanges,
    paramDefaults,
    extraParams,
    reload: loadParams,
  };
}
