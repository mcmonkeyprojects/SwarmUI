import { memo, useMemo } from 'react';
import { Box, Group, ScrollArea, Text, Popover, ActionIcon, Stack } from '@mantine/core';
import { AnimatePresence, motion } from 'framer-motion';
import { IconMinus, IconPlus, IconRotate2 } from '@tabler/icons-react';
import { SwarmBadge, SwarmButton } from '../ui';
import {
  parseWeightedWord,
  type PresetPromptSection,
} from '../../features/presetLibrary/types';
import { usePresetLibraryStore } from '../../stores/presetLibraryStore';

interface StagedPresetInfo {
  id: string;
  name: string;
  thumbnail?: string;
}

interface PresetStagingStripProps {
  words: string[];
  sections: PresetPromptSection[];
  onRemoveWord: (word: string) => void;
  onClear: () => void;
  stagedPresets: StagedPresetInfo[];
}

export const PresetStagingStrip = memo(function PresetStagingStrip({
  words,
  sections,
  onRemoveWord,
  onClear,
  stagedPresets = [],
}: PresetStagingStripProps) {
  const hasWords = words.length > 0;
  const compiledPromptText = useMemo(
    () => sections.map((section) => section.text.trim()).filter(Boolean).join('\n'),
    [sections]
  );
  const adjustWordWeight = usePresetLibraryStore((state) => state.adjustWordWeight);
  const presetMultipliers = usePresetLibraryStore((state) => state.presetMultipliers);
  const adjustPresetMultiplier = usePresetLibraryStore((state) => state.adjustPresetMultiplier);
  const unstagePreset = usePresetLibraryStore((state) => state.unstagePreset);

  return (
    <Box className="preset-library__staging-strip" data-empty={!hasWords}>
      <AnimatePresence mode="wait" initial={false}>
        {hasWords ? (
          <motion.div
            key="staged"
            className="preset-library__staging-content"
            initial={{ opacity: 0, height: 0, y: -6 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -6 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <Stack gap="xs" align="stretch">
              {stagedPresets.length > 0 && (
                <Box className="preset-library__active-presets-section">
                  <Group gap="xs" wrap="wrap" align="center">
                    <Text size="xs" c="dimmed" fw={600} style={{ flexShrink: 0 }}>
                      Active Presets:
                    </Text>
                    {stagedPresets.map((preset) => {
                      const multiplier = presetMultipliers[preset.id] ?? 1.0;
                      return (
                        <Popover key={preset.id} width={220} position="top" withArrow shadow="md">
                          <Popover.Target>
                            <button type="button" className="preset-library__active-preset-badge">
                              <span className="preset-library__badge-thumb">{preset.thumbnail || '✨'}</span>
                              <span className="preset-library__badge-name">{preset.name}</span>
                              <span className="preset-library__badge-multiplier">({multiplier.toFixed(2)}x)</span>
                            </button>
                          </Popover.Target>
                          <Popover.Dropdown style={{ padding: '8px 12px', zIndex: 1000 }}>
                            <Stack gap="xs">
                              <Group justify="space-between" align="center" wrap="nowrap">
                                <Text size="xs" fw={700} style={{ flex: 1, minWidth: 0 }} truncate>
                                  {preset.name}
                                </Text>
                                <SwarmButton
                                  tone="danger"
                                  emphasis="ghost"
                                  size="compact-xs"
                                  onClick={() => unstagePreset(preset.id)}
                                >
                                  Unstage
                                </SwarmButton>
                              </Group>
                              <Text size="xs" c="dimmed">
                                Scale preset intensity:
                              </Text>
                              <Group gap="xs" align="center" wrap="nowrap">
                                <ActionIcon
                                  size="sm"
                                  variant="default"
                                  onClick={() => adjustPresetMultiplier(preset.id, multiplier - 0.05)}
                                  disabled={multiplier <= 0.2}
                                >
                                  <IconMinus size={12} />
                                </ActionIcon>
                                <Text size="xs" fw={600} w={36} ta="center">
                                  {multiplier.toFixed(2)}x
                                </Text>
                                <ActionIcon
                                  size="sm"
                                  variant="default"
                                  onClick={() => adjustPresetMultiplier(preset.id, multiplier + 0.05)}
                                  disabled={multiplier >= 2.0}
                                >
                                  <IconPlus size={12} />
                                </ActionIcon>
                                <ActionIcon
                                  size="sm"
                                  variant="subtle"
                                  color="gray"
                                  onClick={() => adjustPresetMultiplier(preset.id, 1.0)}
                                  disabled={multiplier === 1.0}
                                  title="Reset to 1.0x"
                                >
                                  <IconRotate2 size={12} />
                                </ActionIcon>
                              </Group>
                            </Stack>
                          </Popover.Dropdown>
                        </Popover>
                      );
                    })}
                  </Group>
                </Box>
              )}

              {compiledPromptText && (
                <Box className="preset-library__prompt-preview-section">
                  <Group justify="space-between" align="center" gap="sm" wrap="nowrap">
                    <Text size="xs" c="dimmed" fw={700}>
                      Compiled Prompt
                    </Text>
                    <Text size="xs" c="dimmed">
                      {compiledPromptText.length} chars
                    </Text>
                  </Group>
                  <Box component="pre" className="preset-library__prompt-preview">
                    {compiledPromptText}
                  </Box>
                </Box>
              )}

              <Stack gap={6}>
                <Group justify="space-between" align="center" gap="sm" wrap="nowrap">
                  <Text size="xs" c="dimmed" fw={600}>
                    Tokens ({words.length})
                  </Text>
                  <SwarmButton tone="secondary" emphasis="ghost" size="compact-xs" onClick={onClear}>
                    Clear
                  </SwarmButton>
                </Group>
                <ScrollArea.Autosize mah={96} type="auto" className="preset-library__staging-scroll">
                  <Group align="flex-start" gap="xs" wrap="wrap">
                    <AnimatePresence initial={false}>
                      {words.map((word) => {
                        const { baseWord, weight } = parseWeightedWord(word);
                        return (
                          <Popover
                            key={word}
                            width={200}
                            position="bottom"
                            withArrow
                            shadow="md"
                          >
                            <Popover.Target>
                              <motion.button
                                type="button"
                                className="preset-library__staging-chip"
                                aria-label={`Adjust weight for ${baseWord}`}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                transition={{ duration: 0.15, ease: 'easeOut' }}
                              >
                                <SwarmBadge tone="primary" emphasis="soft">
                                  {baseWord}{' '}
                                  {weight !== 1.0 ? `(x${Number(weight.toFixed(2))})` : ''}
                                </SwarmBadge>
                              </motion.button>
                            </Popover.Target>
                            <Popover.Dropdown style={{ padding: '8px 12px', zIndex: 1000 }}>
                              <Stack gap="xs">
                                <Group justify="space-between" align="center" wrap="nowrap">
                                  <Text
                                    size="xs"
                                    fw={700}
                                    style={{ flex: 1, minWidth: 0 }}
                                    truncate
                                  >
                                    {baseWord}
                                  </Text>
                                  <SwarmButton
                                    tone="secondary"
                                    emphasis="ghost"
                                    size="compact-xs"
                                    onClick={() => onRemoveWord(word)}
                                  >
                                    Remove
                                  </SwarmButton>
                                </Group>
                                <Group
                                  gap="xs"
                                  justify="space-between"
                                  align="center"
                                  wrap="nowrap"
                                >
                                  <Group gap={4} wrap="nowrap">
                                    <ActionIcon
                                      size="sm"
                                      variant="default"
                                      onClick={() => adjustWordWeight(baseWord, weight - 0.05)}
                                      disabled={weight <= 0.1}
                                    >
                                      <IconMinus size={12} />
                                    </ActionIcon>
                                    <Text size="xs" fw={600} w={32} ta="center">
                                      {weight.toFixed(2)}
                                    </Text>
                                    <ActionIcon
                                      size="sm"
                                      variant="default"
                                      onClick={() => adjustWordWeight(baseWord, weight + 0.05)}
                                      disabled={weight >= 3.0}
                                    >
                                      <IconPlus size={12} />
                                    </ActionIcon>
                                  </Group>
                                  <ActionIcon
                                    size="sm"
                                    variant="subtle"
                                    color="gray"
                                    onClick={() => adjustWordWeight(baseWord, 1.0)}
                                    disabled={weight === 1.0}
                                    title="Reset to 1.0"
                                  >
                                    <IconRotate2 size={12} />
                                  </ActionIcon>
                                </Group>
                              </Stack>
                            </Popover.Dropdown>
                          </Popover>
                        );
                      })}
                    </AnimatePresence>
                  </Group>
                </ScrollArea.Autosize>
              </Stack>
            </Stack>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            className="preset-library__staging-placeholder"
            initial={{ opacity: 0.2 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0.2 }}
          >
            <Text size="xs" c="dimmed" fw={600}>
              Click a preset above to start staging words
            </Text>
          </motion.div>
        )}
      </AnimatePresence>
    </Box>
  );
});
