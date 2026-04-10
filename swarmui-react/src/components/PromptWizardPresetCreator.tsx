import { memo, useCallback, useMemo, useState } from 'react';
import { Group, Select, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { SwarmBadge, SwarmButton } from './ui';
import { PRESET_CATEGORIES, PRESET_CATEGORY_LABELS } from '../features/promptWizard/types';
import type { PresetCategory, PromptTag } from '../features/promptWizard/types';

interface PromptWizardPresetCreatorProps {
  activeCategory: PresetCategory;
  selectedTagIds: string[];
  allTags: PromptTag[];
  onSave: (preset: {
    name: string;
    description?: string;
    category: PresetCategory;
    tagIds: string[];
    thumbnail?: string;
  }) => void;
  onCancel: () => void;
  initialName?: string;
  initialDescription?: string;
  initialCategory?: PresetCategory;
}

export const PromptWizardPresetCreator = memo(function PromptWizardPresetCreator({
  activeCategory,
  selectedTagIds,
  allTags,
  onSave,
  onCancel,
  initialName,
  initialDescription,
  initialCategory,
}: PromptWizardPresetCreatorProps) {
  const [name, setName] = useState(initialName ?? '');
  const [description, setDescription] = useState(initialDescription ?? '');
  const [category, setCategory] = useState<PresetCategory>(initialCategory ?? activeCategory);
  const [includedTagIds, setIncludedTagIds] = useState<Set<string>>(new Set(selectedTagIds));

  const selectedTags = useMemo(
    () =>
      selectedTagIds.map((id) => allTags.find((t) => t.id === id)).filter(Boolean) as PromptTag[],
    [selectedTagIds, allTags]
  );

  const toggleInclude = useCallback((tagId: string) => {
    setIncludedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  }, []);

  const canSave = name.trim().length > 0 && includedTagIds.size > 0;

  const handleSave = useCallback(() => {
    if (!canSave) return;
    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      category,
      tagIds: Array.from(includedTagIds),
    });
  }, [canSave, name, description, category, includedTagIds, onSave]);

  const categoryData = PRESET_CATEGORIES.map((c) => ({
    value: c,
    label: PRESET_CATEGORY_LABELS[c],
  }));

  return (
    <Stack gap="md" p="md">
      <Group justify="space-between">
        <Text fw={600} size="sm">
          Create New Preset
        </Text>
        <SwarmButton tone="secondary" emphasis="ghost" size="compact-xs" onClick={onCancel}>
          Cancel
        </SwarmButton>
      </Group>

      <TextInput
        label="Name"
        placeholder="e.g., Heroic Knight"
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        required
        size="sm"
      />

      <TextInput
        label="Description"
        placeholder="Optional short description"
        value={description}
        onChange={(e) => setDescription(e.currentTarget.value)}
        size="sm"
      />

      <Select
        label="Category"
        data={categoryData}
        value={category}
        onChange={(val) => val && setCategory(val as PresetCategory)}
        size="sm"
      />

      <Stack gap="xs">
        <Text size="sm" fw={500}>
          Include Tags ({includedTagIds.size} selected)
        </Text>
        {selectedTags.length === 0 ? (
          <Text size="xs" c="dimmed" ta="center" py="md">
            No tags selected. Switch to Steps view and select some tags first, then come back here
            to save them as a preset.
          </Text>
        ) : (
          <Group gap={6} wrap="wrap">
            {selectedTags.map((tag) => (
              <UnstyledButton
                key={tag.id}
                className="swarm-control-no-select"
                onClick={() => toggleInclude(tag.id)}
              >
                <SwarmBadge
                  tone={includedTagIds.has(tag.id) ? 'primary' : 'secondary'}
                  emphasis={includedTagIds.has(tag.id) ? 'solid' : 'ghost'}
                >
                  {tag.text}
                </SwarmBadge>
              </UnstyledButton>
            ))}
          </Group>
        )}
      </Stack>

      <Group justify="flex-end" gap="xs">
        <SwarmButton tone="secondary" emphasis="ghost" size="compact-sm" onClick={onCancel}>
          Cancel
        </SwarmButton>
        <SwarmButton
          tone="primary"
          emphasis="solid"
          size="compact-sm"
          onClick={handleSave}
          disabled={!canSave}
        >
          Save Preset
        </SwarmButton>
      </Group>
    </Stack>
  );
});
