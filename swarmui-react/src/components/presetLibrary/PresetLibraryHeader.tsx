import { memo, type KeyboardEventHandler, type RefObject } from 'react';
import { Box, Group, Stack, Tabs, Text, TextInput, ThemeIcon } from '@mantine/core';
import { IconBooks, IconEye, IconEyeOff, IconPlus, IconSearch, IconX } from '@tabler/icons-react';
import {
  PRESET_CATEGORIES,
  PRESET_CATEGORY_LABELS,
  type PresetCategory,
} from '../../features/presetLibrary/types';
import { SwarmActionIcon, SwarmButton, SwarmSwitch } from '../ui';

interface PresetLibraryHeaderProps {
  activeCategory: PresetCategory;
  searchQuery: string;
  showExplicit: boolean;
  onCategoryChange: (category: PresetCategory) => void;
  onSearchChange: (query: string) => void;
  onSearchClear: () => void;
  onSearchKeyDown: KeyboardEventHandler<HTMLInputElement>;
  onToggleShowExplicit: (show: boolean) => void;
  onCreatePreset: () => void;
  onClose: () => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
}

export const PresetLibraryHeader = memo(function PresetLibraryHeader({
  activeCategory,
  searchQuery,
  showExplicit,
  onCategoryChange,
  onSearchChange,
  onSearchClear,
  onSearchKeyDown,
  onToggleShowExplicit,
  onCreatePreset,
  onClose,
  searchInputRef,
}: PresetLibraryHeaderProps) {
  return (
    <Stack className="preset-library__header" gap="sm">
      <Group justify="space-between" align="flex-start" gap="md" wrap="wrap">
        <Group gap="sm" wrap="nowrap">
          <ThemeIcon
            size={40}
            radius="md"
            variant="light"
            color="gray"
            style={{ backgroundColor: 'var(--elevation-paper)' }}
          >
            <IconBooks size={18} />
          </ThemeIcon>
          <Stack gap={2}>
            <Text fw={700} size="lg">
              Preset Library
            </Text>
            <Text size="sm" c="dimmed">
              Quick-inject curated word clusters with a staging cart and prompt preview.
            </Text>
          </Stack>
        </Group>

        <SwarmActionIcon
          tone="secondary"
          emphasis="ghost"
          onClick={onClose}
          label="Close Preset Library"
        >
          <IconX size={18} />
        </SwarmActionIcon>
      </Group>

      <Tabs
        value={activeCategory}
        onChange={(value) => value && onCategoryChange(value as PresetCategory)}
        variant="outline"
      >
        <Tabs.List>
          {PRESET_CATEGORIES.map((category) => {
            if (!showExplicit && category === 'explicit') {
              return null;
            }

            return (
              <Tabs.Tab key={category} value={category}>
                {PRESET_CATEGORY_LABELS[category]}
              </Tabs.Tab>
            );
          })}
        </Tabs.List>
      </Tabs>

      <Group
        className="preset-library__filter-row"
        align="flex-end"
        justify="space-between"
        wrap="wrap"
        gap="sm"
      >
        <Box className="preset-library__search-field">
          <TextInput
            ref={searchInputRef}
            label="Search"
            placeholder="Search presets..."
            leftSection={<IconSearch size={16} />}
            rightSection={
              searchQuery ? (
                <SwarmActionIcon
                  tone="secondary"
                  emphasis="ghost"
                  size="sm"
                  label="Clear preset search"
                  onClick={onSearchClear}
                >
                  <IconX size={14} />
                </SwarmActionIcon>
              ) : null
            }
            rightSectionPointerEvents="all"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
            onKeyDown={onSearchKeyDown}
          />
        </Box>

        <Group gap="sm" align="center" wrap="wrap">
          <SwarmSwitch
            checked={showExplicit}
            onChange={(event) => onToggleShowExplicit(event.currentTarget.checked)}
            label={
              <Group gap={4}>
                {showExplicit ? <IconEye size={16} /> : <IconEyeOff size={16} />}
                <Text size="sm">Show Explicit</Text>
              </Group>
            }
          />

          <SwarmButton
            tone="primary"
            emphasis="soft"
            leftSection={<IconPlus size={14} />}
            onClick={onCreatePreset}
          >
            Create Preset
          </SwarmButton>
        </Group>
      </Group>
    </Stack>
  );
});
