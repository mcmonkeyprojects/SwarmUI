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
import { motion, AnimatePresence } from 'framer-motion';
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
import { SwarmActionIcon, SwarmButton as Button } from '../ui';
import { useCanvasWorkflowStore, type CanvasWorkflowStep } from '../../stores/canvasWorkflowStore';

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
}: CanvasPanelProps) {
  const openSession = useCanvasWorkflowStore((state) => state.openSession);

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
                <Badge color="blue" variant="filled" className="icon-pulse">
                  Generating...
                </Badge>
              ) : selectedImage ? (
                <Badge color="green" variant="light" className="status-complete">
                  {currentImageIndex + 1} / {totalImages}
                </Badge>
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

      {/* Main canvas area */}
      <ScrollArea flex={1} p="lg">
        <AnimatePresence mode="wait">
          {/* Live preview during generation */}
          {isLivePreview && (
            <motion.div
              key="live-preview"
              variants={previewFadeVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <Paper
                p="md"
                className="generate-studio-canvas__frame"
                style={{
                  minHeight: 'calc(var(--app-content-height) - 220px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
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
                  <Image
                    src={previewImage}
                    alt="Live Preview"
                    radius="sm"
                    fit="contain"
                    style={{
                      maxHeight: 'calc(var(--app-content-height) - 280px)',
                      objectFit: 'contain',
                    }}
                  />
                </motion.div>
              </Paper>
            </motion.div>
          )}

          {/* Selected image full-size display (or lingering preview after generation ends) */}
          {!isLivePreview && displayImage && (
            <motion.div
              key="selected-image"
              variants={previewFadeVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <Paper
                p="md"
                className="generate-studio-canvas__frame"
                style={{
                  minHeight: 'calc(var(--app-content-height) - 220px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Image
                  src={displayImage}
                  alt="Selected Image"
                  radius="sm"
                  fit="contain"
                  style={{
                    maxHeight: 'calc(var(--app-content-height) - 280px)',
                    maxWidth: '100%',
                    objectFit: 'contain',
                  }}
                />
              </Paper>
            </motion.div>
          )}

          {/* Empty State */}
          {!isLivePreview && !displayImage && (
            <motion.div
              key="empty-state"
              variants={previewFadeVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
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
                    Canvas Stage
                  </Text>
                  <Text size="md" c="invokeGray.3">
                    {totalImages > 0
                      ? 'Select a session image to inspect it here'
                      : 'Your next generation will appear here with live progress and preview updates'}
                  </Text>
                  <Text size="sm" c="invokeGray.4">
                    Keep controls supportive, keep the stage central, and open edit tools only when
                    you need them
                  </Text>
                </Stack>
              </Box>
            </motion.div>
          )}
        </AnimatePresence>
      </ScrollArea>

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
