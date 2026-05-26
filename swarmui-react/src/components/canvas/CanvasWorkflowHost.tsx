import { useCallback, useEffect, useMemo, useRef } from 'react';
import { notifications } from '@mantine/notifications';
import { swarmClient } from '../../api/client';
import { queryClient, queryKeys } from '../../api/queryClient';
import { CanvasEditor } from './CanvasEditor';
import { ImageUpscaler } from '../ImageUpscaler';
import { useCanvasWorkflowStore } from '../../stores/canvasWorkflowStore';
import { useGenerationStore } from '../../store/generationStore';
import { useNavigationStore } from '../../stores/navigationStore';
import type { GenerateParams } from '../../api/types';
import type { CanvasApplyPayload } from '../../features/promptBuilder';
import { buildCanvasApplyPatch, buildCanvasPrompt } from '../../features/canvasWorkflow/compat';
import { parseHistoryMetadata } from '../../features/history/historyUtils';
import { useInvokeAIStore } from '../../features/invokeai/useInvokeAIStore';
import type { InvokeAIGenerationMode, InvokeAIRunResult } from '../../features/invokeai/types';
import { useModelLoading } from '../../hooks/useModelLoading';
import { useModels } from '../../hooks/useModels';
import { imageUrlToDataUrl } from '../../utils/imageData';

function hasSelectedModel(params: Partial<GenerateParams> | null): boolean {
  return typeof params?.model === 'string' && params.model.trim().length > 0;
}

function getNumericParam(value: unknown, fallback: number): number {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : fallback;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return null;
}

function extractCanvasModelFromMetadata(metadata: string | Record<string, unknown> | null): string | null {
  const metadataObject = parseHistoryMetadata(metadata);
  if (!metadataObject) {
    return null;
  }

  const params = asRecord(metadataObject.sui_image_params)
    || asRecord(metadataObject.swarm)
    || metadataObject;

  return firstNonEmptyString(
    params.model,
    params.Model,
    params.model_name,
    metadataObject.model,
    metadataObject.Model,
    metadataObject.model_name
  );
}

function resolveInvokeMode(payload: CanvasApplyPayload): InvokeAIGenerationMode {
  if (!payload.maskDataUrl) {
    return 'img2img';
  }
  return payload.hasOutpaintCanvas ? 'outpaint' : 'inpaint';
}

export function CanvasWorkflowHost() {
  const navigateToGenerate = useNavigationStore((state) => state.navigateToGenerate);
  const generationParams = useGenerationStore((state) => state.params);
  const invokeConnectionState = useInvokeAIStore((state) => state.connectionState);
  const invokeRunning = useInvokeAIStore((state) => state.isRunning);
  const runInvokeGeneration = useInvokeAIStore((state) => state.runGeneration);
  const {
    isOpen,
    sessionId,
    currentStep,
    sourceImageWidth,
    sourceImageHeight,
    sourceImageMetadata,
    workingImageUrl,
    workingImageMetadata,
    fallbackParams,
    pendingResult,
    clearMaskVersion,
    upscalerOpen,
    closeSession,
    setStep,
    setFallbackParams,
    recordApplyPayload,
    openUpscaler,
    closeUpscaler,
    queueGenerateRequest,
    setPendingResult,
    usePendingResult: applyPendingResult,
    continueRefining,
  } = useCanvasWorkflowStore();
  const modelsQuery = useModels('Stable-Diffusion', { enabled: isOpen });
  const {
    isLoading: modelLoading,
    progress: modelLoadProgress,
    loadingCount: modelLoadingCount,
    isProgressEstimated: modelLoadProgressEstimated,
    error: modelLoadError,
    loadModel,
  } = useModelLoading();
  const detectedSourceModel = useMemo(() => extractCanvasModelFromMetadata(sourceImageMetadata), [sourceImageMetadata]);
  const selectedCanvasModel = useMemo(() => {
    const candidate = fallbackParams?.model ?? generationParams.model;
    return typeof candidate === 'string' ? candidate : '';
  }, [fallbackParams?.model, generationParams.model]);
  const autoLoadedModelRef = useRef<string | null>(null);

  const applyCanvasModel = useCallback((modelName: string, source: 'metadata' | 'manual') => {
    const trimmedModelName = modelName.trim();
    if (!trimmedModelName) {
      return;
    }

    const generationStore = useGenerationStore.getState();
    generationStore.setParams({ model: trimmedModelName });
    generationStore.setSelectedModel(trimmedModelName);
    setFallbackParams({ model: trimmedModelName });
    loadModel(trimmedModelName);

    notifications.show({
      title: source === 'metadata' ? 'Canvas Model Loaded' : 'Canvas Model Selected',
      message: source === 'metadata'
        ? `Loaded the model from image metadata: ${trimmedModelName}.`
        : `Loading ${trimmedModelName} for this canvas edit.`,
      color: source === 'metadata' ? 'green' : 'blue',
    });
  }, [loadModel, setFallbackParams]);

  useEffect(() => {
    if (!isOpen || !sessionId || !detectedSourceModel) {
      return;
    }

    const autoLoadKey = `${sessionId}:${detectedSourceModel}`;
    if (autoLoadedModelRef.current === autoLoadKey) {
      return;
    }

    autoLoadedModelRef.current = autoLoadKey;
    applyCanvasModel(detectedSourceModel, 'metadata');
  }, [applyCanvasModel, detectedSourceModel, isOpen, sessionId]);

  const handleCanvasModelSelect = useCallback((modelName: string | null) => {
    if (!modelName) {
      const generationStore = useGenerationStore.getState();
      generationStore.setParams({ model: '' });
      generationStore.setSelectedModel('');
      setFallbackParams({ model: '' });
      return;
    }
    applyCanvasModel(modelName, 'manual');
  }, [applyCanvasModel, setFallbackParams]);

  const decoratePayload = useCallback((payload: CanvasApplyPayload): CanvasApplyPayload => ({
    ...payload,
    sessionId: sessionId ?? undefined,
    workflowStep: currentStep,
  }), [currentStep, sessionId]);

  const syncCanvasToGenerate = useCallback(async (payload: CanvasApplyPayload) => {
    const nextPayload = decoratePayload(payload);
    const resolvedPayload = nextPayload.initImageDataUrl
      ? nextPayload
      : {
        ...nextPayload,
        initImageDataUrl: await imageUrlToDataUrl(nextPayload.sourceImageUrl),
      };
    const generationStore = useGenerationStore.getState();
    const baseParams: GenerateParams = {
      ...generationStore.params,
      ...(fallbackParams ?? {}),
    };
    const nextPrompt = buildCanvasPrompt(baseParams.prompt || '', resolvedPayload);
    const patch = buildCanvasApplyPatch(resolvedPayload);
    const nextParams: GenerateParams = {
      ...baseParams,
      ...patch,
      prompt: nextPrompt,
    };

    generationStore.setParams(nextParams);
    if (patch.initimage) {
      generationStore.setEnableInitImage(true);
    }

    setFallbackParams(nextParams);
    recordApplyPayload(resolvedPayload);

    const updatedPrompt = nextPrompt !== (baseParams.prompt || '');
    const updatedMask = Boolean(patch.maskimage);

    if (updatedPrompt && updatedMask) {
      notifications.show({
        title: 'Canvas Synced',
        message: 'Prompt builder rules and inpaint mask were sent back to Generate.',
        color: 'green',
      });
    } else if (updatedPrompt) {
      notifications.show({
        title: 'Prompt Builder Updated',
        message: 'Your regional and segment rules were synced back to Generate.',
        color: 'blue',
      });
    } else if (updatedMask) {
      notifications.show({
        title: 'Mask Ready',
        message: 'The current image and mask are ready for inpainting on Generate.',
        color: 'green',
      });
    } else {
      notifications.show({
        title: 'Canvas Synced',
        message: 'The current canvas workspace was synced back to Generate.',
        color: 'blue',
      });
    }

    return { nextPayload: resolvedPayload, nextParams };
  }, [decoratePayload, fallbackParams, recordApplyPayload, setFallbackParams]);

  const handleApplyToGenerate = useCallback(async (payload: CanvasApplyPayload) => {
    try {
      await syncCanvasToGenerate(payload);
      closeSession();
      navigateToGenerate();
    } catch (error) {
      notifications.show({
        title: 'Canvas Sync Failed',
        message: error instanceof Error ? error.message : 'Failed to prepare the init image for Generate.',
        color: 'red',
      });
    }
  }, [closeSession, navigateToGenerate, syncCanvasToGenerate]);

  const handleGenerateFromCanvas = useCallback(async (payload: CanvasApplyPayload) => {
    try {
      const { nextPayload, nextParams } = await syncCanvasToGenerate(payload);

      if (!hasSelectedModel(nextParams)) {
        notifications.show({
          title: 'Model Required',
          message: 'Select a model on Generate before running the canvas generation step.',
          color: 'yellow',
        });
        return;
      }

      queueGenerateRequest(nextPayload, nextParams);
      navigateToGenerate();
      setStep('generate');

      notifications.show({
        title: 'Canvas Generation Queued',
        message: 'The edit details are filled in and the generation is starting.',
        color: 'teal',
      });
    } catch (error) {
      notifications.show({
        title: 'Canvas Generation Failed',
        message: error instanceof Error ? error.message : 'Failed to prepare the init image for Generate.',
        color: 'red',
      });
    }
  }, [navigateToGenerate, queueGenerateRequest, setStep, syncCanvasToGenerate]);

  const saveInvokeResultToHistory = useCallback(async (
    result: InvokeAIRunResult,
    nextParams: GenerateParams,
    mode: InvokeAIGenerationMode
  ): Promise<string> => {
    const invokeState = useInvokeAIStore.getState();
    const selectedModel = invokeState.models.find((model) => model.key === invokeState.selectedModelKey);
    const historyResult = await swarmClient.addImageToHistory(result.imageDataUrl, {
      prompt: nextParams.prompt || '',
      negativeprompt: nextParams.negativeprompt || '',
      model: selectedModel ? `InvokeAI:${selectedModel.name}` : 'InvokeAI',
      width: nextParams.width,
      height: nextParams.height,
      seed: nextParams.seed,
      steps: nextParams.steps,
      cfgscale: nextParams.cfgscale,
      sampler: nextParams.sampler,
      scheduler: nextParams.scheduler,
      initimagecreativity: nextParams.initimagecreativity,
      maskblur: nextParams.maskblur,
      invokeai: true,
      invokeai_mode: mode,
      invokeai_image_name: result.imageName,
    });
    await queryClient.invalidateQueries({ queryKey: queryKeys.images.all });
    const savedImage = historyResult.images?.[0]?.image ?? result.imageDataUrl;
    useGenerationStore.getState().addSessionImage(savedImage);
    return savedImage;
  }, []);

  const handleGenerateWithInvoke = useCallback(async (payload: CanvasApplyPayload) => {
    try {
      if (invokeConnectionState !== 'connected') {
        notifications.show({
          title: 'InvokeAI Not Connected',
          message: 'Configure and check InvokeAI on Server > Backends before using canvas InvokeAI generation.',
          color: 'yellow',
        });
        return;
      }

      const { nextPayload, nextParams } = await syncCanvasToGenerate(payload);
      const mode = resolveInvokeMode(nextPayload);
      const result = await runInvokeGeneration({
        mode,
        prompt: String(nextParams.prompt || ''),
        negativePrompt: String(nextParams.negativeprompt || ''),
        width: getNumericParam(nextParams.width, nextPayload.sourceImageWidth),
        height: getNumericParam(nextParams.height, nextPayload.sourceImageHeight),
        seed: getNumericParam(nextParams.seed, -1),
        steps: getNumericParam(nextParams.steps, 20),
        cfgScale: getNumericParam(nextParams.cfgscale, 7),
        scheduler: String(nextParams.scheduler || nextParams.sampler || 'euler'),
        clipSkip: getNumericParam(nextParams.clipstopatlayer, 0),
        denoiseStrength: getNumericParam(nextParams.initimagecreativity, 0.75),
        initImageDataUrl: nextPayload.initImageDataUrl || await imageUrlToDataUrl(nextPayload.sourceImageUrl),
        maskImageDataUrl: nextPayload.maskDataUrl,
        maskBlur: getNumericParam(nextParams.maskblur, nextPayload.hasOutpaintCanvas ? 0 : 16),
      });
      const savedImage = await saveInvokeResultToHistory(result, nextParams, mode);
      setPendingResult({
        imageUrl: savedImage,
        metadata: {
          invokeai: true,
          invokeai_mode: mode,
          invokeai_image_name: result.imageName,
        },
        source: 'invoke',
      });
      setStep('generate');
      notifications.show({
        title: 'InvokeAI Edit Ready',
        message: 'The InvokeAI result was saved to the gallery and is ready for canvas refinement.',
        color: 'green',
      });
    } catch (error) {
      notifications.show({
        title: 'InvokeAI Canvas Generation Failed',
        message: error instanceof Error ? error.message : 'InvokeAI failed to process the canvas image.',
        color: 'red',
      });
    }
  }, [
    invokeConnectionState,
    runInvokeGeneration,
    saveInvokeResultToHistory,
    setPendingResult,
    setStep,
    syncCanvasToGenerate,
  ]);

  if (!isOpen || !workingImageUrl) {
    return null;
  }

  return (
    <>
      <CanvasEditor
        imageUrl={workingImageUrl}
        width={sourceImageWidth ?? undefined}
        height={sourceImageHeight ?? undefined}
        mode="workflow"
        workflowStep={currentStep}
        pendingResult={pendingResult}
        clearMaskVersion={clearMaskVersion}
        sam2BaseParams={{
          ...generationParams,
          ...(fallbackParams ?? {}),
        }}
        onClose={closeSession}
        onApply={(payload) => recordApplyPayload(decoratePayload(payload))}
        onWorkflowStepChange={setStep}
        onApplyToGenerate={handleApplyToGenerate}
        onGenerateFromCanvas={handleGenerateFromCanvas}
        onGenerateWithInvoke={handleGenerateWithInvoke}
        invokeGenerationBusy={invokeRunning}
        invokeGenerationAvailable={invokeConnectionState === 'connected'}
        models={modelsQuery.data}
        loadingModels={modelsQuery.isLoading}
        selectedModel={selectedCanvasModel}
        detectedModel={detectedSourceModel}
        loadingModel={modelLoading}
        modelLoadProgress={modelLoadProgress}
        modelLoadingCount={modelLoadingCount}
        modelLoadProgressEstimated={modelLoadProgressEstimated}
        modelLoadError={modelLoadError}
        onModelSelect={handleCanvasModelSelect}
        onOpenUpscaler={openUpscaler}
        onUsePendingResult={() => applyPendingResult('source')}
        onContinueRefining={continueRefining}
      />
      <ImageUpscaler
        opened={upscalerOpen}
        onClose={closeUpscaler}
        imagePath={workingImageUrl}
        imageMetadata={workingImageMetadata}
        fallbackParams={fallbackParams}
        onUpscaleComplete={(upscaledPath) => {
          setPendingResult({
            imageUrl: upscaledPath,
            metadata: null,
            source: 'upscale',
          });
          setStep('generate');
          closeUpscaler();
        }}
      />
    </>
  );
}

export default CanvasWorkflowHost;
