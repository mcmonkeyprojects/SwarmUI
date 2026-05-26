import { memo } from 'react';
import { Paper, Group, Stack, Select, Badge, Box, Text } from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';
import type { GenerateParams } from '../../../../api/types';
import { SliderWithInput } from '../../../../components/SliderWithInput';
import { ControlTray } from '../../../../components/ui';
import {
  ASPECT_RATIO_PRESETS,
  detectAspectRatio,
  getDimensionsForRatio,
  calculateRatioString,
} from '../../../../data/samplerData';

export interface DimensionControlsProps {
  /** Form instance */
  form: UseFormReturnType<GenerateParams>;
  /** Render without the outer paper card when nested in another section */
  embedded?: boolean;
}

/**
 * Dimension controls section with aspect ratio selector, width/height sliders,
 * and visual aspect ratio preview.
 */
export const DimensionControls = memo(function DimensionControls({
  form,
  embedded = false,
}: DimensionControlsProps) {
  const width = form.values.width || 1024;
  const height = form.values.height || 1024;

  // Calculate preview dimensions — prominent visual indicator
  const maxSize = 96;
  const previewWidth = width >= height ? maxSize : Math.round((width / height) * maxSize);
  const previewHeight = height >= width ? maxSize : Math.round((height / width) * maxSize);

  return (
    <Paper
      className={`surface-paper generate-studio__dimension-card${embedded ? ' generate-studio__dimension-card--embedded' : ''}`}
      p={embedded ? 0 : 'xs'}
      radius="sm"
    >
      <Stack gap="xs">
        {/* Aspect Ratio Selector */}
        <Group
          gap="xs"
          align="flex-end"
          wrap="nowrap"
          className="generate-studio__dimension-header"
        >
          <Select
            label="Aspect"
            data={ASPECT_RATIO_PRESETS.map((p) => ({
              value: p.value,
              label: p.label,
            }))}
            value={detectAspectRatio(width, height)}
            onChange={(value) => {
              if (!value || value === 'custom') return;
              const dims = getDimensionsForRatio(value);
              if (dims) {
                form.setFieldValue('width', dims[0]);
                form.setFieldValue('height', dims[1]);
              }
            }}
            size="xs"
            style={{ width: 92 }}
          />
          {/* Dimension Display */}
          <Badge
            size="md"
            variant="light"
            color="invokeGray"
            style={{ fontFamily: 'monospace' }}
            className="generate-studio__dimension-badge"
          >
            {width}x{height}
          </Badge>
          {/* Ratio Badge */}
          <Badge
            size="md"
            variant="light"
            color="invokeBrand"
            className="generate-studio__dimension-badge"
          >
            {calculateRatioString(width, height)}
          </Badge>
        </Group>

        {/* Visual Aspect Ratio Preview — prominent centered row */}
        <Box className="generate-studio__dimension-preview-frame">
          <Box
            className="generate-studio__dimension-preview"
            style={{
              width: previewWidth,
              height: previewHeight,
            }}
          >
            {[...Array(9)].map((_, i) => {
              let classes = 'generate-studio__dimension-preview-grid-cell';
              if (i % 3 !== 2) {
                classes += ' cell-border-right';
              }
              if (i < 6) {
                classes += ' cell-border-bottom';
              }
              return (
                <Box
                  key={i}
                  className={classes}
                />
              );
            })}
          </Box>
          <Text className="generate-studio__dimension-preview-label">
            {width} × {height}
          </Text>
        </Box>

        {/* Width/Height Sliders - full width */}
        <ControlTray
          title="Canvas Size"
          subtitle="Manual dimensions stay paired with the aspect preview."
          status={calculateRatioString(width, height)}
          tone="info"
        >
          <SliderWithInput
            label="Width"
            value={width}
            onChange={(value) => form.setFieldValue('width', value)}
            min={64}
            max={2048}
            step={64}
            unit="px"
            tone="info"
          />
          <SliderWithInput
            label="Height"
            value={height}
            onChange={(value) => form.setFieldValue('height', value)}
            min={64}
            max={2048}
            step={64}
            unit="px"
            tone="info"
          />
        </ControlTray>
      </Stack>
    </Paper>
  );
});
