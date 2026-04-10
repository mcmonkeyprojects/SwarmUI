import { memo, useMemo, useState } from 'react';
import { Box, Group, Stack, Text, Tabs, UnstyledButton, Collapse, Paper } from '@mantine/core';
import { IconChevronDown, IconChevronRight, IconBulb } from '@tabler/icons-react';
import { PromptWizardTagChip } from './PromptWizardTagChip';
import {
  buildStepGuidance,
  buildNegativePairCandidates,
} from '../features/promptWizard/wizardInsights';
import type { PromptTag, StepMeta } from '../features/promptWizard/types';

interface PromptWizardSuggestionStripProps {
  stepMeta: StepMeta;
  allTags: PromptTag[];
  visibleTags: PromptTag[];
  selectedTagIds: Set<string>;
  manualNegativeTexts: string[];
  onToggleTag: (tagId: string) => void;
  onAddNegativePair: (text: string) => void;
}

export const PromptWizardSuggestionStrip = memo(function PromptWizardSuggestionStrip({
  stepMeta,
  allTags,
  visibleTags,
  selectedTagIds,
  manualNegativeTexts,
  onToggleTag,
  onAddNegativePair,
}: PromptWizardSuggestionStripProps) {
  const [collapsed, setCollapsed] = useState(false);

  const selectedTags = useMemo(
    () => allTags.filter((t) => selectedTagIds.has(t.id)),
    [allTags, selectedTagIds]
  );

  const suggestions = useMemo(
    () => buildStepGuidance(stepMeta, allTags, visibleTags, selectedTags, selectedTagIds),
    [stepMeta, allTags, visibleTags, selectedTags, selectedTagIds]
  );

  const negativeCandidates = useMemo(
    () => buildNegativePairCandidates(selectedTags, manualNegativeTexts),
    [selectedTags, manualNegativeTexts]
  );

  if (suggestions.length === 0 && negativeCandidates.length === 0) return null;

  const totalCount = suggestions.reduce((sum, s) => sum + s.tags.length, 0);

  return (
    <Paper
      withBorder
      radius="md"
      style={{
        background: 'var(--elevation-raised)',
        borderColor: `color-mix(in srgb, var(--mantine-color-${stepMeta.tone}-filled) 20%, var(--mantine-color-default-border))`,
      }}
    >
      {/* Header — always visible */}
      <UnstyledButton
        onClick={() => setCollapsed((c) => !c)}
        className="swarm-control-no-select"
        style={{ width: '100%', padding: '8px 12px' }}
      >
        <Group justify="space-between" align="center">
          <Group gap="xs" align="center">
            {collapsed ? <IconChevronRight size={14} /> : <IconChevronDown size={14} />}
            <IconBulb size={14} style={{ color: `var(--mantine-color-${stepMeta.tone}-filled)` }} />
            <Text size="xs" fw={600}>
              Suggestions
            </Text>
            <Text size="xs" c="dimmed">
              {totalCount} tags
            </Text>
          </Group>
        </Group>
      </UnstyledButton>

      {/* Body — collapsible */}
      <Collapse in={!collapsed}>
        <Box px={12} pb={12}>
          <Tabs defaultValue={suggestions[0]?.title} variant="pills" radius="xl">
            <Tabs.List mb="xs">
              {suggestions.map((set) => (
                <Tabs.Tab key={set.title} value={set.title}>
                  {set.title} ({set.tags.length})
                </Tabs.Tab>
              ))}
              {negativeCandidates.length > 0 && (
                <Tabs.Tab value="__negative_pairs">
                  Negative pairs ({negativeCandidates.length})
                </Tabs.Tab>
              )}
            </Tabs.List>

            {suggestions.map((set) => (
              <Tabs.Panel key={set.title} value={set.title}>
                <Stack gap={4}>
                  <Text size="xs" c="dimmed">
                    {set.description}
                  </Text>
                  <Group gap={6}>
                    {set.tags.map((tag) => (
                      <PromptWizardTagChip
                        key={tag.id}
                        text={tag.text}
                        selected={selectedTagIds.has(tag.id)}
                        onToggle={() => onToggleTag(tag.id)}
                      />
                    ))}
                  </Group>
                </Stack>
              </Tabs.Panel>
            ))}

            {negativeCandidates.length > 0 && (
              <Tabs.Panel value="__negative_pairs">
                <Stack gap={4}>
                  <Text size="xs" c="dimmed">
                    Click to add the negative counterpart for selected tags.
                  </Text>
                  <Group gap={6}>
                    {negativeCandidates.map((tag) => (
                      <UnstyledButton
                        key={tag.id}
                        className="swarm-control-no-select"
                        onClick={() => tag.negativeText && onAddNegativePair(tag.negativeText)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 'var(--mantine-radius-xl)',
                          background: 'var(--elevation-raised)',
                          border: '1px solid var(--mantine-color-default-border)',
                          fontSize: 'var(--mantine-font-size-xs)',
                          cursor: 'pointer',
                        }}
                      >
                        <Text size="xs">
                          <Text span fw={600}>
                            {tag.text}
                          </Text>
                          <Text span c="dimmed">
                            {' '}
                            → {tag.negativeText}
                          </Text>
                        </Text>
                      </UnstyledButton>
                    ))}
                  </Group>
                </Stack>
              </Tabs.Panel>
            )}
          </Tabs>
        </Box>
      </Collapse>
    </Paper>
  );
});
