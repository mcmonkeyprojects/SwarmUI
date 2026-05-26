import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocketManager } from './WebSocketManager';

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  sentPayloads: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(payload: string): void {
    this.sentPayloads.push(payload);
  }

  close(code?: number, reason?: string): void {
    this.readyState = MockWebSocket.CLOSED;
    const closeEvent = {
      code: code ?? 1000,
      reason: reason ?? '',
      wasClean: true,
    } as CloseEvent;
    this.onclose?.(closeEvent);
  }

  emitOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  emitMessage(payload: unknown): void {
    const messageEvent = { data: JSON.stringify(payload) } as MessageEvent;
    this.onmessage?.(messageEvent);
  }
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('WebSocketManager session recovery', () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalWebSocket) {
      globalThis.WebSocket = originalWebSocket;
      return;
    }
    Reflect.deleteProperty(globalThis, 'WebSocket');
  });

  it('recovers invalid sessions and reconnects with the refreshed session id', async () => {
    const refreshSession = vi.fn().mockResolvedValue('session-new');
    const manager = new WebSocketManager({
      baseUrl: 'ws://example.test',
      sessionId: 'session-old',
      refreshSession,
      enableHeartbeat: false,
      connectionTimeout: 1000,
    });

    let recoveredEvents = 0;
    manager.on('session:recovered', () => {
      recoveredEvents += 1;
    });

    manager.connect('GenerateText2ImageWS', { prompt: 'test', model: 'sdxl-base.safetensors' }, 'generation');

    const firstSocket = MockWebSocket.instances[0];
    expect(firstSocket).toBeDefined();
    firstSocket.emitOpen();
    expect(JSON.parse(firstSocket.sentPayloads[0]).session_id).toBe('session-old');

    firstSocket.emitMessage({
      error: 'Session expired',
      error_id: 'invalid_session_id',
    });

    await flushMicrotasks();

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(MockWebSocket.instances).toHaveLength(2);

    const secondSocket = MockWebSocket.instances[1];
    secondSocket.emitOpen();
    expect(JSON.parse(secondSocket.sentPayloads[0]).session_id).toBe('session-new');
    expect(recoveredEvents).toBe(1);

    manager.disconnectAll();
  });

  it('deduplicates invalid-session recovery while a refresh is already in-flight', async () => {
    const refreshDeferred = createDeferred<string>();
    const refreshSession = vi.fn().mockImplementation(() => refreshDeferred.promise);

    const manager = new WebSocketManager({
      baseUrl: 'ws://example.test',
      sessionId: 'session-old',
      refreshSession,
      enableHeartbeat: false,
      connectionTimeout: 1000,
    });

    let recoveredEvents = 0;
    manager.on('session:recovered', () => {
      recoveredEvents += 1;
    });

    manager.connect('GenerateText2ImageWS', { prompt: 'test', model: 'sdxl-base.safetensors' }, 'generation');
    const firstSocket = MockWebSocket.instances[0];
    firstSocket.emitOpen();

    firstSocket.emitMessage({ error: 'expired', error_id: 'invalid_session_id' });
    firstSocket.emitMessage({ error: 'expired', error_id: 'invalid_session_id' });

    expect(refreshSession).toHaveBeenCalledTimes(1);

    refreshDeferred.resolve('session-refresh-1');
    await flushMicrotasks();

    expect(MockWebSocket.instances).toHaveLength(2);
    expect(recoveredEvents).toBe(1);

    manager.disconnectAll();
  });

  it('propagates request ids for generation error and completion events', () => {
    const manager = new WebSocketManager({
      baseUrl: 'ws://example.test',
      sessionId: 'session-1',
      enableHeartbeat: false,
      connectionTimeout: 1000,
    });

    const generationErrors: Array<{ error: string; requestId?: string }> = [];
    const generationCompletes: Array<{ success?: boolean; requestId?: string }> = [];

    manager.on('generation:error', (event) => {
      generationErrors.push(event.data as { error: string; requestId?: string });
    });
    manager.on('generation:complete', (event) => {
      generationCompletes.push(event.data as { success?: boolean; requestId?: string });
    });

    manager.connect('GenerateText2ImageWS', { prompt: 'test', model: 'sdxl-base.safetensors' }, 'generation');
    const socket = MockWebSocket.instances[0];
    socket.emitOpen();

    socket.emitMessage({
      error: 'No model input given',
      error_id: 'missing_model',
      request_id: 'req-error',
    });
    socket.emitMessage({
      success: true,
      request_id: 'req-success',
    });
    socket.emitMessage({
      socket_intention: 'close',
      request_id: 'req-close',
    });

    expect(generationErrors).toHaveLength(1);
    expect(generationErrors[0]).toMatchObject({
      error: 'No model input given',
      requestId: 'req-error',
    });

    expect(generationCompletes).toHaveLength(2);
    expect(generationCompletes[0]).toMatchObject({
      success: true,
      requestId: 'req-success',
    });
    expect(generationCompletes[1]).toMatchObject({
      success: true,
      requestId: 'req-close',
    });

    manager.disconnectAll();
  });

  it('suppresses missing-model errors once an active generation has already started streaming', () => {
    const manager = new WebSocketManager({
      baseUrl: 'ws://example.test',
      sessionId: 'session-1',
      enableHeartbeat: false,
      connectionTimeout: 1000,
    });

    const generationErrors: Array<{ error: string; requestId?: string }> = [];
    const generationProgress: Array<{ requestId?: string }> = [];

    manager.on('generation:error', (event) => {
      generationErrors.push(event.data as { error: string; requestId?: string });
    });
    manager.on('generation:progress', (event) => {
      generationProgress.push(event.data as { requestId?: string });
    });

    manager.connect('GenerateText2ImageWS', { prompt: 'test', model: 'sdxl-base.safetensors' }, 'generation');
    const socket = MockWebSocket.instances[0];
    socket.emitOpen();

    socket.emitMessage({
      gen_progress: {
        batch_index: '0',
        request_id: 'req-live',
        overall_percent: 0.2,
        current_percent: 0.5,
      },
    });
    socket.emitMessage({
      error: 'No model input given',
      error_id: 'missing_model_input',
    });

    expect(generationProgress).toHaveLength(1);
    expect(generationErrors).toHaveLength(0);

    manager.disconnectAll();
  });

  it('suppresses legacy plain-text missing-model errors once an active generation has already started streaming', () => {
    const manager = new WebSocketManager({
      baseUrl: 'ws://example.test',
      sessionId: 'session-1',
      enableHeartbeat: false,
      connectionTimeout: 1000,
    });

    const generationErrors: Array<{ error: string; requestId?: string }> = [];

    manager.on('generation:error', (event) => {
      generationErrors.push(event.data as { error: string; requestId?: string });
    });

    manager.connect('GenerateText2ImageWS', { prompt: 'test', model: 'sdxl-base.safetensors' }, 'generation');
    const socket = MockWebSocket.instances[0];
    socket.emitOpen();

    socket.emitMessage({
      gen_progress: {
        batch_index: '0',
        request_id: 'req-live',
        overall_percent: 0.2,
        current_percent: 0.5,
      },
    });
    socket.emitMessage({
      error: 'No model input given. Did your UI load properly?',
    });

    expect(generationErrors).toHaveLength(0);

    manager.disconnectAll();
  });

  it('suppresses missing-model errors when they reference the active streamed request id', () => {
    const manager = new WebSocketManager({
      baseUrl: 'ws://example.test',
      sessionId: 'session-1',
      enableHeartbeat: false,
      connectionTimeout: 1000,
    });

    const generationErrors: Array<{ error: string; requestId?: string }> = [];

    manager.on('generation:error', (event) => {
      generationErrors.push(event.data as { error: string; requestId?: string });
    });

    manager.connect('GenerateText2ImageWS', { prompt: 'test', model: 'sdxl-base.safetensors' }, 'generation');
    const socket = MockWebSocket.instances[0];
    socket.emitOpen();

    socket.emitMessage({
      gen_progress: {
        batch_index: '0',
        request_id: 'req-live',
        overall_percent: 0.2,
        current_percent: 0.5,
      },
    });
    socket.emitMessage({
      error: 'No model input given',
      error_id: 'missing_model_input',
      request_id: 'req-live',
    });

    expect(generationErrors).toHaveLength(0);

    manager.disconnectAll();
  });

  it('suppresses missing-model errors even when they carry a different request id after progress started', () => {
    const manager = new WebSocketManager({
      baseUrl: 'ws://example.test',
      sessionId: 'session-1',
      enableHeartbeat: false,
      connectionTimeout: 1000,
    });

    const generationErrors: Array<{ error: string; requestId?: string }> = [];

    manager.on('generation:error', (event) => {
      generationErrors.push(event.data as { error: string; requestId?: string });
    });

    manager.connect('GenerateText2ImageWS', { prompt: 'test', model: 'sdxl-base.safetensors' }, 'generation');
    const socket = MockWebSocket.instances[0];
    socket.emitOpen();

    socket.emitMessage({
      gen_progress: {
        batch_index: '0',
        request_id: 'req-live',
        overall_percent: 0.2,
        current_percent: 0.5,
      },
    });
    socket.emitMessage({
      error: 'No model input given',
      error_id: 'missing_model_input',
      request_id: 'req-stray',
    });

    expect(generationErrors).toHaveLength(0);

    manager.disconnectAll();
  });

  it('preserves stage-aware progress details from backend progress events', () => {
    const manager = new WebSocketManager({
      baseUrl: 'ws://example.test',
      sessionId: 'session-1',
      enableHeartbeat: false,
      connectionTimeout: 1000,
    });

    const generationProgress: Array<Record<string, unknown>> = [];

    manager.on('generation:progress', (event) => {
      generationProgress.push(event.data as Record<string, unknown>);
    });

    manager.connect('GenerateText2ImageWS', { prompt: 'test', model: 'sdxl-base.safetensors' }, 'generation');
    const socket = MockWebSocket.instances[0];
    socket.emitOpen();

    socket.emitMessage({
      gen_progress: {
        batch_index: '0',
        request_id: 'req-live',
        overall_percent: 0.35,
        current_percent: 0.5,
        stage_id: 'refiner_upscale',
        stage_label: 'Hi-res fix upscale',
        stage_detail: 'Applying upscale model',
        stage_index: '3',
        stage_count: '5',
        stages_remaining: '2',
        stage_task_index: '2',
        stage_task_count: '3',
        stage_tasks_remaining: '1',
        stage_current_step: '2',
        stage_total_steps: '4',
      },
    });

    expect(generationProgress).toHaveLength(1);
    expect(generationProgress[0]).toMatchObject({
      currentStep: 2,
      totalSteps: 4,
      stageId: 'refiner_upscale',
      stageLabel: 'Hi-res fix upscale',
      stageDetail: 'Applying upscale model',
      stageIndex: 3,
      stageCount: 5,
      stagesRemaining: 2,
      stageTaskIndex: 2,
      stageTaskCount: 3,
      stageTasksRemaining: 1,
      requestId: 'req-live',
    });

    manager.disconnectAll();
  });

  it('still surfaces missing-model errors before any live generation activity exists', () => {
    const manager = new WebSocketManager({
      baseUrl: 'ws://example.test',
      sessionId: 'session-1',
      enableHeartbeat: false,
      connectionTimeout: 1000,
    });

    const generationErrors: Array<{ error: string; requestId?: string }> = [];

    manager.on('generation:error', (event) => {
      generationErrors.push(event.data as { error: string; requestId?: string });
    });

    manager.connect('GenerateText2ImageWS', { prompt: 'test', model: 'sdxl-base.safetensors' }, 'generation');
    const socket = MockWebSocket.instances[0];
    socket.emitOpen();

    socket.emitMessage({
      error: 'No model input given',
      error_id: 'missing_model_input',
    });

    expect(generationErrors).toHaveLength(1);
    expect(generationErrors[0]).toMatchObject({
      error: 'No model input given',
    });

    manager.disconnectAll();
  });

  it('still surfaces legacy plain-text missing-model errors before any live generation activity exists', () => {
    const manager = new WebSocketManager({
      baseUrl: 'ws://example.test',
      sessionId: 'session-1',
      enableHeartbeat: false,
      connectionTimeout: 1000,
    });

    const generationErrors: Array<{ error: string; requestId?: string }> = [];

    manager.on('generation:error', (event) => {
      generationErrors.push(event.data as { error: string; requestId?: string });
    });

    manager.connect('GenerateText2ImageWS', { prompt: 'test', model: 'sdxl-base.safetensors' }, 'generation');
    const socket = MockWebSocket.instances[0];
    socket.emitOpen();

    socket.emitMessage({
      error: 'No model input given. Did your UI load properly?',
    });

    expect(generationErrors).toHaveLength(1);
    expect(generationErrors[0]).toMatchObject({
      error: 'No model input given. Did your UI load properly?',
    });

    manager.disconnectAll();
  });
});
