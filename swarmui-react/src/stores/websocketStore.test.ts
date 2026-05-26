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
      stepSource: 'unknown',
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
      previewEventSequence: null,
      imageEventSequence: null,
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

  it('clears stale stage metadata when the backend reports no active stage', () => {
    useWebSocketStore.getState().initialize('ws://example.test', 'session-1');
    useWebSocketStore.getState().startGeneration({
      prompt: 'test',
      model: 'sdxl-base.safetensors',
      steps: 20,
      images: 1,
    });

    emit('generation:progress', {
      currentStep: 20,
      totalSteps: 20,
      stepSource: 'backend',
      overallPercent: 45,
      batch: 0,
      batchTotal: 1,
      requestId: 'req-live',
      stageLabel: 'Sampling',
      stageIndex: 1,
      stageCount: 2,
      stageTaskIndex: 1,
      stageTaskCount: 2,
    });

    emit('generation:progress', {
      currentStep: 0,
      totalSteps: 0,
      stepSource: 'node_percent',
      overallPercent: 70,
      batch: 0,
      batchTotal: 1,
      requestId: 'req-live',
      stageLabel: null,
      stageIndex: 1,
      stageCount: 2,
      stageTaskIndex: 1,
      stageTaskCount: 2,
    });

    const generation = useWebSocketStore.getState().generation;
    expect(generation.progress).toBe(70);
    expect(generation.stageLabel).toBeNull();
    expect(generation.stageDetail).toBeNull();
    expect(generation.stageIndex).toBe(0);
    expect(generation.stageCount).toBe(0);
    expect(generation.stageTaskIndex).toBe(0);
    expect(generation.stageTaskCount).toBe(0);
    expect(generation.stepSource).toBe('node_percent');
  });

  it('commits direct preview events as soon as they arrive', () => {
    let queuedFrame: FrameRequestCallback | null = null;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      queuedFrame = callback;
      return 1;
    });

    useWebSocketStore.getState().initialize('ws://example.test', 'session-1');
    useWebSocketStore.getState().startGeneration({
      prompt: 'test',
      model: 'sdxl-base.safetensors',
      steps: 20,
      images: 1,
    });

    expect(useWebSocketStore.getState().generation.previewImage).toBeNull();

    emit('generation:preview', {
      image: 'preview-1',
      requestId: 'req-live',
    });

    expect(useWebSocketStore.getState().generation.previewImage).toBe('preview-1');
    expect(queuedFrame).toBeNull();
  });

  it('commits stage metadata with direct preview events', () => {
    useWebSocketStore.getState().initialize('ws://example.test', 'session-1');
    useWebSocketStore.getState().startGeneration({
      prompt: 'test',
      model: 'sdxl-base.safetensors',
      steps: 20,
      images: 1,
    });

    emit('generation:preview', {
      image: 'preview-segment-1',
      requestId: 'req-live',
      stageId: 'segment_1',
      stageLabel: 'Segment 1: breasts',
      stageDetail: 'a close-up of the breasts',
      stageIndex: 2,
      stageCount: 3,
      stagesRemaining: 1,
      stageTaskIndex: 1,
      stageTaskCount: 2,
      stageTasksRemaining: 1,
    });

    const generation = useWebSocketStore.getState().generation;
    expect(generation.previewImage).toBe('preview-segment-1');
    expect(generation.stageId).toBe('segment_1');
    expect(generation.stageLabel).toBe('Segment 1: breasts');
    expect(generation.stageDetail).toBe('a close-up of the breasts');
    expect(generation.stageIndex).toBe(2);
    expect(generation.stageCount).toBe(3);
    expect(generation.stagesRemaining).toBe(1);
    expect(generation.stageTaskIndex).toBe(1);
    expect(generation.stageTaskCount).toBe(2);
    expect(generation.stageTasksRemaining).toBe(1);
  });

  it('does not dedupe a repeated preview image when the segment stage changes', () => {
    useWebSocketStore.getState().initialize('ws://example.test', 'session-1');
    useWebSocketStore.getState().startGeneration({
      prompt: 'test',
      model: 'sdxl-base.safetensors',
      steps: 20,
      images: 1,
    });

    emit('generation:preview', {
      image: 'same-preview',
      requestId: 'req-live',
      stageId: 'segment_1',
      stageLabel: 'Segment 1: breasts',
      stageTaskIndex: 1,
      stageTaskCount: 2,
    });
    const firstRevision = useWebSocketStore.getState().generation.previewRevision;

    emit('generation:preview', {
      image: 'same-preview',
      requestId: 'req-live',
      stageId: 'segment_2',
      stageLabel: 'Segment 2: butt',
      stageTaskIndex: 2,
      stageTaskCount: 2,
    });

    const generation = useWebSocketStore.getState().generation;
    expect(generation.previewImage).toBe('same-preview');
    expect(generation.previewRevision).toBeGreaterThan(firstRevision);
    expect(generation.stageId).toBe('segment_2');
    expect(generation.stageLabel).toBe('Segment 2: butt');
    expect(generation.stageTaskIndex).toBe(2);
  });

  it('does not repaint the same preview when only progress metadata changes', () => {
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

    const firstRevision = useWebSocketStore.getState().generation.previewRevision;

    emit('generation:progress', {
      currentStep: 6,
      totalSteps: 20,
      overallPercent: 30,
      batch: 0,
      batchTotal: 1,
      requestId: 'req-live',
      previewImage: 'preview-1',
    });

    const generation = useWebSocketStore.getState().generation;
    expect(generation.previewImage).toBe('preview-1');
    expect(generation.previewRevision).toBe(firstRevision);
    expect(generation.currentStep).toBe(6);
    expect(generation.progress).toBe(30);
  });

  it('keeps the final image as the preview surface when a preview-mode image arrives', () => {
    useWebSocketStore.getState().initialize('ws://example.test', 'session-1');
    useWebSocketStore.getState().startGeneration({
      prompt: 'test',
      model: 'sdxl-base.safetensors',
      steps: 4,
      images: 1,
      donotsave: true,
    });

    emit('generation:image', {
      image: 'data:image/webp;base64,final-preview',
      requestId: 'req-preview',
    });

    const generation = useWebSocketStore.getState().generation;
    expect(generation.previewImage).toBe('data:image/webp;base64,final-preview');
    expect(generation.images).toContain('data:image/webp;base64,final-preview');
    expect(generation.phase).toBe('image');
  });

  it('does not let an older preview overwrite a newer final image', () => {
    useWebSocketStore.getState().initialize('ws://example.test', 'session-1');
    useWebSocketStore.getState().startGeneration({
      prompt: 'test',
      model: 'sdxl-base.safetensors',
      steps: 4,
      images: 1,
    });

    emit('generation:image', {
      image: 'final-image',
      batch: 0,
      requestId: 'req-live',
      eventSequence: 12,
    });
    emit('generation:preview', {
      image: 'older-preview',
      batch: 0,
      requestId: 'req-live',
      eventSequence: 11,
      overallPercent: 95,
    });

    const generation = useWebSocketStore.getState().generation;
    expect(generation.previewImage).toBe('final-image');
    expect(generation.imageEventSequence).toBe(12);
  });

  it('does not let an older progress preview overwrite a newer final image', () => {
    useWebSocketStore.getState().initialize('ws://example.test', 'session-1');
    useWebSocketStore.getState().startGeneration({
      prompt: 'test',
      model: 'sdxl-base.safetensors',
      steps: 4,
      images: 1,
    });

    emit('generation:progress', {
      currentStep: 0,
      totalSteps: 0,
      stepSource: 'node_percent',
      overallPercent: 96,
      batch: 0,
      batchTotal: 1,
      requestId: 'req-live',
      eventSequence: 21,
      previewImage: 'queued-preview',
    });
    emit('generation:image', {
      image: 'final-image',
      batch: 0,
      requestId: 'req-live',
      eventSequence: 22,
    });

    const generation = useWebSocketStore.getState().generation;
    expect(generation.previewImage).toBe('final-image');
    expect(generation.previewEventSequence).toBe(22);
  });

  it('keeps visible progress monotonic when backend node progress regresses', () => {
    useWebSocketStore.getState().initialize('ws://example.test', 'session-1');
    useWebSocketStore.getState().startGeneration({
      prompt: 'test',
      model: 'sdxl-base.safetensors',
      steps: 20,
      images: 1,
    });

    emit('generation:progress', {
      currentStep: 0,
      totalSteps: 0,
      stepSource: 'node_percent',
      overallPercent: 60,
      batch: 0,
      batchTotal: 1,
      requestId: 'req-live',
      eventSequence: 30,
    });
    emit('generation:progress', {
      currentStep: 0,
      totalSteps: 0,
      stepSource: 'node_percent',
      overallPercent: 55,
      batch: 0,
      batchTotal: 1,
      requestId: 'req-live',
      eventSequence: 31,
    });

    const generation = useWebSocketStore.getState().generation;
    expect(generation.progress).toBe(60);
    expect(generation.stepSource).toBe('node_percent');
  });

  it('preserves the last preview frame when a preview loop starts the next request', () => {
    useWebSocketStore.getState().initialize('ws://example.test', 'session-1');
    useWebSocketStore.getState().startGeneration({
      prompt: 'test',
      model: 'sdxl-base.safetensors',
      steps: 4,
      images: 1,
      donotsave: true,
    });
    emit('generation:image', {
      image: 'data:image/webp;base64,previous-preview',
      requestId: 'req-preview-1',
    });

    const previousRevision = useWebSocketStore.getState().generation.previewRevision;
    useWebSocketStore.getState().startGeneration({
      prompt: 'test changed',
      model: 'sdxl-base.safetensors',
      steps: 4,
      images: 1,
      donotsave: true,
    }, undefined, { preservePreviewImage: true });

    const generation = useWebSocketStore.getState().generation;
    expect(generation.previewImage).toBe('data:image/webp;base64,previous-preview');
    expect(generation.previewRevision).toBe(previousRevision);
    expect(generation.images).toEqual([]);
    expect(generation.isGenerating).toBe(true);
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
