import { memo } from 'react';
import { Paper, Group, Stack, Select, Badge, Box } from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';
import type { GenerateParams } from '../../../../api/types';
import { SliderWithInput } from '../../../../components/SliderWithInput';
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

  // Calculate preview dimensions
  const maxSize = 70;
  const previewWidth = width >= height ? maxSize : Math.round((width / height) * maxSize);
  const previewHeight = height >= width ? maxSize : Math.round((height / width) * maxSize);

  return (
    <Paper
      className={`surface-paper generate-studio__dimension-card${embedded ? ' generate-studio__dimension-card--embedded' : ''}`}
      p={embedded ? 0 : 'xs'}
      radius="sm"
    >
      <Group align="flex-start" gap="sm" wrap="nowrap">
        {/* Left: Aspect Ratio and Controls */}
        <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
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

          {/* Width/Height Sliders */}
          <SliderWithInput
            label="Width"
            value={width}
            onChange={(value) => form.setFieldValue('width', value)}
            min={64}
            max={2048}
            step={64}
          />
          <SliderWithInput
            label="Height"
            value={height}
            onChange={(value) => form.setFieldValue('height', value)}
            min={64}
            max={2048}
            step={64}
          />
        </Stack>

        {/* Right: Visual Aspect Ratio Preview */}
        <Box
          className="generate-studio__dimension-preview-frame"
          style={{
            width: 68,
            height: 68,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Box
            className="generate-studio__dimension-preview"
            style={{
              width: previewWidth,
              height: previewHeight,
              border: '2px solid var(--mantine-color-invokeBrand-6)',
              borderRadius: 4,
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gridTemplateRows: 'repeat(3, 1fr)',
              overflow: 'hidden',
              background:
                'linear-gradient(135deg, var(--mantine-color-invokeGray-8) 0%, var(--mantine-color-invokeGray-7) 100%)',
              boxShadow:
                '0 0 12px rgba(var(--mantine-color-invokeBrand-6-rgb, 124, 58, 237), 0.2), inset 0 1px 2px rgba(255,255,255,0.05)',
            }}
          >
            {/* Grid lines inside */}
            {[...Array(9)].map((_, i) => (
              <Box
                key={i}
                style={{
                  borderRight: i % 3 !== 2 ? '1px solid var(--mantine-color-invokeGray-4)' : 'none',
                  borderBottom: i < 6 ? '1px solid var(--mantine-color-invokeGray-4)' : 'none',
                  backgroundColor: 'transparent',
                }}
              />
            ))}
          </Box>
        </Box>
      </Group>
    </Paper>
  );
});
