import { create } from 'zustand';
import type { GenerateParams } from '../api/types';
import type { CanvasApplyPayload } from '../features/promptBuilder';

export type CanvasWorkflowLaunchSource = 'generate' | 'history' | 'gallery';
export type CanvasWorkflowStep = 'source' | 'mask' | 'regions' | 'segments' | 'generate';
export type CanvasWorkflowResultSource = 'generate' | 'upscale' | 'invoke';

export interface CanvasWorkflowResult {
  imageUrl: string;
  metadata?: string | Record<string, unknown> | null;
  source: CanvasWorkflowResultSource;
}

export interface CanvasWorkflowLaunch {
  imageUrl: string;
  metadata?: string | Record<string, unknown> | null;
  width?: number | null;
  height?: number | null;
  launchSource: CanvasWorkflowLaunchSource;
  fallbackParams?: Partial<GenerateParams>;
  initialStep?: CanvasWorkflowStep;
}

export interface CanvasWorkflowGenerateRequest {
  id: string;
  sessionId: string;
  payload: CanvasApplyPayload;
  params: GenerateParams;
}

interface CanvasWorkflowState {
  isOpen: boolean;
  sessionId: string | null;
  launchSource: CanvasWorkflowLaunchSource | null;
  currentStep: CanvasWorkflowStep;
  sourceImageUrl: string | null;
  sourceImageMetadata: string | Record<string, unknown> | null;
  sourceImageWidth: number | null;
  sourceImageHeight: number | null;
  workingImageUrl: string | null;
  workingImageMetadata: string | Record<string, unknown> | null;
  fallbackParams: Partial<GenerateParams> | null;
  lastApplyPayload: CanvasApplyPayload | null;
  pendingResult: CanvasWorkflowResult | null;
  awaitingResult: boolean;
  awaitingResultImageCount: number;
  clearMaskVersion: number;
  upscalerOpen: boolean;
  pendingGenerateRequest: CanvasWorkflowGenerateRequest | null;
}

interface CanvasWorkflowActions {
  openSession: (launch: CanvasWorkflowLaunch) => string;
  closeSession: () => void;
  setStep: (step: CanvasWorkflowStep) => void;
  setFallbackParams: (params: Partial<GenerateParams>) => void;
  recordApplyPayload: (payload: CanvasApplyPayload) => void;
  openUpscaler: () => void;
  closeUpscaler: () => void;
  queueGenerateRequest: (payload: CanvasApplyPayload, params: GenerateParams) => CanvasWorkflowGenerateRequest | null;
  consumeGenerateRequest: (id: string) => void;
  markAwaitingResult: (awaiting: boolean, imageCount?: number) => void;
  setPendingResult: (result: CanvasWorkflowResult | null) => void;
  usePendingResult: (nextStep?: CanvasWorkflowStep) => void;
  continueRefining: () => void;
}

export type CanvasWorkflowStore = CanvasWorkflowState & CanvasWorkflowActions;

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const initialState: CanvasWorkflowState = {
  isOpen: false,
  sessionId: null,
  launchSource: null,
  currentStep: 'source',
  sourceImageUrl: null,
  sourceImageMetadata: null,
  sourceImageWidth: null,
  sourceImageHeight: null,
  workingImageUrl: null,
  workingImageMetadata: null,
  fallbackParams: null,
  lastApplyPayload: null,
  pendingResult: null,
  awaitingResult: false,
  awaitingResultImageCount: 0,
  clearMaskVersion: 0,
  upscalerOpen: false,
  pendingGenerateRequest: null,
};

export const useCanvasWorkflowStore = create<CanvasWorkflowStore>((set) => ({
  ...initialState,

  openSession: (launch) => {
    const sessionId = createId('canvas-session');
    set({
      isOpen: true,
      sessionId,
      launchSource: launch.launchSource,
      currentStep: launch.initialStep ?? 'mask',
      sourceImageUrl: launch.imageUrl,
      sourceImageMetadata: launch.metadata ?? null,
      sourceImageWidth: launch.width ?? null,
      sourceImageHeight: launch.height ?? null,
      workingImageUrl: launch.imageUrl,
      workingImageMetadata: launch.metadata ?? null,
      fallbackParams: launch.fallbackParams ?? null,
      lastApplyPayload: null,
      pendingResult: null,
      awaitingResult: false,
      awaitingResultImageCount: 0,
      clearMaskVersion: 0,
      upscalerOpen: false,
      pendingGenerateRequest: null,
    });
    return sessionId;
  },

  closeSession: () => set(initialState),

  setStep: (currentStep) => set({ currentStep }),

  setFallbackParams: (fallbackParams) => set((state) => ({
    fallbackParams: {
      ...(state.fallbackParams ?? {}),
      ...fallbackParams,
    },
  })),

  recordApplyPayload: (lastApplyPayload) => set({ lastApplyPayload }),

  openUpscaler: () => set({ upscalerOpen: true }),

  closeUpscaler: () => set({ upscalerOpen: false }),

  queueGenerateRequest: (payload, params) => {
    let request: CanvasWorkflowGenerateRequest | null = null;
    set((state) => {
      if (!state.sessionId) {
        request = null;
        return state;
      }
      request = {
        id: createId('canvas-generate'),
        sessionId: state.sessionId,
        payload,
        params,
      };
      return {
        lastApplyPayload: payload,
        pendingGenerateRequest: request,
        awaitingResult: false,
        awaitingResultImageCount: 0,
      };
    });
    return request;
  },

  consumeGenerateRequest: (id) => set((state) => ({
    pendingGenerateRequest: state.pendingGenerateRequest?.id === id ? null : state.pendingGenerateRequest,
  })),

  markAwaitingResult: (awaitingResult, imageCount = 0) => set({
    awaitingResult,
    awaitingResultImageCount: awaitingResult ? imageCount : 0,
  }),

  setPendingResult: (pendingResult) => set({
    pendingResult,
    awaitingResult: false,
    awaitingResultImageCount: 0,
  }),

  usePendingResult: (nextStep = 'source') => set((state) => {
    if (!state.pendingResult) {
      return state;
    }
    return {
      workingImageUrl: state.pendingResult.imageUrl,
      workingImageMetadata: state.pendingResult.metadata ?? state.workingImageMetadata,
      pendingResult: null,
      currentStep: nextStep,
      clearMaskVersion: state.clearMaskVersion + 1,
      upscalerOpen: false,
    };
  }),

  continueRefining: () => set((state) => {
    if (!state.pendingResult) {
      return state;
    }
    return {
      workingImageUrl: state.pendingResult.imageUrl,
      workingImageMetadata: state.pendingResult.metadata ?? state.workingImageMetadata,
      pendingResult: null,
      currentStep: 'mask',
      clearMaskVersion: state.clearMaskVersion + 1,
      upscalerOpen: false,
    };
  }),
}));
