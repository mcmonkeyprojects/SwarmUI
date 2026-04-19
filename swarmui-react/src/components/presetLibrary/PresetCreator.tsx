import { memo, useMemo, useState } from 'react';
import { Box, Group, Select, Stack, Text, TextInput, Textarea, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowBackUp, IconSparkles } from '@tabler/icons-react';
import { normalizeWord, parseWordsFromText } from '../../features/presetLibrary/staging';
import {
  PRESET_CATEGORIES,
  PRESET_CATEGORY_LABELS,
  type LibraryPreset,
  type PresetCategory,
} from '../../features/presetLibrary/types';
import { stripManagedBlocks } from '../../features/promptBuilder';
import { SwarmBadge, SwarmButton } from '../ui';

interface PresetCreatorValues {
  name: string;
  description?: string;
  category: PresetCategory;
  thumbnail?: string;
  words: string[];
}

interface PresetCreatorProps {
  activeCategory: PresetCategory;
  showExplicit: boolean;
  currentPromptText: string;
  initialPreset?: LibraryPreset | null;
  onSave: (values: PresetCreatorValues) => void;
  onCancel: () => void;
}

export const PresetCreator = memo(function PresetCreator({
  activeCategory,
  showExplicit,
  currentPromptText,
  initialPreset,
  onSave,
  onCancel,
}: PresetCreatorProps) {
  const [name, setName] = useState(initialPreset?.name ?? '');
  const [description, setDescription] = useState(initialPreset?.description ?? '');
  const [category, setCategory] = useState<PresetCategory>(
    !showExplicit && (initialPreset?.category ?? activeCategory) === 'explicit'
      ? 'characters'
      : (initialPreset?.category ?? activeCategory)
  );
  const [thumbnail, setThumbnail] = useState(initialPreset?.thumbnail ?? '');
  const [wordsText, setWordsText] = useState(initialPreset?.words.join(', ') ?? '');

  const parsedWords = useMemo(() => parseWordsFromText(wordsText), [wordsText]);
  const cleanedPromptText = useMemo(
    () => stripManagedBlocks(currentPromptText || '').trim(),
    [currentPromptText]
  );
  const effectiveCategory = !showExplicit && category === 'explicit' ? 'characters' : category;
  const canSave = name.trim().length > 0 && parsedWords.length > 0;
  const categoryOptions = useMemo(
    () =>
      PRESET_CATEGORIES.filter((presetCategory) => showExplicit || presetCategory !== 'explicit').map(
        (presetCategory) => ({
          value: presetCategory,
          label: PRESET_CATEGORY_LABELS[presetCategory],
        })
      ),
    [showExplicit]
  );

  const handlePullFromPrompt = () => {
    if (!cleanedPromptText) {
      notifications.show({
        title: 'Prompt Empty',
        message: 'There is no prompt text to pull from.',
        color: 'yellow',
      });
      return;
    }

    if (wordsText.trim() && !window.confirm('Replace current words?')) {
      return;
    }

    setWordsText(parseWordsFromText(cleanedPromptText).join(', '));
  };

  const handleRemoveWord = (wordToRemove: string) => {
    const remainingWords = parsedWords.filter(
      (word) => normalizeWord(word) !== normalizeWord(wordToRemove)
    );
    setWordsText(remainingWords.join(', '));
  };

  const handleSave = () => {
    if (!canSave) {
      return;
    }

    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      category: effectiveCategory,
      thumbnail: thumbnail.trim() || undefined,
      words: parsedWords,
    });
  };

  return (
    <Stack gap="md" className="preset-library__creator">
      <Group justify="space-between" align="center" wrap="wrap" gap="sm">
        <Stack gap={2}>
          <Text fw={700} size="lg">
            {initialPreset ? 'Edit Preset' : 'Create Preset'}
          </Text>
          <Text size="sm" c="dimmed">
            Build a reusable word cluster you can stage and inject into the prompt.
          </Text>
        </Stack>
        <SwarmButton
          tone="secondary"
          emphasis="ghost"
          leftSection={<IconArrowBackUp size={14} />}
          onClick={onCancel}
        >
          Back to Library
        </SwarmButton>
      </Group>

      <Group align="flex-start" grow className="preset-library__creator-main">
        <Stack gap="sm" className="preset-library__creator-fields">
          <TextInput
            label="Name"
            placeholder="Heroic Knight"
            value={name}
            onChange={(event) => setName(event.currentTarget.value.slice(0, 60))}
            maxLength={60}
            required
          />

          <TextInput
            label="Description"
            placeholder="Optional short description"
            value={description}
            onChange={(event) => setDescription(event.currentTarget.value.slice(0, 120))}
            maxLength={120}
          />

          <Group grow align="flex-start">
            <Select
              label="Category"
              data={categoryOptions}
              value={effectiveCategory}
              onChange={(value) => value && setCategory(value as PresetCategory)}
            />

            <TextInput
              label="Thumbnail Emoji"
              placeholder="🐉"
              value={thumbnail}
              onChange={(event) => setThumbnail(event.currentTarget.value.slice(0, 2))}
              maxLength={2}
            />
          </Group>

          <Stack gap="xs">
            <Group justify="space-between" align="center" wrap="wrap" gap="xs">
              <Text fw={600} size="sm">
                Words
              </Text>
              <Tooltip
                label={
                  cleanedPromptText
                    ? 'Pull words from the current prompt textarea'
                    : 'There is no prompt text to pull from'
                }
              >
                <Box>
                  <SwarmButton
                    tone="primary"
                    emphasis="soft"
                    size="compact-sm"
                    leftSection={<IconSparkles size={14} />}
                    onClick={handlePullFromPrompt}
                    disabled={!cleanedPromptText}
                  >
                    Pull from current prompt
                  </SwarmButton>
                </Box>
              </Tooltip>
            </Group>

            <Textarea
              label="Free-text words"
              placeholder="knight, armor, sword"
              value={wordsText}
              onChange={(event) => setWordsText(event.currentTarget.value)}
              autosize
              minRows={6}
              maxRows={10}
            />
          </Stack>
        </Stack>

        <Stack gap="sm" className="preset-library__creator-preview">
          <Text fw={600} size="sm">
            Preview ({parsedWords.length})
          </Text>

          {parsedWords.length > 0 ? (
            <Group gap="xs" wrap="wrap" align="flex-start">
              {parsedWords.map((word) => (
                <button
                  key={word}
                  type="button"
                  className="preset-library__creator-chip"
                  aria-label={`Remove ${word}`}
                  onClick={() => handleRemoveWord(word)}
                >
                  <SwarmBadge tone="primary" emphasis="soft">
                    {word} ×
                  </SwarmBadge>
                </button>
              ))}
            </Group>
          ) : (
            <Text size="sm" c="dimmed">
              Add at least one comma-separated or newline-separated word to save this preset.
            </Text>
          )}
        </Stack>
      </Group>

      <Group justify="flex-end" gap="xs">
        <SwarmButton tone="secondary" emphasis="ghost" onClick={onCancel}>
          Cancel
        </SwarmButton>
        <SwarmButton tone="primary" emphasis="solid" onClick={handleSave} disabled={!canSave}>
          Save Preset
        </SwarmButton>
      </Group>
    </Stack>
  );
});
