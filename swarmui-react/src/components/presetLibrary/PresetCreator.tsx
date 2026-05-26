import { memo, useMemo, useState } from 'react';
import {
  Box,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  Tooltip,
  Popover,
  ActionIcon,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconArrowBackUp,
  IconSparkles,
  IconMinus,
  IconPlus,
  IconRotate2,
} from '@tabler/icons-react';
import { normalizeWord, parseWordsFromText } from '../../features/presetLibrary/staging';
import {
  PRESET_CATEGORIES,
  PRESET_CATEGORY_LABELS,
  parseWeightedWord,
  formatWeightedWord,
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
      PRESET_CATEGORIES.filter(
        (presetCategory) => showExplicit || presetCategory !== 'explicit'
      ).map((presetCategory) => ({
        value: presetCategory,
        label: PRESET_CATEGORY_LABELS[presetCategory],
      })),
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

  const handleRemoveWord = (targetBaseWord: string) => {
    const remainingWords = parsedWords.filter((word) => {
      const { baseWord } = parseWeightedWord(word);
      return normalizeWord(baseWord) !== normalizeWord(targetBaseWord);
    });
    setWordsText(remainingWords.join(', '));
  };

  const handleAdjustWordWeight = (targetBaseWord: string, nextWeight: number) => {
    const updatedWords = parsedWords.map((word) => {
      const { baseWord } = parseWeightedWord(word);
      if (normalizeWord(baseWord) === normalizeWord(targetBaseWord)) {
        return formatWeightedWord(baseWord, nextWeight);
      }
      return word;
    });
    setWordsText(updatedWords.join(', '));
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
              {parsedWords.map((word) => {
                const { baseWord, weight } = parseWeightedWord(word);
                return (
                  <Popover key={word} width={200} position="bottom" withArrow shadow="md">
                    <Popover.Target>
                      <button
                        type="button"
                        className="preset-library__creator-chip"
                        aria-label={`Adjust weight for ${baseWord}`}
                      >
                        <SwarmBadge tone="primary" emphasis="soft">
                          {baseWord} {weight !== 1.0 ? `(x${Number(weight.toFixed(2))})` : ''}
                        </SwarmBadge>
                      </button>
                    </Popover.Target>
                    <Popover.Dropdown style={{ padding: '8px 12px', zIndex: 1000 }}>
                      <Stack gap="xs">
                        <Group justify="space-between" align="center" wrap="nowrap">
                          <Text size="xs" fw={700} style={{ flex: 1, minWidth: 0 }} truncate>
                            {baseWord}
                          </Text>
                          <SwarmButton
                            tone="secondary"
                            emphasis="ghost"
                            size="compact-xs"
                            onClick={() => handleRemoveWord(baseWord)}
                          >
                            Remove
                          </SwarmButton>
                        </Group>
                        <Group gap="xs" justify="space-between" align="center" wrap="nowrap">
                          <Group gap={4} wrap="nowrap">
                            <ActionIcon
                              size="sm"
                              variant="default"
                              onClick={() => handleAdjustWordWeight(baseWord, weight - 0.05)}
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
                              onClick={() => handleAdjustWordWeight(baseWord, weight + 0.05)}
                              disabled={weight >= 3.0}
                            >
                              <IconPlus size={12} />
                            </ActionIcon>
                          </Group>
                          <ActionIcon
                            size="sm"
                            variant="subtle"
                            color="gray"
                            onClick={() => handleAdjustWordWeight(baseWord, 1.0)}
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
