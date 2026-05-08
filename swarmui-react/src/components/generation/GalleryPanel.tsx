import { memo, useCallback, useMemo, useState } from 'react';
import {
  Box,
  Stack,
  Text,
  Group,
  Card,
  Divider,
  SimpleGrid,
  ScrollArea,
  Tooltip,
  Skeleton,
} from '@mantine/core';
import { motion, AnimatePresence } from 'framer-motion';
import {
  IconArrowsMaximize,
  IconLayoutGrid,
  IconLayoutGridAdd,
  IconPhotoPlus,
  IconTrash,
} from '@tabler/icons-react';
import { ImageLightbox } from '../ImageLightbox';
import { VirtualGrid } from '../VirtualGrid';
import { useDragReorder } from '../../hooks/useDragReorder';
import { useBatchThumbnails } from '../../hooks/useBatchThumbnails';
import { useMotionPerformancePolicy } from '../../hooks/useMotionPerformancePolicy';
import { galleryItemVariants, fastStaggerContainer } from '../../utils/animations';
import { SwarmActionIcon, SwarmActionIcon as ActionIcon, SwarmBadge } from '../ui';

const LARGE_SESSION_THRESHOLD = 32;

interface GalleryPanelProps {
  /** Array of generated image URLs from current session */
  generatedImages: string[];
  /** Currently selected image URL */
  previewImage: string | null;
  /** Whether generation is currently active */
  generating?: boolean;
  /** Callback when an image is selected for preview */
  onSelectImage: (image: string, index: number) => void;
  /** Callback when an image is deleted from session */
  onDeleteImage: (index: number) => void;
  /** Callback when images are reordered */
  onReorderImages?: (images: string[]) => void;
  /** Callback when an image is used as init image */
  onUseAsInitImage?: (imageUrl: string) => void;
  /** Rail density */
  density?: 'comfortable' | 'compact';
  /** Update rail density */
  onDensityChange?: (density: 'comfortable' | 'compact') => void;
}

/**
 * Right sidebar panel containing the session gallery.
 * Small sessions keep the animated grid, while large sessions switch to a
 * virtualized renderer and disable layout-heavy motion.
 */
export const GalleryPanel = memo(function GalleryPanel({
  generatedImages,
  previewImage,
  generating = false,
  onSelectImage,
  onDeleteImage,
  onReorderImages,
  onUseAsInitImage,
  density = 'comfortable',
  onDensityChange,
}: GalleryPanelProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const handleOpenLightbox = useCallback((index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  }, []);

  const imageDrag = useDragReorder({
    items: generatedImages,
    onReorder: (newOrder) => onReorderImages?.(newOrder),
  });

  const gridColumns = density === 'compact' ? 3 : 2;
  const shouldVirtualize = generatedImages.length > LARGE_SESSION_THRESHOLD;
  const motionPolicy = useMotionPerformancePolicy({
    isGenerating: generating,
    itemCount: generatedImages.length,
    largeListThreshold: LARGE_SESSION_THRESHOLD,
  });
  const enableAnimations = motionPolicy.enableItemMotion && !shouldVirtualize;
  const tileHeight = density === 'compact' ? 132 : 164;
  const thumbnailSize = density === 'compact' ? 168 : 224;
  const { thumbnails } = useBatchThumbnails(generatedImages, {
    maxSize: thumbnailSize,
    concurrency: shouldVirtualize ? 2 : 3,
  });

  const renderCard = useMemo(() => {
    return (image: string, index: number, animated: boolean) => {
      const dragProps = onReorderImages ? imageDrag.getDragHandlers(index) : {};
      const thumbnailState = thumbnails.get(image);
      const thumbnailUrl = thumbnailState?.thumbnailUrl ?? null;
      const thumbnailLoading = thumbnailState?.loading ?? false;
      const thumbnailError = thumbnailState?.error ?? false;
      const wrapperStyle = {
        cursor: 'pointer',
        borderRadius: 'var(--mantine-radius-sm)',
        overflow: 'hidden',
        ...imageDrag.getItemStyle(index),
      };

      const card = (
        <Card
          p={0}
          radius="sm"
          className="gallery-card swarm-gallery-panel-card"
          style={{
            border:
              previewImage === image
                ? '2px solid var(--theme-brand)'
                : '1px solid var(--theme-border-subtle)',
            overflow: 'hidden',
            position: 'relative',
          }}
          onClick={() => onSelectImage(image, index)}
          onDoubleClick={() => handleOpenLightbox(index)}
        >
          <ActionIcon
            tone="secondary"
            emphasis="ghost"
            size="xs"
            radius="xl"
            className="gallery-expand-btn"
            style={{
              position: 'absolute',
              top: 4,
              left: 4,
              zIndex: 10,
              opacity: 0,
              transition: 'opacity 0.1s ease',
            }}
            onClick={(e) => {
              e.stopPropagation();
              handleOpenLightbox(index);
            }}
          >
            <IconArrowsMaximize size={10} />
          </ActionIcon>
          {onUseAsInitImage && (
            <ActionIcon
              color="teal"
              variant="filled"
              size="xs"
              radius="xl"
              className="gallery-initimg-btn"
              style={{
                position: 'absolute',
                top: 4,
                left: 26,
                zIndex: 10,
                opacity: 0,
                transition: 'opacity 0.1s ease',
              }}
              onClick={(e) => {
                e.stopPropagation();
                onUseAsInitImage(image);
              }}
              title="Use as Init Image"
            >
              <IconPhotoPlus size={10} />
            </ActionIcon>
          )}
          <ActionIcon
            color="red"
            variant="filled"
            size="xs"
            radius="xl"
            className="gallery-delete-btn"
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
              zIndex: 10,
              opacity: 0,
              transition: 'opacity 0.1s ease',
            }}
            onClick={(e) => {
              e.stopPropagation();
              onDeleteImage(index);
            }}
          >
            <IconTrash size={10} />
          </ActionIcon>
          <Box
            style={{
              height: density === 'compact' ? 82 : 112,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--mantine-color-invokeGray-9)',
            }}
          >
            {thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt={`Generated ${index + 1}`}
                loading="lazy"
                decoding="async"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  display: 'block',
                }}
              />
            ) : thumbnailError ? (
              <img
                src={image}
                alt={`Generated ${index + 1}`}
                loading="lazy"
                decoding="async"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  display: 'block',
                }}
              />
            ) : (
              <Skeleton
                visible={thumbnailLoading || !thumbnailUrl}
                width="100%"
                height="100%"
                animate={!motionPolicy.shouldReduceMotion}
              />
            )}
          </Box>
          <Text size="xs" ta="center" p={4} c="invokeGray.2">
            #{index + 1}
          </Text>
        </Card>
      );

      if (!animated) {
        return (
          <div key={`${image}-${index}`} style={wrapperStyle} {...dragProps}>
            {card}
          </div>
        );
      }

      return (
        <motion.div
          key={`${image}-${index}`}
          variants={galleryItemVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          whileHover="hover"
          whileTap="tap"
          layout={motionPolicy.enableLayoutMotion}
          style={wrapperStyle}
          {...dragProps}
        >
          {card}
        </motion.div>
      );
    };
  }, [
    density,
    handleOpenLightbox,
    imageDrag,
    onDeleteImage,
    onReorderImages,
    onSelectImage,
    onUseAsInitImage,
    previewImage,
    thumbnails,
    motionPolicy.enableLayoutMotion,
    motionPolicy.shouldReduceMotion,
  ]);

  const smallGallery =
    generatedImages.length > 0 ? (
      enableAnimations ? (
        <motion.div variants={fastStaggerContainer} initial="initial" animate="animate">
          <SimpleGrid cols={gridColumns} spacing="xs">
            <AnimatePresence mode="popLayout">
              {generatedImages.map((image, index) => renderCard(image, index, true))}
            </AnimatePresence>
          </SimpleGrid>
        </motion.div>
      ) : (
        <SimpleGrid cols={gridColumns} spacing="xs">
          {generatedImages.map((image, index) => renderCard(image, index, false))}
        </SimpleGrid>
      )
    ) : null;

  return (
    <>
      <ImageLightbox
        opened={lightboxOpen}
        images={generatedImages}
        currentIndex={lightboxIndex}
        onClose={() => setLightboxOpen(false)}
        onNavigate={setLightboxIndex}
      />
      <Box
        className="generate-studio-gallery"
        style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      >
        <Stack gap="md" style={{ flex: 1, minHeight: 0 }}>
          <Group justify="space-between" className="generate-studio-gallery__header">
            <Stack gap={2}>
              <Text
                size="md"
                fw={600}
                c="invokeGray.0"
                tt="uppercase"
                style={{ letterSpacing: '0.5px' }}
              >
                Session Gallery
              </Text>
              <Text size="xs" c="invokeGray.3">
                Review, reuse, and trim outputs without leaving the stage.
              </Text>
            </Stack>
            <Group gap="xs" wrap="nowrap">
              <SwarmBadge tone="secondary" emphasis="soft">
                {generatedImages.length}
              </SwarmBadge>
              {onDensityChange && (
                <>
                  <Tooltip label="Comfortable density">
                    <SwarmActionIcon
                      tone={density === 'comfortable' ? 'primary' : 'secondary'}
                      emphasis="soft"
                      label="Comfortable density"
                      onClick={() => onDensityChange('comfortable')}
                    >
                      <IconLayoutGrid size={14} />
                    </SwarmActionIcon>
                  </Tooltip>
                  <Tooltip label="Compact density">
                    <SwarmActionIcon
                      tone={density === 'compact' ? 'primary' : 'secondary'}
                      emphasis="soft"
                      label="Compact density"
                      onClick={() => onDensityChange('compact')}
                    >
                      <IconLayoutGridAdd size={14} />
                    </SwarmActionIcon>
                  </Tooltip>
                </>
              )}
            </Group>
          </Group>
          <Divider />

          {generatedImages.length > 0 ? (
            shouldVirtualize ? (
              <Box style={{ flex: 1, minHeight: 0 }}>
                <VirtualGrid
                  items={generatedImages}
                  columns={gridColumns}
                  rowHeight={tileHeight}
                  containerHeight="100%"
                  gap={8}
                  overscan={2}
                  renderItem={(image, index) => renderCard(image, index, false)}
                />
              </Box>
            ) : (
              <Box style={{ flex: 1, minHeight: 0 }}>
                <ScrollArea h="100%" p="md">
                  {smallGallery}
                </ScrollArea>
              </Box>
            )
          ) : (
            <Box style={{ flex: 1, minHeight: 0 }}>
              <ScrollArea h="100%" p="md">
                <Stack align="center" gap="xs" py="xl">
                  <IconLayoutGrid size={32} color="var(--mantine-color-invokeGray-4)" />
                  <Text size="xs" c="invokeGray.3" ta="center">
                    Generated images from this session will appear here
                  </Text>
                </Stack>
              </ScrollArea>
            </Box>
          )}
        </Stack>
      </Box>
    </>
  );
});

GalleryPanel.displayName = 'GalleryPanel';
