import { afterEach, describe, expect, it } from 'vitest';
import { useCanvasWorkflowStore } from './canvasWorkflowStore';

afterEach(() => {
  useCanvasWorkflowStore.getState().closeSession();
});

describe('canvasWorkflowStore', () => {
  it('opens a shared workflow session with the requested starting step', () => {
    const sessionId = useCanvasWorkflowStore.getState().openSession({
      imageUrl: '/View/source.png',
      metadata: { prompt: 'portrait' },
      width: 768,
      height: 1024,
      launchSource: 'history',
      fallbackParams: { prompt: 'portrait', model: 'sdxl' },
      initialStep: 'regions',
    });

    const state = useCanvasWorkflowStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.sessionId).toBe(sessionId);
    expect(state.currentStep).toBe('regions');
    expect(state.workingImageUrl).toBe('/View/source.png');
    expect(state.fallbackParams?.model).toBe('sdxl');
  });

  it('queues and consumes a generate request for the active session', () => {
    useCanvasWorkflowStore.getState().openSession({
      imageUrl: '/View/source.png',
      launchSource: 'generate',
      initialStep: 'mask',
    });

    const request = useCanvasWorkflowStore.getState().queueGenerateRequest(
      {
        mode: 'regional',
        sourceImageUrl: '/View/source.png',
        sourceImageWidth: 512,
        sourceImageHeight: 512,
        maskDataUrl: 'data:image/png;base64,mask',
        hasMask: true,
        regions: [],
        segments: [],
        managedBlock: '',
        managedBlockHash: 'hash',
        syncState: 'synced',
      },
      {
        prompt: 'change shirt to red',
        model: 'sdxl',
      }
    );

    expect(request).not.toBeNull();
    expect(useCanvasWorkflowStore.getState().pendingGenerateRequest?.id).toBe(request?.id);
    expect(useCanvasWorkflowStore.getState().pendingGenerateRequest?.params.model).toBe('sdxl');

    if (request) {
      useCanvasWorkflowStore.getState().consumeGenerateRequest(request.id);
    }

    expect(useCanvasWorkflowStore.getState().pendingGenerateRequest).toBeNull();
  });

  it('tracks pending results and continues refining from the accepted output', () => {
    useCanvasWorkflowStore.getState().openSession({
      imageUrl: '/View/source.png',
      launchSource: 'gallery',
      initialStep: 'mask',
    });

    useCanvasWorkflowStore.getState().markAwaitingResult(true, 3);
    useCanvasWorkflowStore.getState().setPendingResult({
      imageUrl: '/View/result.png',
      source: 'generate',
    });
    useCanvasWorkflowStore.getState().continueRefining();

    const state = useCanvasWorkflowStore.getState();
    expect(state.awaitingResult).toBe(false);
    expect(state.awaitingResultImageCount).toBe(0);
    expect(state.pendingResult).toBeNull();
    expect(state.workingImageUrl).toBe('/View/result.png');
    expect(state.currentStep).toBe('mask');
    expect(state.clearMaskVersion).toBe(1);
  });
});
