import { memo, useId, useMemo, useState } from 'react';
import { Box, Group, Text, Select, Stack } from '@mantine/core';
import { IconCheck, IconEdit, IconTrash } from '@tabler/icons-react';
import { SwarmActionIcon, SwarmBadge } from '../ui';
import { usePresetLibraryStore } from '../../stores/presetLibraryStore';
import type { LibraryPreset } from '../../features/presetLibrary/types';

interface PresetCardProps {
  preset: LibraryPreset;
  isStaged: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

function getHarmoniousGradient(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue1 = Math.abs(hash) % 360;
  const hue2 = (hue1 + 35) % 360;
  return {
    background: `linear-gradient(135deg, hsl(${hue1}, 75%, 50%), hsl(${hue2}, 75%, 40%))`,
    color: '#ffffff',
    textShadow: '0 1px 2px rgba(0, 0, 0, 0.25)',
    fontWeight: 700,
  };
}

const EMPTY_VARIABLES: Record<string, string> = {};

export const PresetCard = memo(function PresetCard({
  preset,
  isStaged,
  onEdit,
  onDelete,
}: PresetCardProps) {
  const titleId = useId();
  const descriptionId = useId();

  const stagedVarId = usePresetLibraryStore((state) => state.stagedVariations[preset.id]);
  const stagePreset = usePresetLibraryStore((state) => state.stagePreset);
  const unstagePreset = usePresetLibraryStore((state) => state.unstagePreset);
  const stagedVariables = usePresetLibraryStore((state) => state.stagedVariables[preset.id] ?? EMPTY_VARIABLES);
  const setStagedVariable = usePresetLibraryStore((state) => state.setStagedVariable);

  const [localVarId, setLocalVarId] = useState<string>('__base');
  const activeVarId = isStaged ? (stagedVarId || '__base') : localVarId;

  const selectedVariation = preset.variations?.find((v) => v.id === activeVarId);
  const activePresetRepresentation = useMemo(() => {
    if (!selectedVariation) return preset;
    return {
      ...preset,
      name: `${preset.name} (${selectedVariation.name})`,
      words: selectedVariation.words,
      thumbnail: selectedVariation.thumbnail || preset.thumbnail,
    };
  }, [preset, selectedVariation]);

  const selectData = useMemo(() => {
    if (!preset.variations) return [];
    return [
      { value: '__base', label: 'Default style' },
      ...preset.variations.map((v) => ({ value: v.id, label: v.name })),
    ];
  }, [preset.variations]);

  const handleToggleClick = () => {
    if (isStaged) {
      unstagePreset(preset.id);
    } else {
      stagePreset(activePresetRepresentation, activeVarId);
    }
  };

  const handleVariationChange = (nextVarId: string | null) => {
    const targetVarId = nextVarId || '__base';
    if (!isStaged) {
      setLocalVarId(targetVarId);
    } else {
      const nextVariation = preset.variations?.find((v) => v.id === targetVarId);
      const nextRepresentation = nextVariation
        ? {
            ...preset,
            name: `${preset.name} (${nextVariation.name})`,
            words: nextVariation.words,
            thumbnail: nextVariation.thumbnail || preset.thumbnail,
          }
        : preset;

      unstagePreset(preset.id);
      stagePreset(nextRepresentation, targetVarId);
    }
  };

  return (
    <Box className="preset-card" data-staged={isStaged}>
      <button
        type="button"
        className="preset-card__toggle"
        aria-pressed={isStaged}
        aria-labelledby={titleId}
        aria-describedby={preset.description ? descriptionId : undefined}
        onClick={handleToggleClick}
      />

      <Box className="preset-card__content">
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
          <Group gap="xs" wrap="nowrap" className="preset-card__copy">
            <Box
              className="preset-card__thumbnail"
              aria-hidden="true"
              style={getHarmoniousGradient(activePresetRepresentation.name)}
            >
              {activePresetRepresentation.thumbnail || activePresetRepresentation.name.charAt(0).toUpperCase()}
            </Box>
            <Text id={titleId} fw={600} size="sm" lineClamp={2}>
              {activePresetRepresentation.name}
            </Text>
          </Group>
          <SwarmBadge tone="secondary" emphasis="ghost">
            {activePresetRepresentation.words.length} {activePresetRepresentation.words.length === 1 ? 'word' : 'words'}
          </SwarmBadge>
        </Group>

        {preset.description ? (
          <Text id={descriptionId} size="xs" c="dimmed" lineClamp={1}>
            {preset.description}
          </Text>
        ) : (
          <Box className="preset-card__description-spacer" />
        )}

        {preset.variations && preset.variations.length > 0 && (
          <Box className="preset-card__variation-wrapper" onClick={(e) => e.stopPropagation()}>
            <Select
              size="xs"
              variant="unstyled"
              value={activeVarId}
              onChange={handleVariationChange}
              data={selectData}
              className="preset-card__variation-select"
              allowDeselect={false}
            />
          </Box>
        )}

        {(() => {
          const templateVariables = activePresetRepresentation.templateVariables ?? preset.templateVariables;
          if (!templateVariables || Object.keys(templateVariables).length === 0) return null;

          return (
            <Stack gap={4} mt={6} onClick={(e) => e.stopPropagation()} style={{ zIndex: 10, position: 'relative' }}>
              {Object.entries(templateVariables).map(([varName, options]) => {
                if (!options || options.length === 0) return null;
                const value = stagedVariables[varName] ?? options[0];
                const selectData = options.map((opt) => ({ value: opt, label: opt }));
                return (
                  <Select
                    key={varName}
                    size="xs"
                    label={varName.charAt(0).toUpperCase() + varName.slice(1)}
                    value={value}
                    onChange={(nextVal) => {
                      if (nextVal) {
                        if (!isStaged) {
                          stagePreset(activePresetRepresentation, activeVarId);
                        }
                        setStagedVariable(preset.id, varName, nextVal);
                      }
                    }}
                    data={selectData}
                    styles={{
                      label: { fontSize: '10px', color: 'var(--text-dimmed)', marginBottom: 2, display: 'block', textAlign: 'left' },
                      input: {
                        height: 24,
                        minHeight: 24,
                        fontSize: '11px',
                        padding: '0 8px',
                        borderRadius: 4,
                        backgroundColor: 'var(--elevation-raised)',
                        border: '1px solid var(--border-light)',
                        color: 'var(--text-main)',
                      }
                    }}
                    allowDeselect={false}
                  />
                );
              })}
            </Stack>
          );
        })()}

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
