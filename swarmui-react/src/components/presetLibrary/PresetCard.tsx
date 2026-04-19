import { memo, useId } from 'react';
import { Box, Group, Text } from '@mantine/core';
import { IconCheck, IconEdit, IconTrash } from '@tabler/icons-react';
import { SwarmActionIcon, SwarmBadge } from '../ui';
import type { LibraryPreset } from '../../features/presetLibrary/types';

interface PresetCardProps {
  preset: LibraryPreset;
  isStaged: boolean;
  onToggle: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export const PresetCard = memo(function PresetCard({
  preset,
  isStaged,
  onToggle,
  onEdit,
  onDelete,
}: PresetCardProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <Box className="preset-card" data-staged={isStaged}>
      <button
        type="button"
        className="preset-card__toggle"
        aria-pressed={isStaged}
        aria-labelledby={titleId}
        aria-describedby={preset.description ? descriptionId : undefined}
        onClick={onToggle}
      />

      <Box className="preset-card__content">
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
          <Group gap="xs" wrap="nowrap" className="preset-card__copy">
            <Box className="preset-card__thumbnail" aria-hidden="true">
              {preset.thumbnail || '·'}
            </Box>
            <Text id={titleId} fw={600} size="sm" lineClamp={2}>
              {preset.name}
            </Text>
          </Group>
          <SwarmBadge tone="secondary" emphasis="ghost">
            {preset.words.length} {preset.words.length === 1 ? 'word' : 'words'}
          </SwarmBadge>
        </Group>

        {preset.description ? (
          <Text id={descriptionId} size="xs" c="dimmed" lineClamp={1}>
            {preset.description}
          </Text>
        ) : (
          <Box className="preset-card__description-spacer" />
        )}

        {!preset.isDefault && (
          <Group className="preset-card__actions" justify="flex-end" gap="xs">
            <SwarmActionIcon
              tone="secondary"
              emphasis="ghost"
              size="sm"
              label={`Edit ${preset.name}`}
              onClick={onEdit}
            >
              <IconEdit size={14} />
            </SwarmActionIcon>
            <SwarmActionIcon
              tone="danger"
              emphasis="ghost"
              size="sm"
              label={`Delete ${preset.name}`}
              onClick={onDelete}
            >
              <IconTrash size={14} />
            </SwarmActionIcon>
          </Group>
        )}
      </Box>

      {isStaged && (
        <Box className="preset-card__staged-indicator" aria-hidden="true">
          <IconCheck size={12} />
        </Box>
      )}
    </Box>
  );
});
