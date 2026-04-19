import { memo, useMemo } from 'react';
import { Box, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import { SkeletonCard } from '../SkeletonCard';
import { SwarmButton } from '../ui';
import { PRESET_CATEGORY_LABELS } from '../../features/presetLibrary/types';
import { PresetCard } from './PresetCard';
import type { LibraryPreset, PresetCategory } from '../../features/presetLibrary/types';

interface PresetLibraryGridProps {
  presets: LibraryPreset[];
  activeCategory: PresetCategory;
  showExplicit: boolean;
  searchQuery: string;
  isLoading: boolean;
  stagedPresetIds: string[];
  onTogglePreset: (preset: LibraryPreset) => void;
  onClearSearch: () => void;
  onCreatePreset: () => void;
  onEditPreset: (preset: LibraryPreset) => void;
  onDeletePreset: (preset: LibraryPreset) => void;
}

function getGridColumns(width: number): number {
  if (width >= 1300) {
    return 5;
  }
  if (width >= 1000) {
    return 4;
  }
  if (width >= 700) {
    return 3;
  }
  return 2;
}

export const PresetLibraryGrid = memo(function PresetLibraryGrid({
  presets,
  activeCategory,
  showExplicit,
  searchQuery,
  isLoading,
  stagedPresetIds,
  onTogglePreset,
  onClearSearch,
  onCreatePreset,
  onEditPreset,
  onDeletePreset,
}: PresetLibraryGridProps) {
  const { ref, width } = useElementSize();
  const stagedPresetIdSet = useMemo(() => new Set(stagedPresetIds), [stagedPresetIds]);
  const filteredPresets = useMemo(() => {
    if (!showExplicit && activeCategory === 'explicit') {
      return [];
    }

    const activePresets = presets.filter((preset) => preset.category === activeCategory);
    const normalizedQuery = searchQuery.toLowerCase().trim();

    if (!normalizedQuery) {
      return activePresets;
    }

    return activePresets.filter((preset) => {
      return (
        preset.name.toLowerCase().includes(normalizedQuery) ||
        preset.description?.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [activeCategory, presets, searchQuery, showExplicit]);
  const columns = getGridColumns(width || 1000);
  const activeCategoryLabel = PRESET_CATEGORY_LABELS[activeCategory];

  return (
    <Box ref={ref} className="preset-library__grid-frame">
      {isLoading ? (
        <SimpleGrid cols={columns} spacing="sm">
          {Array.from({ length: Math.max(columns * 2, 6) }).map((_, index) => (
            <SkeletonCard key={index} showImage={false} textLines={3} height={144} radius={12} />
          ))}
        </SimpleGrid>
      ) : filteredPresets.length > 0 ? (
        <SimpleGrid cols={columns} spacing="sm">
          {filteredPresets.map((preset) => (
            <PresetCard
              key={preset.id}
              preset={preset}
              isStaged={stagedPresetIdSet.has(preset.id)}
              onToggle={() => onTogglePreset(preset)}
              onEdit={preset.isDefault ? undefined : () => onEditPreset(preset)}
              onDelete={preset.isDefault ? undefined : () => onDeletePreset(preset)}
            />
          ))}
        </SimpleGrid>
      ) : searchQuery.trim() ? (
        <Stack align="center" justify="center" className="preset-library__empty-state" gap="sm">
          <Text size="sm" c="dimmed" ta="center">
            No presets match "{searchQuery.trim()}"
          </Text>
          <SwarmButton tone="secondary" emphasis="ghost" size="compact-sm" onClick={onClearSearch}>
            Clear search
          </SwarmButton>
        </Stack>
      ) : (
        <Stack align="center" justify="center" className="preset-library__empty-state" gap="sm">
          <Text size="sm" c="dimmed" ta="center">
            No presets in {activeCategoryLabel} yet
          </Text>
          <Group gap="xs">
            <SwarmButton tone="primary" emphasis="soft" size="compact-sm" onClick={onCreatePreset}>
              Create your first {activeCategoryLabel.toLowerCase()} preset
            </SwarmButton>
          </Group>
        </Stack>
      )}
    </Box>
  );
});
