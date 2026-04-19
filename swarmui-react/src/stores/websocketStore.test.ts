import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWebSocketStore } from './websocketStore';

type WSEventCallback = (event: { data: unknown; endpoint: string; timestamp: number }) => void;

const listeners = new Map<string, WSEventCallback[]>();

vi.mock('../api/ws', () => ({
  initWSManager: vi.fn(() => ({
    on: (eventType: string, callback: WSEventCallback) => {
      const current = listeners.get(eventType) ?? [];
      current.push(callback);
      listeners.set(eventType, current);
      return () => undefined;
    },
  })),
  getWSManager: vi.fn(() => ({
    startGeneration: vi.fn(),
    stopGeneration: vi.fn(),
    disconnectAll: vi.fn(),
  })),
  updateWSManagerSession: vi.fn(),
}));

function emit(eventType: string, data: unknown, endpoint = 'GenerateText2ImageWS'): void {
  for (const callback of listeners.get(eventType) ?? []) {
    callback({
      data,
      endpoint,
      timestamp: Date.now(),
    });
  }
}

function resetStore(): void {
  useWebSocketStore.setState({
    isInitialized: false,
    connectionHealth: 'disconnected',
    connectionIssue: {
      endpoint: null,
      reason: null,
      missedPongs: 0,
      lastTransitionAt: null,
    },
    connections: new Map(),
    generation: {
      isGenerating: false,
      hasProgressEvent: false,
      generationId: null,
      requestId: null,
      progress: 0,
      currentStep: 0,
      totalSteps: 0,
      stageId: null,
      stageLabel: null,
      stageDetail: null,
      stageIndex: 0,
      stageCount: 0,
      stagesRemaining: 0,
      stageTaskIndex: 0,
      stageTaskCount: 0,
      stageTasksRemaining: 0,
      currentBatch: 0,
      totalBatches: 1,
      previewImage: null,
      previewRevision: 0,
      images: [],
      error: null,
      errorId: null,
      errorData: null,
      phase: 'idle',
      lastEventAt: null,
      startTime: null,
    },
    modelLoading: {
      isLoading: false,
      progress: 0,
      modelName: null,
      loadingCount: 0,
      isProgressEstimated: false,
      error: null,
    },
    downloads: new Map(),
    sessionRecovery: {
      isRecovering: false,
      attempts: 0,
      lastRecoveredAt: null,
      lastError: null,
    },
  });
}

describe('websocketStore recoverable generation errors', () => {
  beforeEach(() => {
    listeners.clear();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    resetStore();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    listeners.clear();
    resetStore();
  });

  it('keeps generation active when missing-model-input arrives after progress has started', () => {
    useWebSocketStore.getState().initialize('ws://example.test', 'session-1');
    useWebSocketStore.getState().startGeneration({
      prompt: 'test',
      model: 'sdxl-base.safetensors',
      steps: 20,
      images: 1,
    });

    emit('generation:progress', {
      currentStep: 5,
      totalSteps: 20,
      overallPercent: 25,
      batch: 0,
      batchTotal: 1,
      requestId: 'req-live',
      previewImage: 'preview-1',
    });
    emit('generation:error', {
      error: 'No model input given',
      errorId: 'missing_model_input',
      requestId: 'req-live',
    });

    const generation = useWebSocketStore.getState().generation;
    expect(generation.isGenerating).toBe(true);
    expect(generation.phase).toBe('progress');
    expect(generation.error).toBeNull();
    expect(generation.previewImage).toBe('preview-1');
  });

  it('keeps generation active when legacy plain-text missing-model errors arrive after progress has started', () => {
    useWebSocketStore.getState().initialize('ws://example.test', 'session-1');
    useWebSocketStore.getState().startGeneration({
      prompt: 'test',
      model: 'sdxl-base.safetensors',
      steps: 20,
      images: 1,
    });

    emit('generation:progress', {
      currentStep: 5,
      totalSteps: 20,
      overallPercent: 25,
      batch: 0,
      batchTotal: 1,
      requestId: 'req-live',
      previewImage: 'preview-1',
    });
    emit('generation:error', {
      error: 'No model input given. Did your UI load properly?',
      requestId: 'req-live',
    });

    const generation = useWebSocketStore.getState().generation;
    expect(generation.isGenerating).toBe(true);
    expect(generation.phase).toBe('progress');
    expect(generation.error).toBeNull();
    expect(generation.previewImage).toBe('preview-1');
  });

  it('stores stage-aware progress details from the backend', () => {
    useWebSocketStore.getState().initialize('ws://example.test', 'session-1');
    useWebSocketStore.getState().startGeneration({
      prompt: 'test',
      model: 'sdxl-base.safetensors',
      steps: 20,
      images: 1,
    });

    emit('generation:progress', {
      currentStep: 2,
      totalSteps: 8,
      overallPercent: 42,
      batch: 0,
      batchTotal: 1,
      requestId: 'req-live',
      stageId: 'refiner_upscale',
      stageLabel: 'Hi-res fix upscale',
      stageDetail: 'Applying upscale model',
      stageIndex: 3,
      stageCount: 5,
      stagesRemaining: 2,
      stageTaskIndex: 2,
      stageTaskCount: 3,
      stageTasksRemaining: 1,
      previewImage: 'preview-upscale',
    });

    const generation = useWebSocketStore.getState().generation;
    expect(generation.currentStep).toBe(2);
    expect(generation.totalSteps).toBe(8);
    expect(generation.stageId).toBe('refiner_upscale');
    expect(generation.stageLabel).toBe('Hi-res fix upscale');
    expect(generation.stageDetail).toBe('Applying upscale model');
    expect(generation.stageIndex).toBe(3);
    expect(generation.stageCount).toBe(5);
    expect(generation.stagesRemaining).toBe(2);
    expect(generation.stageTaskIndex).toBe(2);
    expect(generation.stageTaskCount).toBe(3);
    expect(generation.stageTasksRemaining).toBe(1);
    expect(generation.previewImage).toBe('preview-upscale');
  });

  it('ignores missing-model-input errors with a different request id once live progress exists', () => {
    useWebSocketStore.getState().initialize('ws://example.test', 'session-1');
    useWebSocketStore.getState().startGeneration({
      prompt: 'test',
      model: 'sdxl-base.safetensors',
      steps: 20,
      images: 1,
    });

    emit('generation:progress', {
      currentStep: 4,
      totalSteps: 20,
      overallPercent: 20,
      batch: 0,
      batchTotal: 1,
      requestId: 'req-live',
      previewImage: 'preview-1',
    });
    emit('generation:error', {
      error: 'No model input given',
      errorId: 'missing_model_input',
      requestId: 'req-stray',
    });

    const generation = useWebSocketStore.getState().generation;
    expect(generation.isGenerating).toBe(true);
    expect(generation.error).toBeNull();
    expect(generation.requestId).toBe('req-live');
  });

  it('clears stale error state when a generation later completes successfully', () => {
    useWebSocketStore.getState().initialize('ws://example.test', 'session-1');
    useWebSocketStore.getState().startGeneration({
      prompt: 'test',
      model: 'sdxl-base.safetensors',
      steps: 20,
      images: 1,
    });

    emit('generation:error', {
      error: 'Backend warning before success',
      requestId: 'req-live',
    });
    emit('generation:complete', {
      success: true,
      requestId: 'req-live',
    });

    const generation = useWebSocketStore.getState().generation;
    expect(generation.phase).toBe('complete');
    expect(generation.error).toBeNull();
    expect(generation.errorId).toBeNull();
    expect(generation.errorData).toBeNull();
  });
});
