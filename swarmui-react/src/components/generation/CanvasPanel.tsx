import { memo, useCallback } from 'react';
import {
  Box,
  Stack,
  Paper,
  Group,
  Text,
  Badge,
  Image,
  ScrollArea,
  Tooltip,
  Menu,
} from '@mantine/core';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  IconChevronLeft,
  IconChevronRight,
  IconBug,
  IconKeyboard,
  IconStar,
  IconStarFilled,
  IconBrush,
  IconShape,
  IconDotsVertical,
  IconPhoto,
  IconArrowsDiagonal,
} from '@tabler/icons-react';
import { DetailedProgressBar } from './DetailedProgressBar';
import { previewFadeVariants, livePreviewPulse } from '../../utils/animations';
import type { GenerateParams } from '../../api/types';
import { SwarmActionIcon, SwarmBadge, SwarmButton as Button } from '../ui';
import { useCanvasWorkflowStore, type CanvasWorkflowStep } from '../../stores/canvasWorkflowStore';
import type { GenerateWorkspaceMode } from '../../stores/navigationStore';

const CANVAS_FRAME_MIN_HEIGHT = 'calc(var(--app-content-height) - 220px)';
const CANVAS_IMAGE_MAX_HEIGHT = 'calc(var(--app-content-height) - 280px)';

interface CanvasPreviewImageProps {
  src: string;
  alt: string;
  live?: boolean;
}

const CanvasPreviewImage = memo(function CanvasPreviewImage({
  src,
  alt,
  live = false,
}: CanvasPreviewImageProps) {
  if (live) {
    return (
      <img
        src={src}
        alt={alt}
        loading="eager"
        decoding="async"
        fetchPriority="high"
        style={{
          width: '100%',
          height: '100%',
          maxHeight: CANVAS_IMAGE_MAX_HEIGHT,
          objectFit: 'contain',
          display: 'block',
        }}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      radius="sm"
      fit="contain"
      style={{
        maxHeight: CANVAS_IMAGE_MAX_HEIGHT,
        maxWidth: '100%',
        objectFit: 'contain',
      }}
    />
  );
});

interface CanvasViewportProps {
  disableCanvasMotion: boolean;
  displayImage: string | null;
  previewImage: string | null;
  isLivePreview: boolean;
  totalImages: number;
  workspaceMode?: GenerateWorkspaceMode;
  selectedModel?: string;
  selectedBackend?: string;
  generationParams?: Partial<GenerateParams>;
  uxRefresh?: boolean;
  onChooseModel?: () => void;
  onFocusPrompt?: () => void;
  onOpenGenerationSettings?: () => void;
}

const CanvasViewport = memo(function CanvasViewport({
  disableCanvasMotion,
  displayImage,
  previewImage,
  isLivePreview,
  totalImages,
  workspaceMode = 'advanced',
  selectedModel,
  selectedBackend,
  generationParams,
  uxRefresh = false,
  onChooseModel,
  onFocusPrompt,
  onOpenGenerationSettings,
}: CanvasViewportProps) {
  const modeLabel = workspaceMode.charAt(0).toUpperCase() + workspaceMode.slice(1);
  const width = generationParams?.width || 1024;
  const height = generationParams?.height || 1024;
  const steps = generationParams?.steps || 20;
  const cfgScale = generationParams?.cfgscale || 7;
  const promptReady = typeof generationParams?.prompt === 'string' && generationParams.prompt.trim().length > 0;

  const renderLivePreviewFrame = (animated: boolean) => {
    const frame = (
      <Paper
        p="md"
        className="generate-studio-canvas__frame"
        style={{
          minHeight: CANVAS_FRAME_MIN_HEIGHT,
          height: CANVAS_FRAME_MIN_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <Box
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            minHeight: 0,
          }}
        >
          <CanvasPreviewImage src={previewImage!} alt="Live Preview" live />
        </Box>
      </Paper>
    );

    if (!animated) {
      return frame;
    }

    return (
      <motion.div
        key="live-preview"
        variants={previewFadeVariants}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        <motion.div
          variants={livePreviewPulse}
          animate="animate"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
          }}
        >
          {frame}
        </motion.div>
      </motion.div>
    );
  };

  const renderSelectedImageFrame = (animated: boolean) => {
    const frame = (
      <Paper
        p="md"
        className="generate-studio-canvas__frame"
        style={{
          minHeight: CANVAS_FRAME_MIN_HEIGHT,
          height: CANVAS_FRAME_MIN_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <CanvasPreviewImage src={displayImage!} alt="Selected Image" />
      </Paper>
    );

    if (!animated) {
      return frame;
    }

    return (
      <motion.div
        key="selected-image"
        variants={previewFadeVariants}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        {frame}
      </motion.div>
    );
  };

  const renderEmptyState = (animated: boolean) => {
    const emptyTitle = totalImages > 0
      ? 'Canvas Stage'
      : uxRefresh
        ? 'Ready for first image'
        : `${modeLabel} workspace ready`;
    const emptyDescription = totalImages > 0
      ? 'Select a session image to inspect it here'
      : uxRefresh
        ? 'Choose a model and add a prompt to start the next run.'
        : 'Your next generation will appear here with live progress, preview updates, and review tools.';

    const emptyState = (
      <Box
        className="generate-studio-canvas__empty"
        style={{
          textAlign: 'center',
          minHeight: 'calc(var(--app-content-height) - 200px)',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Stack align="center" gap="md">
          <IconPhoto size={48} color="var(--mantine-color-invokeGray-4)" />
          <Text size="xl" c="invokeGray.2" fw={600}>
            {emptyTitle}
          </Text>
          <Text size="md" c="invokeGray.3">
            {emptyDescription}
          </Text>
          {selectedModel ? (
            <Badge color="gray" variant="light" className="generate-studio-canvas__empty-model">
              {selectedModel}
            </Badge>
          ) : uxRefresh ? null : (
            <Text size="sm" c="invokeGray.4">
              Select a base model in the left rail, then tune the run before generating.
            </Text>
          )}
          {uxRefresh && totalImages === 0 && (
            <Group gap="xs" justify="center" wrap="wrap" className="generate-studio-canvas__empty-actions">
              <Button
                size="sm"
                tone={selectedModel ? 'secondary' : 'primary'}
                emphasis={selectedModel ? 'soft' : 'solid'}
                onClick={onChooseModel}
                disabled={!onChooseModel}
              >
                {selectedModel ? 'Change Model' : 'Choose Model'}
              </Button>
              <Button
                size="sm"
                tone={promptReady ? 'secondary' : 'primary'}
                emphasis="soft"
                onClick={onFocusPrompt}
                disabled={!onFocusPrompt}
              >
                {promptReady ? 'Edit Prompt' : 'Write Prompt'}
              </Button>
              <Button
                size="sm"
                tone="secondary"
                emphasis="ghost"
                onClick={onOpenGenerationSettings}
                disabled={!onOpenGenerationSettings}
              >
                Open Settings
              </Button>
            </Group>
          )}
          <Box className="generate-studio-canvas__empty-dashboard">
            <Box className="generate-studio-canvas__empty-tile" data-ready="true">
              <Text size="xs" fw={700} c="var(--theme-text-secondary)">Mode</Text>
              <Text size="sm" fw={700}>{modeLabel}</Text>
            </Box>
            <Box className="generate-studio-canvas__empty-tile" data-ready={selectedModel ? 'true' : undefined}>
              <Text size="xs" fw={700} c="var(--theme-text-secondary)">Model</Text>
              <Text size="sm" fw={700} truncate>{selectedModel || 'Select model'}</Text>
            </Box>
            <Box className="generate-studio-canvas__empty-tile" data-ready="true">
              <Text size="xs" fw={700} c="var(--theme-text-secondary)">Canvas</Text>
              <Text size="sm" fw={700}>{width} x {height}</Text>
            </Box>
            <Box className="generate-studio-canvas__empty-tile" data-ready="true">
              <Text size="xs" fw={700} c="var(--theme-text-secondary)">Run</Text>
              <Text size="sm" fw={700}>{steps} steps · CFG {cfgScale}</Text>
            </Box>
            <Box className="generate-studio-canvas__empty-tile" data-ready={selectedBackend ? 'true' : undefined}>
              <Text size="xs" fw={700} c="var(--theme-text-secondary)">Backend</Text>
              <Text size="sm" fw={700} truncate>{selectedBackend || 'Auto backend'}</Text>
            </Box>
            <Box className="generate-studio-canvas__empty-tile" data-ready={promptReady ? 'true' : undefined}>
              <Text size="xs" fw={700} c="var(--theme-text-secondary)">Prompt</Text>
              <Text size="sm" fw={700}>{promptReady ? 'Ready' : 'Empty'}</Text>
            </Box>
          </Box>
          {uxRefresh && totalImages === 0 && !selectedModel && (
            <Text size="xs" c="var(--theme-text-secondary)" maw={420}>
              Model selection is the only required setup before the prompt and Generate controls can do useful work.
            </Text>
          )}
        </Stack>
      </Box>
    );

    if (!animated) {
      return emptyState;
    }

    return (
      <motion.div
        key="empty-state"
        variants={previewFadeVariants}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        {emptyState}
      </motion.div>
    );
  };

  return (
    <ScrollArea flex={1} p="lg">
      {disableCanvasMotion ? (
        <>
          {isLivePreview && previewImage && renderLivePreviewFrame(false)}
          {!isLivePreview && displayImage && renderSelectedImageFrame(false)}
          {!isLivePreview && !displayImage && renderEmptyState(false)}
        </>
      ) : (
        <AnimatePresence mode="wait">
          {isLivePreview && previewImage && renderLivePreviewFrame(true)}
          {!isLivePreview && displayImage && renderSelectedImageFrame(true)}
          {!isLivePreview && !displayImage && renderEmptyState(true)}
        </AnimatePresence>
      )}
    </ScrollArea>
  );
});

interface FavoriteImage {
  path: string;
  timestamp: number;
  prompt: string;
  model?: string;
}

interface ImageActionContext {
  prompt: string;
  model?: string;
  generationParams?: Partial<GenerateParams>;
}

interface CanvasPanelProps {
  /** Whether currently generating */
  generating: boolean;
  /** Generation progress (0-100) */
  progress: number;
  /** True after first backend progress update */
  hasProgressEvent?: boolean;
  /** Status text during generation */
  statusText: string;
  /** Number of steps for step counter */
  totalSteps?: number | null;
  /** Current step during generation */
  currentStep?: number | null;
  /** Current stage label during generation */
  stageLabel?: string | null;
  /** Current stage detail text during generation */
  stageDetail?: string | null;
  /** Current stage index during generation */
  stageIndex?: number | null;
  /** Total stage count during generation */
  stageCount?: number | null;
  /** Remaining stages after the active stage */
  stagesRemaining?: number | null;
  /** Current task index inside the active stage */
  stageTaskIndex?: number | null;
  /** Total task count inside the active stage */
  stageTaskCount?: number | null;
  /** Remaining tasks inside the active stage */
  stageTasksRemaining?: number | null;
  /** Start time for ETA calculation */
  startTime?: number | null;
  /** Preview image during generation */
  previewImage: string | null;
  /** Currently selected image URL to display full-size */
  selectedImage: string | null;
  /** Total number of images in gallery (for navigation display) */
  totalImages: number;
  /** Current image index (for navigation display) */
  currentImageIndex: number;
  /** Go to previous image */
  onPrevImage: () => void;
  /** Go to next image */
  onNextImage: () => void;
  /** Check if image is favorited */
  isFavorite: (image: string) => boolean;
  /** Add image to favorites */
  onAddFavorite: (image: FavoriteImage) => void;
  /** Remove image from favorites */
  onRemoveFavorite: (image: string) => void;
  /** Open shortcuts modal */
  onShowShortcuts: () => void;
  /** Open generation diagnostics modal */
  onShowDiagnostics?: () => void;
  /** Whether the most recent diagnostics entry contains an error */
  hasDiagnosticIssue?: boolean;
  /** Stable getter for prompt/model/params used by favorite and edit actions */
  getImageActionContext: () => ImageActionContext;
  /** Init image preview (for showing thumbnails or indicators, optional) */
  initImagePreview?: string | null;
  /** Show diagnostics/shortcut tools inside the internal toolbar */
  showWorkspaceTools?: boolean;
  /** Active workspace mode for empty-state context */
  workspaceMode?: GenerateWorkspaceMode;
  /** Selected base model for empty-state context */
  selectedModel?: string;
  /** Selected backend for empty-state context */
  selectedBackend?: string;
  /** Current generation params for empty-state context */
  generationParams?: Partial<GenerateParams>;
  /** Enables the refreshed Generate empty state presentation. */
  uxRefresh?: boolean;
  /** Opens model selection from the empty state. */
  onChooseModel?: () => void;
  /** Moves focus to the prompt field from the empty state. */
  onFocusPrompt?: () => void;
  /** Opens the primary generation settings from the empty state. */
  onOpenGenerationSettings?: () => void;
}

/**
 * Canvas panel component for displaying a single selected image full-size.
 * Shows live preview during generation, and displays selected image from gallery.
 * Memoized to prevent re-renders during parameter changes.
 */
export const CanvasPanel = memo(function CanvasPanel({
  generating,
  progress,
  hasProgressEvent,
  statusText,
  totalSteps,
  currentStep,
  stageLabel,
  stageIndex,
  stageCount,
  stagesRemaining,
  stageTaskIndex,
  stageTaskCount,
  stageTasksRemaining,
  startTime,
  previewImage,
  selectedImage,
  totalImages,
  currentImageIndex,
  onPrevImage,
  onNextImage,
  isFavorite,
  onAddFavorite,
  onRemoveFavorite,
  onShowShortcuts,
  onShowDiagnostics,
  hasDiagnosticIssue = false,
  getImageActionContext,
  showWorkspaceTools = true,
  workspaceMode = 'advanced',
  selectedModel,
  selectedBackend,
  generationParams,
  uxRefresh = false,
  onChooseModel,
  onFocusPrompt,
  onOpenGenerationSettings,
}: CanvasPanelProps) {
  const openSession = useCanvasWorkflowStore((state) => state.openSession);
  const prefersReducedMotion = useReducedMotion();

  const openEditor = useCallback(
    (image: string, initialStep: CanvasWorkflowStep) => {
      const context = getImageActionContext();
      const fallbackParams = context.generationParams
        ? { ...context.generationParams }
        : undefined;
      const img = new window.Image();
      img.onload = () => {
        openSession({
          imageUrl: image,
          width: img.width,
          height: img.height,
          launchSource: 'generate',
          fallbackParams,
          initialStep,
        });
      };
      img.src = image;
    },
    [getImageActionContext, openSession]
  );

  // Determine what to display: live preview during generation, or the selected image.
  const displayImage = previewImage || selectedImage;
  const isLivePreview = generating && !!previewImage;
  const disableCanvasMotion = generating || Boolean(prefersReducedMotion);

  return (
    <Box
      className="surface-floor generate-studio-canvas"
      style={{
        flex: '1 1 auto',
        minWidth: 0,
        width: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Toolbar - only show when there are images */}
      {(displayImage || totalImages > 0) && (
        <Box
          px="md"
          py="xs"
          className="generate-studio-canvas__toolbar"
          style={{ borderBottom: '1px solid var(--mantine-color-invokeGray-6)' }}
        >
          <Group justify="space-between">
            <Group gap="sm">
              {isLivePreview ? (
                <SwarmBadge tone="info" emphasis="solid" className="icon-pulse">
                  Generating...
                </SwarmBadge>
              ) : selectedImage ? (
                <SwarmBadge tone="success" emphasis="soft" className="status-complete">
                  {currentImageIndex + 1} / {totalImages}
                </SwarmBadge>
              ) : (
                <Text size="sm" c="invokeGray.3">
                  No image selected
                </Text>
              )}
            </Group>
            <Group gap="xs">
              {/* Navigation */}
              <SwarmActionIcon
                size="sm"
                tone="secondary"
                emphasis="soft"
                label="Previous image"
                onClick={onPrevImage}
                disabled={totalImages <= 1}
              >
                <IconChevronLeft size={16} />
              </SwarmActionIcon>
              <SwarmActionIcon
                size="sm"
                tone="secondary"
                emphasis="soft"
                label="Next image"
                onClick={onNextImage}
                disabled={totalImages <= 1}
              >
                <IconChevronRight size={16} />
              </SwarmActionIcon>

              {/* Favorite toggle */}
              {selectedImage && !isLivePreview && (
                <SwarmActionIcon
                  size="sm"
                  tone={isFavorite(selectedImage) ? 'warning' : 'secondary'}
                  emphasis="ghost"
                  label={
                    isFavorite(selectedImage)
                      ? 'Remove image from favorites'
                      : 'Add image to favorites'
                  }
                  onClick={() => {
                    const context = getImageActionContext();
                    if (isFavorite(selectedImage)) {
                      onRemoveFavorite(selectedImage);
                    } else {
                      onAddFavorite({
                        path: selectedImage,
                        timestamp: Date.now(),
                        prompt: context.prompt,
                        model: context.model,
                      });
                    }
                  }}
                >
                  {isFavorite(selectedImage) ? (
                    <IconStarFilled size={16} />
                  ) : (
                    <IconStar size={16} />
                  )}
                </SwarmActionIcon>
              )}

              {/* Edit menu */}
              {selectedImage && !isLivePreview && (
                <Menu shadow="md" width={160} position="bottom-end">
                  <Menu.Target>
                    <SwarmActionIcon
                      size="sm"
                      tone="secondary"
                      emphasis="ghost"
                      label="Open image edit menu"
                    >
                      <IconDotsVertical size={14} />
                    </SwarmActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Label>Edit Image</Menu.Label>
                    <Menu.Item
                      leftSection={<IconBrush size={14} />}
                      onClick={() => openEditor(selectedImage, 'mask')}
                    >
                      Inpaint
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<IconShape size={14} />}
                      onClick={() => openEditor(selectedImage, 'regions')}
                    >
                      Regional Prompts
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<IconArrowsDiagonal size={14} />}
                      onClick={() => openEditor(selectedImage, 'source')}
                    >
                      Outpaint
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Item onClick={() => window.open(selectedImage, '_blank')}>
                      Open in New Tab
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              )}

              {/* Edit button */}
              {selectedImage && !isLivePreview && (
                <Button
                  size="xs"
                  tone="primary"
                  emphasis="soft"
                  leftSection={<IconBrush size={12} />}
                  onClick={() => openEditor(selectedImage, 'mask')}
                >
                  Edit
                </Button>
              )}

              {/* Keyboard shortcuts */}
              {showWorkspaceTools && (
                <>
                  <Tooltip label="Keyboard Shortcuts (? to show)">
                    <SwarmActionIcon
                      size="sm"
                      tone="secondary"
                      emphasis="ghost"
                      label="Show keyboard shortcuts"
                      onClick={onShowShortcuts}
                    >
                      <IconKeyboard size={16} />
                    </SwarmActionIcon>
                  </Tooltip>
                  <Tooltip label="Generation diagnostics">
                    <SwarmActionIcon
                      size="sm"
                      tone={hasDiagnosticIssue ? 'danger' : 'secondary'}
                      emphasis={hasDiagnosticIssue ? 'soft' : 'ghost'}
                      label="Show generation diagnostics"
                      onClick={onShowDiagnostics}
                    >
                      <IconBug size={16} />
                    </SwarmActionIcon>
                  </Tooltip>
                </>
              )}
            </Group>
          </Group>
        </Box>
      )}

      <CanvasViewport
        disableCanvasMotion={disableCanvasMotion}
        displayImage={displayImage}
        previewImage={previewImage}
        isLivePreview={isLivePreview}
        totalImages={totalImages}
        workspaceMode={workspaceMode}
        selectedModel={selectedModel}
        selectedBackend={selectedBackend}
        generationParams={generationParams}
        uxRefresh={uxRefresh}
        onChooseModel={onChooseModel}
        onFocusPrompt={onFocusPrompt}
        onOpenGenerationSettings={onOpenGenerationSettings}
      />

      {/* Progress Bar at Bottom of Canvas */}
      {generating && (
        <Box
          p="sm"
          style={{
            borderTop: '1px solid color-mix(in srgb, var(--theme-brand) 45%, var(--theme-gray-5))',
          }}
        >
          <DetailedProgressBar
            progress={progress}
            hasProgressEvent={hasProgressEvent}
            currentStep={currentStep ?? undefined}
            totalSteps={totalSteps ?? undefined}
            stageLabel={stageLabel}
            stageIndex={stageIndex}
            stageCount={stageCount}
            stagesRemaining={stagesRemaining}
            stageTaskIndex={stageTaskIndex}
            stageTaskCount={stageTaskCount}
            stageTasksRemaining={stageTasksRemaining}
            previewImage={previewImage}
            statusText={statusText}
            startTime={startTime ?? undefined}
            isGenerating={generating}
          />
        </Box>
      )}
    </Box>
  );
});
