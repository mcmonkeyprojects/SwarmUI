import { memo } from 'react';
import { Box, Group, ScrollArea, Text } from '@mantine/core';
import { AnimatePresence, motion } from 'framer-motion';
import { SwarmBadge, SwarmButton } from '../ui';

interface PresetStagingStripProps {
  words: string[];
  onRemoveWord: (word: string) => void;
  onClear: () => void;
}

export const PresetStagingStrip = memo(function PresetStagingStrip({
  words,
  onRemoveWord,
  onClear,
}: PresetStagingStripProps) {
  const hasWords = words.length > 0;

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
            <Group justify="space-between" align="flex-start" gap="md" wrap="nowrap">
              <ScrollArea.Autosize mah={96} type="auto" className="preset-library__staging-scroll">
                <Group align="center" gap="xs" wrap="wrap">
                  <Text size="xs" c="dimmed" fw={600}>
                    Staged ({words.length}):
                  </Text>
                  <AnimatePresence initial={false}>
                    {words.map((word) => (
                      <motion.button
                        key={word}
                        type="button"
                        className="preset-library__staging-chip"
                        aria-label={`Remove ${word}`}
                        onClick={() => onRemoveWord(word)}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                      >
                        <SwarmBadge tone="primary" emphasis="soft">
                          {word} ×
                        </SwarmBadge>
                      </motion.button>
                    ))}
                  </AnimatePresence>
                </Group>
              </ScrollArea.Autosize>
              <SwarmButton tone="secondary" emphasis="ghost" size="compact-xs" onClick={onClear}>
                Clear
              </SwarmButton>
            </Group>
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
