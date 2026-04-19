import { useMemo, useState } from 'react';
import {
  Accordion,
  Checkbox,
  Divider,
  FileButton,
  Grid,
  Group,
  Loader,
  Modal,
  NumberInput,
  Progress,
  ScrollArea,
  Select,
  Slider,
  Stack,
  Tabs,
  TagsInput,
  Text,
  TextInput,
  Textarea,
  Tooltip,
  MultiSelect,
} from '@mantine/core';
import {
  IconCheck,
  IconDownload,
  IconPhoto,
  IconRefresh,
  IconSparkles,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useShallow } from 'zustand/react/shallow';
import { SwarmActionIcon as ActionIcon } from '../../components/ui/SwarmActionIcon';
import { SwarmButton } from '../../components/ui/SwarmButton';
import { useRoleplayStore } from '../../stores/roleplayStore';
import { useGenerationStore } from '../../store/generationStore';
import { useModelLoading } from '../../hooks/useModelLoading';
import { useModels } from '../../hooks/useModels';
import { swarmClient } from '../../api/client';
import { resolveAssetUrl } from '../../config/runtimeEndpoints';
import type { RoleplayCharacter, RoleplayInteractionStyle } from '../../types/roleplay';
import {
  CHAT_OPENING_MESSAGE_PRESET_MAP,
  CHAT_OPENING_MESSAGE_PRESETS,
  CHAT_PROMPT_PRESETS,
  PRESET_PROMPT_MAP,
  ROLEPLAY_OPENING_MESSAGE_PRESET_MAP,
  ROLEPLAY_OPENING_MESSAGE_PRESETS,
  ROLEPLAY_MODE_PROMPT_PRESETS,
} from '../../data/roleplayPromptPresets';
import { PERSONALITY_PRESET_MAP, PERSONALITY_PRESETS } from '../../data/personalityPresets';
import {
  DEFAULT_ROLEPLAY_INTERACTION_STYLE,
  ROLEPLAY_INTERACTION_STYLES,
  getRoleplayInteractionStyleConfig,
} from '../../data/roleplayInteractionStyles';
import {
  buildStructuredPersonalityBlock,
  createEmptyRoleplayPersonalityProfile,
  getEffectiveSystemPrompt,
  normalizeRoleplayPersonalityProfile,
} from '../../features/roleplay/roleplayCharacterPrompting';
import { createEmptyRoleplayMemoryState } from '../../features/roleplay/roleplayMemory';
import { CharacterAvatar } from './CharacterAvatar';

const IP_ADAPTER_MODELS = [
  { value: 'faceid plus v2', label: 'FaceID Plus v2 — recommended (SDXL / SD1.5)' },
  { value: 'faceid', label: 'FaceID Standard (SD1.5)' },
  { value: 'faceid portrait', label: 'FaceID Portrait — stronger identity' },
  { value: 'faceid portrait unnorm', label: 'FaceID Portrait UnNorm (SDXL only)' },
];

interface CharacterEditorProps {
  opened: boolean;
  onClose: () => void;
  character: RoleplayCharacter | null;
}

const PORTRAIT_DEFAULT_STEPS = 25;
const PORTRAIT_DEFAULT_CFG = 4;
const PORTRAIT_RESOLUTION_OPTIONS = [
  { value: '1024x2024', label: 'Tall Detail (1024x2024)' },
  { value: '1024x1824', label: 'Portrait 9:16 (1024x1824)' },
  { value: '1824x1024', label: 'Landscape 16:9 (1824x1024)' },
] as const;

/** Convert a SwarmUI output URL to a base64 data URL so it persists in localStorage
 *  and is accepted by IP-Adapter FaceID as a promptimage. */
async function fetchAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function areStringListsEqual(left: string[], right: string[]) {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function CharacterEditorForm({
  character,
  onClose,
}: {
  character: RoleplayCharacter | null;
  onClose: () => void;
}) {
  const isEditing = character !== null;
  const initialInteractionStyle = character?.interactionStyle ?? DEFAULT_ROLEPLAY_INTERACTION_STYLE;
  const initialInteractionStyleConfig = getRoleplayInteractionStyleConfig(initialInteractionStyle);
  const initialPersonalityProfile = normalizeRoleplayPersonalityProfile(
    character?.personalityProfile ?? createEmptyRoleplayPersonalityProfile()
  );

  // ── Character text fields ─────────────────────────────────────────────
  const [name, setName] = useState(character?.name ?? '');
  const [interactionStyle, setInteractionStyle] =
    useState<RoleplayInteractionStyle>(initialInteractionStyle);
  const [personality, setPersonality] = useState(character?.personality ?? '');
  const [personalityProfile, setPersonalityProfile] = useState(initialPersonalityProfile);
  const [chatSystemPrompt, setChatSystemPrompt] = useState(
    character?.chatSystemPrompt ?? ''
  );
  const [roleplaySystemPrompt, setRoleplaySystemPrompt] = useState(
    character?.roleplaySystemPrompt ?? ''
  );
  const [openingChatMessage, setOpeningChatMessage] = useState(character?.openingChatMessage ?? '');
  const [openingRoleplayMessage, setOpeningRoleplayMessage] = useState(
    character?.openingRoleplayMessage ?? ''
  );
  const [alternateGreetings, setAlternateGreetings] = useState(character?.alternateGreetings ?? []);
  const [sceneSuggestionPrompt, setSceneSuggestionPrompt] = useState(
    character?.sceneSuggestionPrompt ?? initialInteractionStyleConfig.sceneSuggestionPrompt
  );
  const [description, setDescription] = useState(character?.description ?? '');
  const [scenario, setScenario] = useState(character?.scenario ?? '');
  const [exampleMessages, setExampleMessages] = useState(character?.exampleMessages ?? '');
  const [tags, setTags] = useState(character?.tags ?? []);
  const [creatorNotes, setCreatorNotes] = useState(character?.creatorNotes ?? '');
  const [boundLorebookIds, setBoundLorebookIds] = useState(character?.boundLorebookIds ?? []);
  const [openBuilderSections, setOpenBuilderSections] = useState<string[]>(['personality-details']);

  // ── Visual identity fields ────────────────────────────────────────────
  const [appearancePrompt, setAppearancePrompt] = useState(character?.appearancePrompt ?? '');
  const [characterImageModelId, setCharacterImageModelId] = useState(character?.imageModelId ?? '');
  const [characterLora, setCharacterLora] = useState(character?.characterLora ?? '');
  const [characterLoraWeight, setCharacterLoraWeight] = useState<number>(
    character?.characterLoraWeight ?? 0.8
  );
  const [ipAdapterEnabled, setIpAdapterEnabled] = useState(character?.ipAdapterEnabled ?? false);
  const [ipAdapterModel, setIpAdapterModel] = useState(
    character?.ipAdapterModel ?? 'faceid plus v2'
  );
  const [ipAdapterWeight, setIpAdapterWeight] = useState<number>(character?.ipAdapterWeight ?? 1.0);
  const [portraitResolution, setPortraitResolution] = useState<string>('1024x2024');

  // ── Portrait history (local session only — not persisted) ─────────────
  // Index 0 is always the "selected" portrait; clicking a thumbnail swaps it to front
  const [portraitCandidates, setPortraitCandidates] = useState<string[]>(
    character?.avatar ? [character.avatar] : []
  );
  const [isGeneratingPortrait, setIsGeneratingPortrait] = useState(false);

  const currentPortrait = portraitCandidates[0] ?? null;
  const hasPortrait = !!currentPortrait;

  const selectPortrait = (index: number) => {
    if (index === 0) return;
    setPortraitCandidates((prev) => {
      const next = [...prev];
      const [picked] = next.splice(index, 1);
      return [picked, ...next];
    });
  };

  const removeCurrentPortrait = () => {
    setPortraitCandidates((prev) => prev.slice(1));
    setIpAdapterEnabled(false);
    if (isEditing) {
      updateCharacterAvatar(character.id, '');
    }
  };

  // ── Store ─────────────────────────────────────────────────────────────
  const { addCharacter, updateCharacter, setActiveCharacter, updateCharacterAvatar, lorebooks } =
    useRoleplayStore(
      useShallow((s) => ({
        addCharacter: s.addCharacter,
        updateCharacter: s.updateCharacter,
        setActiveCharacter: s.setActiveCharacter,
        updateCharacterAvatar: s.updateCharacterAvatar,
        lorebooks: s.lorebooks,
      }))
    );

  const lorebookOptions = useMemo(
    () =>
      lorebooks.map((lorebook) => ({
        value: lorebook.id,
        label: lorebook.name,
      })),
    [lorebooks]
  );

  // ── Model selection ───────────────────────────────────────────────────
  const generatePageModel = useGenerationStore((s) => s.selectedModel);
  const effectiveModel = characterImageModelId || generatePageModel;
  const { data: sdModels, isLoading: loadingModels } = useModels('Stable-Diffusion');
  const { isLoading: isLoadingModel, progress: modelLoadProgress, loadModel } = useModelLoading();

  // ── Avatar preview object (for CharacterAvatar component) ─────────────
  const avatarPreview: RoleplayCharacter = useMemo(
    () => ({
      id: character?.id ?? 'preview',
      name: name || '?',
      avatar: currentPortrait,
      interactionStyle,
      appearancePrompt: appearancePrompt.trim() || null,
      imageModelId: characterImageModelId.trim() || null,
      personalityProfile,
      characterLora: characterLora.trim() || null,
      characterLoraWeight,
      ipAdapterEnabled,
      ipAdapterModel,
      ipAdapterWeight,
      personality,
      systemPrompt: getEffectiveSystemPrompt({
        interactionStyle,
        chatSystemPrompt,
        roleplaySystemPrompt,
        systemPrompt: character?.systemPrompt ?? '',
      }),
      chatSystemPrompt,
      roleplaySystemPrompt,
      openingChatMessage,
      openingRoleplayMessage,
      alternateGreetings,
      sceneSuggestionPrompt: sceneSuggestionPrompt.trim() || null,
      description,
      scenario,
      exampleMessages,
      tags,
      creatorNotes,
      boundLorebookIds,
      ...createEmptyRoleplayMemoryState(),
      createdAt: character?.createdAt ?? 0,
      updatedAt: character?.updatedAt ?? 0,
    }),
    [
      character,
      name,
      currentPortrait,
      interactionStyle,
      appearancePrompt,
      characterImageModelId,
      personalityProfile,
      characterLora,
      characterLoraWeight,
      ipAdapterEnabled,
      ipAdapterModel,
      ipAdapterWeight,
      personality,
      chatSystemPrompt,
      roleplaySystemPrompt,
      openingChatMessage,
      openingRoleplayMessage,
      alternateGreetings,
      sceneSuggestionPrompt,
      description,
      scenario,
      exampleMessages,
      tags,
      creatorNotes,
      boundLorebookIds,
    ]
  );

  // ── Save ─────────────────────────────────────────────────────────────
  const interactionStyleConfig = getRoleplayInteractionStyleConfig(interactionStyle);

  const handleInteractionStyleChange = (value: string | null) => {
    if (!value) {
      return;
    }

    const nextInteractionStyle = value as RoleplayInteractionStyle;
    const currentInteractionStyleConfig = getRoleplayInteractionStyleConfig(interactionStyle);
    const nextInteractionStyleConfig = getRoleplayInteractionStyleConfig(nextInteractionStyle);
    const trimmedSceneSuggestionPrompt = sceneSuggestionPrompt.trim();

    setInteractionStyle(nextInteractionStyle);
    if (
      !trimmedSceneSuggestionPrompt ||
      trimmedSceneSuggestionPrompt === currentInteractionStyleConfig.sceneSuggestionPrompt
    ) {
      setSceneSuggestionPrompt(nextInteractionStyleConfig.sceneSuggestionPrompt);
    }
  };

  const handlePersonalityProfileChange = (key: keyof typeof personalityProfile, value: string) => {
    setPersonalityProfile((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleTagsChange = (nextTags: string[]) => {
    setTags((current) => (areStringListsEqual(current, nextTags) ? current : nextTags));
  };

  const handleAlternateGreetingsChange = (nextGreetings: string[]) => {
    setAlternateGreetings((current) =>
      areStringListsEqual(current, nextGreetings) ? current : nextGreetings
    );
  };

  const handleBoundLorebooksChange = (nextLorebookIds: string[]) => {
    setBoundLorebookIds((current) =>
      areStringListsEqual(current, nextLorebookIds) ? current : nextLorebookIds
    );
  };

  const handleBuilderSectionsChange = (nextSections: string[]) => {
    setOpenBuilderSections((current) =>
      areStringListsEqual(current, nextSections) ? current : nextSections
    );
  };

  const handleSave = () => {
    if (!name.trim()) return;
    const effectiveSystemPrompt = getEffectiveSystemPrompt({
      interactionStyle,
      chatSystemPrompt,
      roleplaySystemPrompt,
      systemPrompt: character?.systemPrompt ?? '',
    });
    const sharedFields = {
      name: name.trim(),
      interactionStyle,
      personalityProfile,
      personality: personality.trim(),
      systemPrompt: effectiveSystemPrompt,
      chatSystemPrompt: chatSystemPrompt.trim(),
      roleplaySystemPrompt: roleplaySystemPrompt.trim(),
      openingChatMessage: openingChatMessage.trim(),
      openingRoleplayMessage: openingRoleplayMessage.trim(),
      alternateGreetings: alternateGreetings
        .map((greeting) => greeting.trim())
        .filter((greeting) => greeting),
      sceneSuggestionPrompt: sceneSuggestionPrompt.trim() || null,
      description: description.trim(),
      scenario: scenario.trim(),
      exampleMessages: exampleMessages.trim(),
      tags: tags.map((tag) => tag.trim()).filter((tag) => tag),
      creatorNotes: creatorNotes.trim(),
      boundLorebookIds,
      appearancePrompt: appearancePrompt.trim() || null,
      imageModelId: characterImageModelId.trim() || null,
      characterLora: characterLora.trim() || null,
      characterLoraWeight,
      ipAdapterEnabled,
      ipAdapterModel,
      ipAdapterWeight,
    };

    if (isEditing) {
      updateCharacter(character.id, sharedFields);
    } else {
      const newCharacter: RoleplayCharacter = {
        id: crypto.randomUUID(),
        avatar: currentPortrait,
        ...createEmptyRoleplayMemoryState(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...sharedFields,
      };
      addCharacter(newCharacter);
      setActiveCharacter(newCharacter.id);
    }
    onClose();
  };

  // ── Portrait generation ───────────────────────────────────────────────
  const handleGeneratePortrait = () => {
    if (!appearancePrompt.trim()) return;
    setIsGeneratingPortrait(true);

    const prompt = `${appearancePrompt.trim()}, portrait, character art, detailed face, front facing, solo`;
    const [portraitWidth, portraitHeight] = portraitResolution.split('x').map(Number);

    swarmClient.generateImage(
      {
        prompt,
        ...(effectiveModel ? { model: effectiveModel } : {}),
        width: portraitWidth,
        height: portraitHeight,
        images: 1,
        steps: PORTRAIT_DEFAULT_STEPS,
        cfgscale: PORTRAIT_DEFAULT_CFG,
        ...(characterLora.trim()
          ? { loras: characterLora.trim(), loraweights: String(characterLoraWeight) }
          : {}),
      },
      {
        onImage: (data: { image?: string }) => {
          const imageUrl = resolveAssetUrl(
            data.image?.startsWith('/') ? data.image : `/${data.image}`
          );
          // Convert to base64 so it persists in localStorage and works with IP-Adapter
          fetchAsDataUrl(imageUrl)
            .then((dataUrl) => {
              setPortraitCandidates((prev) => [dataUrl, ...prev]);
              if (isEditing) {
                updateCharacterAvatar(character.id, dataUrl);
              }
            })
            .catch(() => {
              // Fallback to URL if conversion fails (e.g. CORS)
              setPortraitCandidates((prev) => [imageUrl, ...prev]);
              if (isEditing) {
                updateCharacterAvatar(character.id, imageUrl);
              }
            });
        },
        onComplete: () => setIsGeneratingPortrait(false),
        onError: () => {
          notifications.show({
            title: 'Portrait Generation Failed',
            message: 'SwarmUI could not generate the portrait.',
            color: 'red',
          });
          setIsGeneratingPortrait(false);
        },
        onDataError: (errorMessage: string) => {
          notifications.show({
            title: 'Portrait Generation Error',
            message: errorMessage,
            color: 'red',
          });
          setIsGeneratingPortrait(false);
        },
      }
    );
  };

  // ── File upload ──────────────────────────────────────────────────────
  const handleFileUpload = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (dataUrl) {
        setPortraitCandidates((prev) => [dataUrl, ...prev]);
        if (isEditing) {
          updateCharacterAvatar(character.id, dataUrl);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <Grid gutter="lg" align="flex-start">
      {/* ── LEFT COLUMN: Visual Identity ───────────────────────────── */}
      <Grid.Col span={5}>
        <Stack gap="sm">
          {/* Portrait display */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '1 / 1',
              borderRadius: 'calc(10px * var(--theme-radius-multiplier))',
              overflow: 'hidden',
              backgroundColor: 'var(--elevation-floor)',
              border: '1px solid var(--theme-gray-5)',
            }}
          >
            {currentPortrait ? (
              <img
                src={currentPortrait}
                alt="Character portrait"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <CharacterAvatar character={avatarPreview} size={64} />
                <Text size="xs" c="dimmed">
                  No portrait yet
                </Text>
              </div>
            )}

            {/* Generating overlay */}
            {isGeneratingPortrait && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  backgroundColor: 'rgba(0,0,0,0.6)',
                }}
              >
                <Loader size="lg" color="white" />
                <Text size="xs" c="white" fw={500}>
                  Generating...
                </Text>
              </div>
            )}

            {/* Remove button */}
            {hasPortrait && !isGeneratingPortrait && (
              <Tooltip label="Remove portrait">
                <ActionIcon
                  variant="filled"
                  color="dark"
                  size="sm"
                  style={{ position: 'absolute', top: 6, right: 6, opacity: 0.85 }}
                  onClick={removeCurrentPortrait}
                >
                  <IconTrash size={12} />
                </ActionIcon>
              </Tooltip>
            )}
          </div>

          {/* Portrait history thumbnails */}
          {portraitCandidates.length > 1 && (
            <ScrollArea scrollbarSize={4}>
              <Group gap={6} wrap="nowrap" pb={4}>
                {portraitCandidates.map((url, i) => (
                  <Tooltip
                    key={i}
                    label={i === 0 ? 'Current portrait' : `Select portrait ${i + 1}`}
                  >
                    <div
                      onClick={() => selectPortrait(i)}
                      style={{
                        position: 'relative',
                        width: 52,
                        height: 52,
                        flexShrink: 0,
                        borderRadius: 'calc(6px * var(--theme-radius-multiplier))',
                        overflow: 'hidden',
                        cursor: i === 0 ? 'default' : 'pointer',
                        border:
                          i === 0
                            ? '2px solid var(--theme-brand)'
                            : '2px solid var(--theme-gray-5)',
                      }}
                    >
                      <img
                        src={url}
                        alt={`Portrait ${i + 1}`}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
                        }}
                      />
                      {i === 0 && (
                        <div
                          style={{
                            position: 'absolute',
                            bottom: 2,
                            right: 2,
                            backgroundColor: 'var(--theme-brand)',
                            borderRadius: '50%',
                            width: 14,
                            height: 14,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <IconCheck size={9} color="white" />
                        </div>
                      )}
                    </div>
                  </Tooltip>
                ))}
              </Group>
            </ScrollArea>
          )}

          <Select
            label="Image Model"
            description="Optional per-character override for portraits and generated scenes"
            size="xs"
            placeholder={generatePageModel ? 'Use generate page model' : 'Select model...'}
            value={characterImageModelId || null}
            onChange={(value) => setCharacterImageModelId(value ?? '')}
            data={(sdModels ?? []).map((model) => ({
              value: model.name,
              label: model.title || model.name,
            }))}
            searchable
            clearable
            disabled={loadingModels}
            nothingFoundMessage="No models found"
          />

          {/* Model status + Load button */}
          <Group gap="xs" align="center">
            <Text size="xs" c="dimmed" style={{ flex: 1 }} truncate>
              {effectiveModel ? effectiveModel.split('/').pop() : 'No model - set on Generate page'}
            </Text>
            <Tooltip
              label={
                effectiveModel
                  ? `Load "${effectiveModel.split('/').pop()}" into SwarmUI`
                  : 'Select a model on the Generate page first'
              }
            >
              <ActionIcon
                variant="default"
                size="sm"
                onClick={() => effectiveModel && loadModel(effectiveModel)}
                loading={isLoadingModel}
                disabled={!effectiveModel || isLoadingModel}
              >
                <IconDownload size={13} />
              </ActionIcon>
            </Tooltip>
          </Group>
          {isLoadingModel && <Progress value={modelLoadProgress * 100} size="xs" animated />}

          <Select
            label="Portrait Resolution"
            description={`Portrait generation uses ${PORTRAIT_DEFAULT_STEPS} steps and CFG ${PORTRAIT_DEFAULT_CFG}`}
            size="xs"
            value={portraitResolution}
            onChange={(value) => value && setPortraitResolution(value)}
            data={PORTRAIT_RESOLUTION_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
            allowDeselect={false}
          />

          {/* Portrait action buttons */}
          <Group gap="xs">
            <SwarmButton
              tone="brand"
              emphasis="soft"
              size="xs"
              style={{ flex: 1 }}
              leftSection={hasPortrait ? <IconRefresh size={13} /> : <IconSparkles size={13} />}
              onClick={handleGeneratePortrait}
              loading={isGeneratingPortrait}
              disabled={!appearancePrompt.trim() || isGeneratingPortrait}
            >
              {hasPortrait ? 'Regenerate' : 'Generate Portrait'}
            </SwarmButton>
            <FileButton onChange={handleFileUpload} accept="image/*">
              {(props) => (
                <Tooltip label="Upload your own portrait image">
                  <ActionIcon {...props} variant="default" size="md">
                    <IconUpload size={14} />
                  </ActionIcon>
                </Tooltip>
              )}
            </FileButton>
            {hasPortrait && (
              <Tooltip label="View full size">
                <ActionIcon
                  variant="default"
                  size="md"
                  onClick={() => window.open(currentPortrait!, '_blank', 'noopener,noreferrer')}
                >
                  <IconPhoto size={14} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>

          {/* Appearance description */}
          <Textarea
            label="Appearance Description"
            description="Used for portrait generation and prepended to every scene image"
            placeholder="silver hair, violet eyes, leather armor, anime style, detailed illustration"
            value={appearancePrompt}
            onChange={(e) => setAppearancePrompt(e.currentTarget.value)}
            minRows={3}
            maxRows={5}
            autosize
            size="sm"
          />

          {/* ── Image Consistency ─────────────────────────────── */}
          <Divider label="Image Consistency" labelPosition="center" mt={4} />

          {/* LoRA */}
          <Group gap="xs" align="flex-end">
            <TextInput
              style={{ flex: 1 }}
              label="Character LoRA"
              description="Trained LoRA for appearance consistency"
              placeholder="character_v1.safetensors"
              value={characterLora}
              onChange={(e) => setCharacterLora(e.currentTarget.value)}
              size="xs"
            />
            <NumberInput
              style={{ width: 72 }}
              label="Weight"
              min={0}
              max={2}
              step={0.05}
              decimalScale={2}
              value={characterLoraWeight}
              onChange={(v) => setCharacterLoraWeight(typeof v === 'number' ? v : 0.8)}
              size="xs"
            />
          </Group>

          {/* IP-Adapter FaceID */}
          <Tooltip
            label="Requires: ComfyUI-IPAdapter-plus node pack + ip-adapter-faceid-plusv2_sdxl model. The character portrait is used as the face identity reference — no LoRA training needed."
            multiline
            w={260}
            withArrow
            position="top-start"
          >
            <Checkbox
              label="Use IP-Adapter FaceID"
              description="Zero-LoRA face embedding — generate portrait first"
              checked={ipAdapterEnabled}
              onChange={(e) => setIpAdapterEnabled(e.currentTarget.checked)}
              disabled={!hasPortrait}
              size="xs"
            />
          </Tooltip>

          {ipAdapterEnabled && (
            <Stack gap="xs">
              <Select
                label="FaceID Model"
                size="xs"
                value={ipAdapterModel}
                onChange={(v) => v && setIpAdapterModel(v)}
                data={IP_ADAPTER_MODELS}
              />
              <div>
                <Text size="xs" fw={500} mb={6}>
                  Face Weight: {ipAdapterWeight.toFixed(2)}
                </Text>
                <Slider
                  min={0.5}
                  max={1.5}
                  step={0.05}
                  value={ipAdapterWeight}
                  onChange={setIpAdapterWeight}
                  marks={[{ value: 1.0, label: '1.0' }]}
                  size="xs"
                  label={null}
                  mb={8}
                />
                <Text size="xs" c="dimmed">
                  Lower = more scene freedom · Higher = stricter face match
                </Text>
              </div>
            </Stack>
          )}
        </Stack>
      </Grid.Col>

      {/* ── RIGHT COLUMN: Character Definition ─────────────────────── */}
      <Grid.Col span={7}>
        <Stack gap="sm" h="100%">
          <Tabs defaultValue="basics" keepMounted={false}>
            <Tabs.List>
              <Tabs.Tab value="basics">Basics</Tabs.Tab>
              <Tabs.Tab value="prompting">Prompting</Tabs.Tab>
              <Tabs.Tab value="greetings">Greetings</Tabs.Tab>
              <Tabs.Tab value="lore">Lore</Tabs.Tab>
              <Tabs.Tab value="visuals">Visuals</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="basics" pt="sm">
              <TextInput
                label="Name"
                placeholder="Character name"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                required
              />
              <Select
                label="Interaction Style"
                description={interactionStyleConfig.description}
                data={ROLEPLAY_INTERACTION_STYLES.map((style) => ({
                  value: style.value,
                  label: style.label,
                }))}
                value={interactionStyle}
                onChange={handleInteractionStyleChange}
                allowDeselect={false}
              />
              <Textarea
                label="Description"
                description="High-level character definition used in the compiled prompt."
                value={description}
                onChange={(e) => setDescription(e.currentTarget.value)}
                minRows={4}
                autosize
              />
              <TagsInput
                label="Tags"
                value={tags}
                onChange={handleTagsChange}
                placeholder="Add character tags"
              />
              <Stack gap={4}>
                <Group justify="space-between" align="center">
                  <Text size="sm" fw={500}>
                    Personality
                  </Text>
                  <Select
                    placeholder="Load preset..."
                    size="xs"
                    w={180}
                    searchable
                    clearable={false}
                    value={null}
                    data={PERSONALITY_PRESETS.map((g) => ({
                      group: g.group,
                      items: g.items.map((p) => ({ value: p.value, label: p.label })),
                    }))}
                    onChange={(value) => {
                      if (!value) return;
                      const preset = PERSONALITY_PRESET_MAP.get(value);
                      if (!preset) return;
                      setPersonality(preset.personality);
                      setPersonalityProfile(
                        normalizeRoleplayPersonalityProfile(preset.personalityProfile)
                      );
                    }}
                  />
                </Group>
                <Textarea
                  description="How the character acts, speaks, and behaves — injected into the system prompt so the AI plays them accurately"
                  placeholder="A mysterious wanderer who speaks in riddles and knows too much..."
                  value={personality}
                  onChange={(e) => setPersonality(e.currentTarget.value)}
                  minRows={3}
                  maxRows={6}
                  autosize
                />
                <Accordion
                  variant="separated"
                  radius="sm"
                  multiple
                  value={openBuilderSections}
                  onChange={handleBuilderSectionsChange}
                >
                  <Accordion.Item value="personality-details">
                    <Accordion.Control>
                      <Text size="sm" fw={500}>
                        Expanded Personality Builder
                      </Text>
                    </Accordion.Control>
                    <Accordion.Panel>
                      <Stack gap="xs">
                        <Textarea
                          label="Core Traits"
                          value={personalityProfile.coreTraits}
                          onChange={(e) =>
                            handlePersonalityProfileChange('coreTraits', e.currentTarget.value)
                          }
                          minRows={2}
                          autosize
                        />
                        <Textarea
                          label="Speaking Style"
                          value={personalityProfile.speakingStyle}
                          onChange={(e) =>
                            handlePersonalityProfileChange('speakingStyle', e.currentTarget.value)
                          }
                          minRows={2}
                          autosize
                        />
                        <Textarea
                          label="Emotional Tone"
                          value={personalityProfile.emotionalTone}
                          onChange={(e) =>
                            handlePersonalityProfileChange('emotionalTone', e.currentTarget.value)
                          }
                          minRows={2}
                          autosize
                        />
                        <Textarea
                          label="Boundaries / Comfort"
                          value={personalityProfile.boundaries}
                          onChange={(e) =>
                            handlePersonalityProfileChange('boundaries', e.currentTarget.value)
                          }
                          minRows={2}
                          autosize
                        />
                        <Textarea
                          label="Motivations"
                          value={personalityProfile.motivations}
                          onChange={(e) =>
                            handlePersonalityProfileChange('motivations', e.currentTarget.value)
                          }
                          minRows={2}
                          autosize
                        />
                        <Textarea
                          label="Relationship To User"
                          value={personalityProfile.relationshipToUser}
                          onChange={(e) =>
                            handlePersonalityProfileChange(
                              'relationshipToUser',
                              e.currentTarget.value
                            )
                          }
                          minRows={2}
                          autosize
                        />
                        <Textarea
                          label="Quirks / Habits"
                          value={personalityProfile.quirks}
                          onChange={(e) =>
                            handlePersonalityProfileChange('quirks', e.currentTarget.value)
                          }
                          minRows={2}
                          autosize
                        />
                        <Textarea
                          label="Composed Personality Preview"
                          description="What the AI will receive from the structured personality builder"
                          value={buildStructuredPersonalityBlock(personalityProfile)}
                          readOnly
                          minRows={4}
                          autosize
                          styles={{ input: { fontFamily: 'monospace', fontSize: 12 } }}
                        />
                      </Stack>
                    </Accordion.Panel>
                  </Accordion.Item>
                </Accordion>
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="prompting" pt="sm">
              <Stack gap={4}>
                <Group justify="space-between" align="center">
                  <Text size="sm" fw={500}>
                    Chat Prompt Preset{' '}
                    <Text span c="red">
                      *
                    </Text>
                  </Text>
                  <Select
                    placeholder="Load preset..."
                    size="xs"
                    w={180}
                    searchable
                    clearable={false}
                    value={null}
                    data={CHAT_PROMPT_PRESETS.map((g) => ({
                      group: g.group,
                      items: g.items.map((p) => ({ value: p.value, label: p.label })),
                    }))}
                    onChange={(value) => {
                      if (!value) return;
                      const prompt = PRESET_PROMPT_MAP.get(value);
                      if (!prompt) return;
                      setChatSystemPrompt(prompt);
                    }}
                  />
                </Group>
                <Textarea
                  label="Chat Prompt"
                  description="Used when the character is in personal chat mode"
                  placeholder={getRoleplayInteractionStyleConfig('personal-chat').promptPlaceholder}
                  value={chatSystemPrompt}
                  onChange={(e) => setChatSystemPrompt(e.currentTarget.value)}
                  minRows={6}
                  maxRows={12}
                  autosize
                  required
                  styles={{ input: { fontFamily: 'monospace', fontSize: 12 } }}
                />
                <Textarea
                  label="Roleplay Prompt"
                  description="Used when the character is in storyteller / roleplay mode"
                  placeholder={getRoleplayInteractionStyleConfig('storyteller').promptPlaceholder}
                  value={roleplaySystemPrompt}
                  onChange={(e) => setRoleplaySystemPrompt(e.currentTarget.value)}
                  minRows={6}
                  maxRows={12}
                  autosize
                  required
                  styles={{ input: { fontFamily: 'monospace', fontSize: 12 } }}
                />
                <Select
                  label="Roleplay Prompt Preset"
                  placeholder="Load roleplay preset..."
                  size="xs"
                  searchable
                  clearable={false}
                  value={null}
                  data={ROLEPLAY_MODE_PROMPT_PRESETS.map((g) => ({
                    group: g.group,
                    items: g.items.map((p) => ({ value: p.value, label: p.label })),
                  }))}
                  onChange={(value) => {
                    if (!value) return;
                    const prompt = PRESET_PROMPT_MAP.get(value);
                    if (prompt) setRoleplaySystemPrompt(prompt);
                  }}
                />
                <Text size="xs" c="dimmed">
                  Active prompt right now:{' '}
                  {interactionStyle === 'storyteller' ? 'Roleplay Prompt' : 'Chat Prompt'}
                </Text>
                <Textarea
                  label="Scenario"
                  description="Scene setup included in the compiled prompt."
                  value={scenario}
                  onChange={(e) => setScenario(e.currentTarget.value)}
                  minRows={4}
                  autosize
                />
                <Textarea
                  label="Example Messages"
                  description="Few-shot examples to steer the roleplay voice."
                  value={exampleMessages}
                  onChange={(e) => setExampleMessages(e.currentTarget.value)}
                  minRows={5}
                  autosize
                />
                <Textarea
                  label="Creator Notes"
                  description="Private authoring notes included with the character definition."
                  value={creatorNotes}
                  onChange={(e) => setCreatorNotes(e.currentTarget.value)}
                  minRows={3}
                  autosize
                />
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="greetings" pt="sm">
              <Stack gap={4}>
                <Select
                  label="Chat Opening Preset"
                  placeholder="Load chat opener..."
                  size="xs"
                  searchable
                  clearable={false}
                  value={null}
                  data={CHAT_OPENING_MESSAGE_PRESETS.map((group) => ({
                    group: group.group,
                    items: group.items.map((preset) => ({
                      value: preset.value,
                      label: preset.label,
                    })),
                  }))}
                  onChange={(value) => {
                    if (!value) return;
                    const message = CHAT_OPENING_MESSAGE_PRESET_MAP.get(value);
                    if (message) {
                      setOpeningChatMessage(message);
                    }
                  }}
                />
                <Textarea
                  label="Opening Chat Message"
                  description="Optional first message the character can send to start a personal chat"
                  placeholder="Hey. I've been thinking about you..."
                  value={openingChatMessage}
                  onChange={(e) => setOpeningChatMessage(e.currentTarget.value)}
                  minRows={2}
                  maxRows={5}
                  autosize
                />
                <Select
                  label="Roleplay Opening Preset"
                  placeholder="Load roleplay opener..."
                  size="xs"
                  searchable
                  clearable={false}
                  value={null}
                  data={ROLEPLAY_OPENING_MESSAGE_PRESETS.map((group) => ({
                    group: group.group,
                    items: group.items.map((preset) => ({
                      value: preset.value,
                      label: preset.label,
                    })),
                  }))}
                  onChange={(value) => {
                    if (!value) return;
                    const message = ROLEPLAY_OPENING_MESSAGE_PRESET_MAP.get(value);
                    if (message) {
                      setOpeningRoleplayMessage(message);
                    }
                  }}
                />
                <Textarea
                  label="Opening Roleplay Message"
                  description="Optional first message the character can use to open a scene or story"
                  placeholder="The tavern door opens, and I finally look up from my drink..."
                  value={openingRoleplayMessage}
                  onChange={(e) => setOpeningRoleplayMessage(e.currentTarget.value)}
                  minRows={2}
                  maxRows={5}
                  autosize
                />
                <TagsInput
                  label="Alternate Greetings"
                  description="Additional opener variants the user can choose from when starting a session."
                  value={alternateGreetings}
                  onChange={handleAlternateGreetingsChange}
                  placeholder="Add alternate greetings"
                />
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="lore" pt="sm">
              <Stack gap="sm">
                <MultiSelect
                  label="Bound Lorebooks"
                  description="These lorebooks are always available to this character."
                  data={lorebookOptions}
                  value={boundLorebookIds}
                  onChange={handleBoundLorebooksChange}
                  searchable
                  placeholder="Choose lorebooks"
                />
                <Textarea
                  label="Scene Suggestion Prompt"
                  description="Optional — how the AI is asked to describe the current scene for image generation"
                  placeholder="Describe the current visual scene in a single vivid sentence suitable as an image prompt..."
                  value={sceneSuggestionPrompt}
                  onChange={(e) => setSceneSuggestionPrompt(e.currentTarget.value)}
                  minRows={2}
                  maxRows={5}
                  autosize
                />
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="visuals" pt="sm">
              <Stack gap="sm">
                <Textarea
                  label="Appearance Description"
                  description="Used for portrait generation and prepended to every scene image."
                  placeholder="silver hair, violet eyes, leather armor, anime style, detailed illustration"
                  value={appearancePrompt}
                  onChange={(e) => setAppearancePrompt(e.currentTarget.value)}
                  minRows={4}
                  autosize
                />
                <Text size="sm" c="dimmed">
                  Portrait generation, image models, LoRA settings, and IP-Adapter controls live in
                  the left column.
                </Text>
              </Stack>
            </Tabs.Panel>
          </Tabs>

          <div style={{ flex: 1 }} />

          <Divider />
          <Group justify="flex-end" gap="xs">
            <SwarmButton tone="secondary" emphasis="ghost" onClick={onClose}>
              Cancel
            </SwarmButton>
            <SwarmButton tone="brand" emphasis="solid" onClick={handleSave} disabled={!name.trim()}>
              {isEditing ? 'Save Changes' : 'Create Character'}
            </SwarmButton>
          </Group>
        </Stack>
      </Grid.Col>
    </Grid>
  );
}

export function CharacterEditor({ opened, onClose, character }: CharacterEditorProps) {
  const formKey = useMemo(
    () => (character?.id ?? 'new') + '-' + (opened ? '1' : '0'),
    [character?.id, opened]
  );

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <CharacterAvatar character={character} size={24} />
          <span>{character ? `Edit — ${character.name}` : 'New Character'}</span>
        </Group>
      }
      size="xl"
      scrollAreaComponent={ScrollArea.Autosize}
    >
      {opened && <CharacterEditorForm key={formKey} character={character} onClose={onClose} />}
    </Modal>
  );
}
