import { useEffect, useMemo, useState } from 'react';
import { useMediaQuery } from '@mantine/hooks';
import {
  Modal,
  Stack,
  Group,
  Text,
  Select,
  Image,
  Card,
  Progress,
  Badge,
  NumberInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Z_INDEX } from '../utils/zIndex';
import { logger } from '../utils/logger';
import type { GenerateParams } from '../api/types';
import { imageUrlToDataUrl, toRuntimeImageUrl } from '../utils/imageData';
import { useQueueStore, type QueueJob } from '../stores/queue';
import { SwarmButton, SwarmSegmentedControl, SwarmSlider } from './ui';
import { useUpscalers } from '../hooks/useModels';
import { swarmClient } from '../api/client';
import { queryClient, queryKeys } from '../api/queryClient';

interface ImageUpscalerProps {
  opened: boolean;
  onClose: () => void;
  imagePath: string;
  /** Optional metadata from the image - used to extract original model */
  imageMetadata?: string | Record<string, unknown> | null;
  /** Compatibility-safe fallback params when image metadata is unavailable */
  fallbackParams?: Partial<GenerateParams> | null;
  onUpscaleComplete?: (upscaledPath: string) => void;
}

type UpscaleMethod = 'hires-fix' | 'model-based';

const DEFAULT_UPSCALE_METHOD = 'pixel-lanczos';

const isModelUpscaleMethod = (value: string): boolean => {
  return value.startsWith('model-') || value.startsWith('latentmodel-');
};

function buildUpscaleResultUrl(imageData: unknown): string {
  if (typeof imageData === 'string') {
    return imageData;
  }

  if (!imageData || typeof imageData !== 'object' || !('image' in imageData)) {
    console.warn('[Upscaler] Unexpected image data format:', imageData);
    return '';
  }

  const rawImagePath = String((imageData as { image?: string }).image || '');
  if (!rawImagePath) {
    return '';
  }

  if (rawImagePath.startsWith('View/') || rawImagePath.startsWith('/View/')) {
    return rawImagePath.startsWith('/') ? rawImagePath : `/${rawImagePath}`;
  }

  return `/View/${rawImagePath.replace(/^\/+/, '')}`;
}

export function ImageUpscaler({
  opened,
  onClose,
  imagePath,
  imageMetadata,
  fallbackParams = null,
  onUpscaleComplete,
}: ImageUpscalerProps) {
  const addQueueJob = useQueueStore((state) => state.addJob);
  const updateQueueJob = useQueueStore((state) => state.updateJob);

  // Responsive: go fullscreen on small windows
  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  const [upscaling, setUpscaling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [upscaleMethod, setUpscaleMethod] = useState<UpscaleMethod>('hires-fix');
  const [upscaleModel, setUpscaleModel] = useState(DEFAULT_UPSCALE_METHOD);
  const [scaleFactor, setScaleFactor] = useState(2);
  const [creativity, setCreativity] = useState(0.4); // For hi-res fix
  const [modelCreativity, setModelCreativity] = useState(0.1); // For model-based
  const [steps, setSteps] = useState(20);
  const [cfgScale, setCfgScale] = useState(7);
  const [upscaledImage, setUpscaledImage] = useState<string | null>(null);
  const [refreshingUpscalers, setRefreshingUpscalers] = useState(false);
  const upscalersQuery = useUpscalers({ enabled: opened });

  const upscaleModels = useMemo(() => {
    return (upscalersQuery.data ?? [])
      .map((model) => ({
        value: model.name,
        label: model.title || model.name,
      }))
      .filter((model) => model.value.trim().length > 0);
  }, [upscalersQuery.data]);

  const modelUpscaleOptions = useMemo(() => {
    return upscaleModels.filter((model) => isModelUpscaleMethod(model.value));
  }, [upscaleModels]);

  useEffect(() => {
    if (upscaling) {
      return;
    }

    if (upscaleMethod === 'model-based') {
      if (!isModelUpscaleMethod(upscaleModel)) {
        setUpscaleModel(modelUpscaleOptions[0]?.value || '');
      }
      return;
    }

    if (!upscaleModel) {
      setUpscaleModel(DEFAULT_UPSCALE_METHOD);
    }
  }, [modelUpscaleOptions, upscaleMethod, upscaleModel, upscaling]);

  // Extract generation params from metadata
  const getParamsFromMetadata = (): {
    model: string | null;
    width: number | null;
    height: number | null;
    prompt: string;
    negativeprompt: string;
    seed: number | null;
  } => {
    const defaultResult = {
      model: null,
      width: null,
      height: null,
      prompt: '',
      negativeprompt: '',
      seed: null,
    };

    try {
      if (!imageMetadata) {
        logger.debug('[Upscaler] No metadata provided, falling back to current params');
        if (!fallbackParams) {
          return defaultResult;
        }
        return {
          model: typeof fallbackParams.model === 'string' ? fallbackParams.model : null,
          width: typeof fallbackParams.width === 'number' ? fallbackParams.width : null,
          height: typeof fallbackParams.height === 'number' ? fallbackParams.height : null,
          prompt: typeof fallbackParams.prompt === 'string' ? fallbackParams.prompt : '',
          negativeprompt: typeof fallbackParams.negativeprompt === 'string' ? fallbackParams.negativeprompt : '',
          seed: typeof fallbackParams.seed === 'number' ? fallbackParams.seed : null,
        };
      }

      const meta = typeof imageMetadata === 'string'
        ? JSON.parse(imageMetadata)
        : imageMetadata;

      logger.debug('[Upscaler] Raw metadata:', meta);

      // SwarmUI stores params in different structures depending on version/source
      const swarmParams = meta.sui_image_params || meta.swarm || {};

      const normalizeModelValue = (value: unknown): string | null => {
        if (typeof value === 'string') {
          const trimmed = value.trim();
          return trimmed.length > 0 ? trimmed : null;
        }
        if (value && typeof value === 'object') {
          const obj = value as Record<string, unknown>;
          const candidates = [
            obj.name,
            obj.model,
            obj.model_name,
            obj.id,
            obj.value,
            obj.title,
          ];
          for (const candidate of candidates) {
            if (typeof candidate === 'string') {
              const trimmed = candidate.trim();
              if (trimmed.length > 0) {
                return trimmed;
              }
            }
          }
        }
        return null;
      };

      // Extract all needed fields
      const model = normalizeModelValue(swarmParams.model || meta.model || meta.Model || meta.swarm_model || null);
      const width = swarmParams.width || meta.width || null;
      const height = swarmParams.height || meta.height || null;
      const prompt = swarmParams.prompt || meta.prompt || '';
      const negativeprompt = swarmParams.negativeprompt || meta.negativeprompt || meta.negative_prompt || '';
      const seed = swarmParams.seed || meta.seed || null;

      logger.debug('[Upscaler] Extracted params:', { model, width, height, promptLen: prompt.length, seed });

      return { model, width, height, prompt, negativeprompt, seed };
    } catch (e) {
      console.error('[Upscaler] Failed to parse metadata:', e, imageMetadata);
      return defaultResult;
    }
  };

  const handleUpscale = async () => {
    // Get all params from metadata
    const params = getParamsFromMetadata();

    if (!params.model) {
      notifications.show({
        title: 'No Model Found',
        message: 'Could not detect the original model from image metadata. Please try "Reuse Parameters" first.',
        color: 'orange',
      });
      return;
    }

    // For hi-res fix, we need original dimensions
    if (upscaleMethod === 'hires-fix' && (!params.width || !params.height)) {
      notifications.show({
        title: 'Dimensions Not Found',
        message: 'Could not detect original image dimensions from metadata. Try Model-Based upscale instead.',
        color: 'orange',
      });
      return;
    }

    if (upscaleMethod === 'model-based' && !isModelUpscaleMethod(upscaleModel)) {
      notifications.show({
        title: 'No Upscale Model Selected',
        message: 'Model-based upscale requires a model from upscale_models or latent_upscale_models.',
        color: 'orange',
      });
      return;
    }

    logger.debug('[Upscaler] Using method:', upscaleMethod);
    logger.debug('[Upscaler] Using model:', params.model);
    if (upscaleMethod === 'hires-fix') {
      logger.debug('[Upscaler] Original dimensions:', params.width, 'x', params.height);
      logger.debug('[Upscaler] Target dimensions:', (params.width || 0) * scaleFactor, 'x', (params.height || 0) * scaleFactor);
    }

    setUpscaling(true);
    setProgress(0);
    setUpscaledImage(null);

    // Timeout to prevent infinite waiting
    const TIMEOUT_MS = 300000; // 5 minutes max for upscaling (larger images take longer)
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let queueJobId: string | null = null;
    let queueFinalized = false;
    let latestImageUrl = '';
    const selectedUpscaleModelLabel = upscaleModels.find((model) => model.value === upscaleModel)?.label || upscaleModel;

    const queueJobName = upscaleMethod === 'hires-fix'
      ? `Upscale ${scaleFactor}x - Hi-Res Fix`
      : `Upscale ${scaleFactor}x - ${selectedUpscaleModelLabel}`;
    const queueTags = ['upscale', upscaleMethod, `${scaleFactor}x`];

    const syncQueueJob = (updates: Partial<QueueJob>) => {
      if (!queueJobId) {
        return;
      }

      updateQueueJob(queueJobId, updates);
    };

    const finalizeQueueJob = (status: 'completed' | 'failed', updates: Partial<QueueJob> = {}) => {
      if (!queueJobId || queueFinalized) {
        return;
      }

      queueFinalized = true;
      syncQueueJob({
        status,
        completedAt: Date.now(),
        ...(status === 'completed' ? { progress: 100 } : {}),
        ...updates,
      });
    };

    try {
      // Convert image to base64 - SwarmUI requires base64 for initimage
      const fullImageUrl = toRuntimeImageUrl(imagePath);

      logger.debug('[Upscaler] Full image URL (proxy):', fullImageUrl);

      setProgress(5);
      const imageBase64 = await imageUrlToDataUrl(fullImageUrl);
      setProgress(15);

      // Build params based on upscale method
      const upscaleParams: GenerateParams = upscaleMethod === 'hires-fix'
        ? {
          prompt: params.prompt || '',
          negativeprompt: params.negativeprompt || '',
          model: params.model,
          initimage: imageBase64,
          initimagecreativity: creativity,
          aspectratio: 'Custom',
          width: params.width || 1024,
          height: params.height || 1024,
          refinermethod: 'PostApply',
          refinercontrol: 0,
          refinercontrolpercentage: 0,
          refinerupscale: scaleFactor,
          refinerupscalemethod: upscaleModel || DEFAULT_UPSCALE_METHOD,
          steps: steps,
          cfgscale: cfgScale,
          images: 1,
          seed: params.seed || -1,
        }
        : {
          prompt: params.prompt || '',
          negativeprompt: params.negativeprompt || '',
          model: params.model,
          initimage: imageBase64,
          initimagecreativity: modelCreativity,
          refinermethod: 'PostApply',
          refinercontrol: 0,
          refinercontrolpercentage: 0,
          refinerupscale: scaleFactor,
          refinerupscalemethod: upscaleModel,
          steps: steps,
          cfgscale: cfgScale,
          images: 1,
        };

      queueJobId = addQueueJob(upscaleParams, {
        name: queueJobName,
        tags: queueTags,
      });
      syncQueueJob({
        status: 'generating',
        startedAt: Date.now(),
        progress: 15,
        completedAt: undefined,
        error: undefined,
        images: [],
      });

      notifications.show({
        title: 'Upscale Started',
        message: 'This upscale is now tracked in Queue, so you can safely navigate away.',
        color: 'blue',
      });

      const methodLabel = upscaleMethod === 'hires-fix' ? 'Hi-Res Fix' : selectedUpscaleModelLabel;
      const initImageValue = typeof upscaleParams.initimage === 'string' ? upscaleParams.initimage : '';
      logger.debug('[Upscaler] Starting upscale with params (base64 truncated):', {
        ...upscaleParams,
        initimage: `${initImageValue.substring(0, 50)}... (${initImageValue.length} chars)`,
      });

      // Track progress
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          const nextProgress = prev >= 85 ? 85 : prev + 2;
          syncQueueJob({
            progress: nextProgress,
            status: 'generating',
          });

          if (prev >= 85) {
            clearInterval(progressInterval);
          }

          return nextProgress;
        });
      }, 1000);

      // Use the generate API with callbacks and timeout
      let receivedImage = false;
      let serverError: string | null = null;

      await Promise.race([
        new Promise<void>((resolve, reject) => {
          swarmClient.generateImage(upscaleParams, {
            onProgress: (progressData) => {
              logger.debug('[Upscaler] Progress:', progressData);
              const nextProgress = Math.min(90, Math.round(progressData.overall_percent * 100));
              setProgress(nextProgress);
              syncQueueJob({
                progress: nextProgress,
                status: 'generating',
              });
            },
            onImage: (imageData) => {
              logger.debug('[Upscaler] Received image data:', imageData);
              receivedImage = true;
              clearInterval(progressInterval);
              if (timeoutId) clearTimeout(timeoutId);
              setProgress(100);
              latestImageUrl = buildUpscaleResultUrl(imageData);

              logger.debug('[Upscaler] Setting upscaled image URL:', latestImageUrl);
              setUpscaledImage(latestImageUrl);
              syncQueueJob({
                progress: 100,
                images: latestImageUrl ? [latestImageUrl] : [],
              });

              notifications.show({
                title: 'Upscale Complete',
                message: `Image upscaled ${scaleFactor}x using ${methodLabel}`,
                color: 'green',
              });

              onUpscaleComplete?.(latestImageUrl);
              resolve();
            },
            onDataError: (errorMessage, errorId) => {
              console.error('[Upscaler] Server error:', errorMessage, errorId);
              serverError = errorMessage;
              clearInterval(progressInterval);
              if (timeoutId) clearTimeout(timeoutId);
              finalizeQueueJob('failed', { error: errorMessage || 'Upscale failed' });
              reject(new Error(`Server error: ${errorMessage}`));
            },
            onError: () => {
              console.error('[Upscaler] Connection error');
              clearInterval(progressInterval);
              if (timeoutId) clearTimeout(timeoutId);
              finalizeQueueJob('failed', { error: 'Upscale connection failed' });
              reject(new Error('Upscale connection failed'));
            },
            onComplete: () => {
              logger.debug('[Upscaler] WebSocket closed. Image received:', receivedImage);
              clearInterval(progressInterval);
              if (!receivedImage && !serverError) {
                // WS closed without image or error - this is unusual
                finalizeQueueJob('failed', {
                  error: 'Upscale completed but no image was returned. Check SwarmUI logs.',
                });
                reject(new Error('Upscale completed but no image was returned. Check SwarmUI logs.'));
                return;
              }

              finalizeQueueJob('completed', {
                images: latestImageUrl ? [latestImageUrl] : [],
              });
            },
          });
        }),
        new Promise<void>((_, reject) => {
          timeoutId = setTimeout(() => {
            clearInterval(progressInterval);
            finalizeQueueJob('failed', { error: 'Upscale timed out after 5 minutes' });
            reject(new Error('Upscale timed out after 5 minutes'));
          }, TIMEOUT_MS);
        }),
      ]);
    } catch (error) {
      console.error('Upscale error:', error);
      finalizeQueueJob('failed', {
        error: error instanceof Error ? error.message : 'Unknown error occurred during upscaling',
      });
      notifications.show({
        title: 'Upscale Failed',
        message: error instanceof Error ? error.message : 'Unknown error occurred during upscaling',
        color: 'red',
      });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      setUpscaling(false);
    }
  };

  // Reset state when closing
  const handleClose = () => {
    setUpscaledImage(null);
    setProgress(0);
    setUpscaling(false);
    onClose();
  };

  // Build proper proxy URL for the original image
  const getProxyUrl = (path: string): string => {
    return toRuntimeImageUrl(path);
  };

  const originalImageUrl = getProxyUrl(imagePath);

  const handleRefreshUpscalers = async () => {
    setRefreshingUpscalers(true);
    try {
      await swarmClient.triggerModelRefresh();
      await queryClient.invalidateQueries({ queryKey: queryKeys.upscalers.all });
      await upscalersQuery.refetch();
      notifications.show({
        title: 'Upscalers Refreshed',
        message: 'Checked the backend model list for upscale_models and latent_upscale_models.',
        color: 'green',
      });
    } catch (error) {
      notifications.show({
        title: 'Refresh Failed',
        message: error instanceof Error ? error.message : 'Could not refresh upscaler models.',
        color: 'red',
      });
    } finally {
      setRefreshingUpscalers(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Upscale Image"
      size={isSmallScreen ? '100%' : 'calc(100vw - 40px)'}
      fullScreen={isSmallScreen}
      zIndex={Z_INDEX.modalNested}
      withinPortal={true}
      portalProps={{ target: 'body' }}
      centered={!isSmallScreen}
      styles={{
        content: {
          maxWidth: 'min(700px, calc(100vw - 40px))',
          maxHeight: 'min(calc(100dvh - 40px), calc(100vh - 40px))',
        },
      }}
    >
      <Stack gap="md">
        {/* Original Image */}
        <Card withBorder>
          <Stack gap="xs">
            <Text size="sm" fw={600}>Original Image</Text>
            <Image
              src={originalImageUrl}
              alt="Original"
              fit="contain"
              h={300}
            />
          </Stack>
        </Card>

        {/* Upscale Method Selection */}
        <Stack gap="xs">
          <Text size="sm" fw={500}>Upscale Method</Text>
          <SwarmSegmentedControl
            value={upscaleMethod}
            onChange={(value) => setUpscaleMethod(value as UpscaleMethod)}
            data={[
              { label: 'Hi-Res Fix (Recommended)', value: 'hires-fix' },
              { label: 'Model-Based', value: 'model-based' },
            ]}
            disabled={upscaling}
            fullWidth
          />
          <Text size="xs" c="dimmed">
            {upscaleMethod === 'hires-fix'
              ? 'Regenerate at higher resolution using original prompt. Best quality.'
              : 'Use upscale model to enhance resolution. Faster but may lose some detail.'}
          </Text>
        </Stack>

        {/* Upscale Model - always show for model-based, optional for hi-res fix */}
        <Stack gap="xs">
          <Select
            label={upscaleMethod === 'hires-fix' ? 'Upscaler Method' : 'Upscale Model'}
            description={upscaleMethod === 'hires-fix'
              ? 'Choose the backend resize/model method used by hi-res fix'
              : 'Select a model from upscale_models or latent_upscale_models'}
            data={upscaleMethod === 'model-based' ? modelUpscaleOptions : upscaleModels}
            value={upscaleModel}
            onChange={(value) => {
              if (upscaleMethod === 'hires-fix') {
                setUpscaleModel(value || DEFAULT_UPSCALE_METHOD);
                return;
              }
              if (value) {
                setUpscaleModel(value);
              }
            }}
            disabled={upscaling || upscalersQuery.isLoading || (upscaleMethod === 'model-based' && modelUpscaleOptions.length === 0)}
            clearable={upscaleMethod === 'hires-fix'}
            searchable
            placeholder={upscalersQuery.isLoading ? 'Loading upscalers...' : 'Select upscale method'}
            nothingFoundMessage={
              upscaleMethod === 'model-based'
                ? 'No model upscalers found. Refresh after adding files to upscale_models or latent_upscale_models.'
                : 'No upscale methods found'
            }
          />
          <Group justify="space-between" align="center">
            <Text size="xs" c="dimmed">
              Added files under Models/upscale_models appear here after backend model refresh.
            </Text>
            <SwarmButton
              size="xs"
              emphasis="soft"
              tone="secondary"
              onClick={handleRefreshUpscalers}
              loading={refreshingUpscalers}
              disabled={upscaling || upscalersQuery.isLoading}
            >
              Refresh Upscalers
            </SwarmButton>
          </Group>
        </Stack>

        {upscaleMethod === 'model-based' && modelUpscaleOptions.length === 0 && !upscalersQuery.isLoading && (
          <Text size="xs" c="orange">
            No model upscalers are currently available. Download one into upscale_models or latent_upscale_models, then refresh model data.
          </Text>
        )}

        {/* Creativity slider - for hi-res fix */}
        {upscaleMethod === 'hires-fix' && (
          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="sm" fw={500}>Creativity</Text>
              <Text size="sm" c="dimmed">{creativity.toFixed(2)}</Text>
            </Group>
            <SwarmSlider
              value={creativity}
              onChange={setCreativity}
              min={0.1}
              max={0.7}
              step={0.05}
              disabled={upscaling}
              mb="xl"
              marks={[
                { value: 0.1, label: 'Preserve' },
                { value: 0.4, label: 'Balanced' },
                { value: 0.7, label: 'Creative' },
              ]}
            />
            <Text size="xs" c="dimmed">
              Lower = more faithful to original, Higher = more enhancement
            </Text>
          </Stack>
        )}

        {/* Model-based creativity */}
        {upscaleMethod === 'model-based' && (
          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="sm" fw={500}>Creativity</Text>
              <Text size="sm" c="dimmed">{modelCreativity.toFixed(2)}</Text>
            </Group>
            <SwarmSlider
              value={modelCreativity}
              onChange={setModelCreativity}
              min={0}
              max={0.5}
              step={0.05}
              disabled={upscaling}
              mb="xl"
              marks={[
                { value: 0, label: 'None' },
                { value: 0.1, label: 'Low' },
                { value: 0.3, label: 'Med' },
              ]}
            />
          </Stack>
        )}

        <Group grow align="flex-start">
          <NumberInput
            label="CFG Scale"
            description="How strongly to follow the prompt"
            min={1}
            max={20}
            step={0.5}
            value={cfgScale}
            onChange={(value) => typeof value === 'number' && setCfgScale(value)}
            disabled={upscaling}
          />
          <NumberInput
            label="Steps"
            description="More steps = higher quality, slower"
            min={10}
            max={50}
            step={5}
            value={steps}
            onChange={(value) => typeof value === 'number' && setSteps(value)}
            disabled={upscaling}
          />
        </Group>

        <NumberInput
          label="Scale Factor"
          min={1.5}
          max={4}
          step={0.5}
          value={scaleFactor}
          onChange={(value) => typeof value === 'number' && setScaleFactor(value)}
          disabled={upscaling}
        />

        {upscaling && (
          <Stack gap="xs">
            <Progress value={progress} size="lg" animated />
            <Text size="sm" ta="center" c="dimmed">
              Upscaling... {progress}%
            </Text>
            <Text size="xs" ta="center" c="dimmed">
              This run is also tracked in Queue, so you can leave this page and keep monitoring it there.
            </Text>
          </Stack>
        )}

        {/* Upscaled Result */}
        {upscaledImage && !upscaling && (
          <Card withBorder>
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="sm" fw={600}>Upscaled Image</Text>
                <Badge color="green">Complete</Badge>
              </Group>
              <Image
                src={upscaledImage}
                alt="Upscaled"
                fit="contain"
                h={300}
              />
              <Text size="xs" c="dimmed">
                Resolution increased by {scaleFactor}x using {upscaleMethod === 'hires-fix' ? 'Hi-Res Fix' : upscaleModel}
              </Text>
            </Stack>
          </Card>
        )}

        {/* Actions */}
        <Group justify="flex-end">
          <SwarmButton emphasis="ghost" tone="secondary" onClick={handleClose} disabled={upscaling}>
            {upscaledImage ? 'Close' : 'Cancel'}
          </SwarmButton>
          {!upscaledImage && (
            <SwarmButton emphasis="solid" onClick={handleUpscale} loading={upscaling}>
              Upscale Image
            </SwarmButton>
          )}
          {upscaledImage && (
            <>
              <SwarmButton
                emphasis="soft"
                tone="secondary"
                onClick={() => {
                  setUpscaledImage(null);
                  setProgress(0);
                }}
              >
                Upscale Again
              </SwarmButton>
              <SwarmButton
                emphasis="solid"
                onClick={() => window.open(upscaledImage, '_blank')}
              >
                Open Full Size
              </SwarmButton>
            </>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
