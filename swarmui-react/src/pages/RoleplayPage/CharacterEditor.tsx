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
  IconExternalLink,
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
import type {
  RoleplayCharacter,
  RoleplayCharacterExpressionSprite,
  RoleplayCharacterVisualProfile,
  RoleplayInteractionStyle,
  RoleplayPromptBlockRole,
} from '../../types/roleplay';
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
import {
  getRoleplayCharacterSourceOpenUrl,
  getRoleplayCharacterSourceProvider,
  reimportRoleplayCharacterCard,
} from '../../features/roleplay/roleplayCharacterSources';
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

function openExternalUrl(url: string) {
  if (!url) {
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
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

function labelsToExpressionSprites(
  labels: string[],
  currentSprites: RoleplayCharacterExpressionSprite[]
): RoleplayCharacterExpressionSprite[] {
  return labels
    .map((label) => label.trim())
    .filter((label) => label)
    .map((label) => {
      const existingSprite = currentSprites.find((sprite) => sprite.label === label);
      return (
        existingSprite ?? {
          id: crypto.randomUUID(),
          label,
          prompt: label,
          imageUrl: null,
        }
      );
    });
}

function describeGalleryImage(
  image: NonNullable<RoleplayCharacter['galleryImages']>[number],
  index: number
): string {
  const role = image.referenceRole || image.source || 'image';
  const prompt = image.prompt?.trim();
  return prompt ? `${role} ${index + 1} - ${prompt.slice(0, 42)}` : `${role} ${index + 1}`;
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
  const [creator, setCreator] = useState(character?.creator ?? '');
  const [characterVersion, setCharacterVersion] = useState(character?.characterVersion ?? '1.0');
  const [sourceUrl, setSourceUrl] = useState(character?.sourceUrl ?? '');
  const [sourceProviderId, setSourceProviderId] = useState(character?.sourceProviderId ?? '');
  const [sourceExternalId, setSourceExternalId] = useState(character?.sourceExternalId ?? '');
  const [sourceLicense, setSourceLicense] = useState(character?.sourceLicense ?? '');
  const [sourceContentRating, setSourceContentRating] = useState(
    character?.sourceContentRating ?? ''
  );
  const [isReimportingSource, setIsReimportingSource] = useState(false);
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
  const [postHistoryInstructions, setPostHistoryInstructions] = useState(
    character?.postHistoryInstructions ?? ''
  );
  const [characterNote, setCharacterNote] = useState(character?.characterNote ?? '');
  const [characterNoteRole, setCharacterNoteRole] = useState<RoleplayPromptBlockRole>(
    character?.characterNoteRole ?? 'system'
  );
  const [characterNoteDepth, setCharacterNoteDepth] = useState<number | null>(
    character?.characterNoteDepth ?? null
  );
  const [boundLorebookIds, setBoundLorebookIds] = useState(character?.boundLorebookIds ?? []);
  const [openBuilderSections, setOpenBuilderSections] = useState<string[]>(['personality-details']);

  // ── Visual identity fields ────────────────────────────────────────────
  const [appearancePrompt, setAppearancePrompt] = useState(character?.appearancePrompt ?? '');
  const [visualPermanentAnchor, setVisualPermanentAnchor] = useState(
    character?.visualProfile?.permanentAnchor || character?.appearancePrompt || ''
  );
  const [visualDefaultAttire, setVisualDefaultAttire] = useState(
    character?.visualProfile?.defaultAttire ?? ''
  );
  const [visualStyleAnchor, setVisualStyleAnchor] = useState(
    character?.visualProfile?.styleAnchor ?? ''
  );
  const [visualNegativeAnchor, setVisualNegativeAnchor] = useState(
    character?.visualProfile?.negativeAnchor ?? ''
  );
  const [expressionSprites, setExpressionSprites] = useState<RoleplayCharacterExpressionSprite[]>(
    character?.expressionSprites ?? []
  );
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
      updateCharacterAvatar(character.id, '', '');
    }
  };

  // ── Store ─────────────────────────────────────────────────────────────
  const {
    addCharacter,
    importCharacterCard,
    updateCharacter,
    setActiveCharacter,
    updateCharacterAvatar,
    addCharacterGalleryImage,
    lorebooks,
  } = useRoleplayStore(
    useShallow((s) => ({
      addCharacter: s.addCharacter,
      importCharacterCard: s.importCharacterCard,
      updateCharacter: s.updateCharacter,
      setActiveCharacter: s.setActiveCharacter,
      updateCharacterAvatar: s.updateCharacterAvatar,
      addCharacterGalleryImage: s.addCharacterGalleryImage,
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
  const sourceProvider = useMemo(
    () => getRoleplayCharacterSourceProvider(sourceProviderId.trim()),
    [sourceProviderId]
  );
  const sourceOpenUrl = useMemo(
    () =>
      getRoleplayCharacterSourceOpenUrl({
        sourceProviderId: sourceProviderId.trim(),
        sourceExternalId: sourceExternalId.trim(),
        sourceUrl: sourceUrl.trim(),
        sourceDownloadUrl: character?.sourceDownloadUrl ?? '',
      }),
    [character?.sourceDownloadUrl, sourceExternalId, sourceProviderId, sourceUrl]
  );
  const expressionImageOptions = useMemo(
    () => [
      { value: '', label: 'No sprite image' },
      ...((character?.galleryImages ?? []).map((image, index) => ({
        value: image.imageUrl,
        label: describeGalleryImage(image, index),
      }))),
      ...(currentPortrait &&
      !(character?.galleryImages ?? []).some((image) => image.imageUrl === currentPortrait)
        ? [{ value: currentPortrait, label: 'Current portrait' }]
        : []),
    ],
    [character?.galleryImages, currentPortrait]
  );

  // ── Model selection ───────────────────────────────────────────────────
  const generatePageModel = useGenerationStore((s) => s.selectedModel);
  const effectiveModel = characterImageModelId || generatePageModel;
  const { data: sdModels, isLoading: loadingModels } = useModels('Stable-Diffusion');
  const { isLoading: isLoadingModel, progress: modelLoadProgress, loadModel } = useModelLoading();
  const currentVisualProfile = useMemo<RoleplayCharacterVisualProfile>(
    () => ({
      permanentAnchor: visualPermanentAnchor.trim() || appearancePrompt.trim(),
      defaultAttire: visualDefaultAttire.trim(),
      styleAnchor: visualStyleAnchor.trim(),
      negativeAnchor: visualNegativeAnchor.trim(),
    }),
    [
      appearancePrompt,
      visualDefaultAttire,
      visualNegativeAnchor,
      visualPermanentAnchor,
      visualStyleAnchor,
    ]
  );

  // ── Avatar preview object (for CharacterAvatar component) ─────────────
  const avatarPreview: RoleplayCharacter = useMemo(
    () => ({
      id: character?.id ?? 'preview',
      name: name || '?',
      favorite: character?.favorite ?? false,
      creator: creator.trim(),
      characterVersion: characterVersion.trim(),
      sourceFormat: character?.sourceFormat ?? 'native',
      sourceUrl: sourceUrl.trim(),
      sourceProviderId: sourceProviderId.trim(),
      sourceExternalId: sourceExternalId.trim(),
      sourceDownloadUrl: character?.sourceDownloadUrl ?? '',
      sourceImportedAt: character?.sourceImportedAt ?? null,
      sourceLastCheckedAt: character?.sourceLastCheckedAt ?? null,
      sourceLicense: sourceLicense.trim(),
      sourceContentRating: sourceContentRating.trim(),
      catalogTemplateId: character?.catalogTemplateId ?? null,
      catalogCategory: character?.catalogCategory ?? null,
      cardExtensions: character?.cardExtensions ?? null,
      avatar: currentPortrait,
      headshotUrl: character?.headshotUrl ?? null,
      interactionStyle,
      appearancePrompt: currentVisualProfile.permanentAnchor || null,
      visualProfile: currentVisualProfile,
      expressionSprites,
      galleryImages:
        character?.galleryImages ??
        (currentPortrait
          ? [
              {
                id: crypto.randomUUID(),
                imageUrl: currentPortrait,
                source: 'portrait' as const,
                referenceRole: 'portrait' as const,
                isPrimaryReference: true,
                prompt: currentVisualProfile.permanentAnchor,
                sessionId: null,
                messageId: null,
                createdAt: character?.createdAt ?? 0,
              },
            ]
          : []),
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
      postHistoryInstructions,
      characterNote,
      characterNoteRole,
      characterNoteDepth,
      tavernV2Data: character?.tavernV2Data ?? null,
      boundLorebookIds,
      ...createEmptyRoleplayMemoryState(),
      createdAt: character?.createdAt ?? 0,
      updatedAt: character?.updatedAt ?? 0,
    }),
    [
      character,
      name,
      creator,
      characterVersion,
      sourceUrl,
      sourceProviderId,
      sourceExternalId,
      sourceLicense,
      sourceContentRating,
      currentPortrait,
      interactionStyle,
      currentVisualProfile,
      expressionSprites,
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
      postHistoryInstructions,
      characterNote,
      characterNoteRole,
      characterNoteDepth,
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

  const updateExpressionSprite = (
    spriteId: string,
    updates: Partial<RoleplayCharacterExpressionSprite>
  ) => {
    setExpressionSprites((current) =>
      current.map((sprite) => (sprite.id === spriteId ? { ...sprite, ...updates } : sprite))
    );
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
      creator: creator.trim(),
      characterVersion: characterVersion.trim() || '1.0',
      sourceUrl: sourceUrl.trim(),
      sourceProviderId: sourceProviderId.trim(),
      sourceExternalId: sourceExternalId.trim(),
      sourceLicense: sourceLicense.trim(),
      sourceContentRating: sourceContentRating.trim(),
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
      postHistoryInstructions: postHistoryInstructions.trim(),
      characterNote: characterNote.trim(),
      characterNoteRole,
      characterNoteDepth,
      tavernV2Data: character?.tavernV2Data ?? null,
      boundLorebookIds,
      appearancePrompt: currentVisualProfile.permanentAnchor || null,
      visualProfile: currentVisualProfile,
      expressionSprites,
      galleryImages:
        character?.galleryImages ??
        (currentPortrait
          ? [
              {
                id: crypto.randomUUID(),
                imageUrl: currentPortrait,
                source: 'portrait' as const,
                referenceRole: 'portrait' as const,
                isPrimaryReference: true,
                prompt: currentVisualProfile.permanentAnchor,
                sessionId: null,
                messageId: null,
                createdAt: Date.now(),
              },
            ]
          : []),
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
        favorite: false,
        sourceFormat: 'native',
        sourceDownloadUrl: '',
        sourceImportedAt: null,
        sourceLastCheckedAt: null,
        catalogTemplateId: null,
        catalogCategory: null,
        cardExtensions: null,
        avatar: currentPortrait,
        headshotUrl: null,
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

  const handleOpenSource = () => {
    openExternalUrl(sourceOpenUrl);
  };

  const handleReimportSource = async () => {
    if (!character) {
      return;
    }
    setIsReimportingSource(true);
    try {
      const preview = await reimportRoleplayCharacterCard({
        sourceProviderId: sourceProviderId.trim(),
        sourceExternalId: sourceExternalId.trim(),
        sourceUrl: sourceUrl.trim(),
        sourceDownloadUrl: character.sourceDownloadUrl,
      });
      importCharacterCard(preview.result, {
        mode: 'replace',
        targetCharacterId: character.id,
        sourceMetadata: preview.sourceMetadata,
      });
      notifications.show({
        title: 'Character Re-imported',
        message: `${preview.result.character.name} was refreshed from its source.`,
        color: 'green',
      });
    } catch (error) {
      notifications.show({
        title: 'Re-import Failed',
        message:
          error instanceof Error
            ? error.message
            : 'Could not refresh this character from its source.',
        color: 'red',
      });
    } finally {
      setIsReimportingSource(false);
    }
  };

  // ── Portrait generation ───────────────────────────────────────────────
  const handleGeneratePortrait = () => {
    const portraitAnchor = currentVisualProfile.permanentAnchor.trim();
    if (!portraitAnchor) {
      return;
    }
    setIsGeneratingPortrait(true);

    const prompt = `${portraitAnchor}, portrait, character art, detailed face, front facing, solo`;
    const [portraitWidth, portraitHeight] = portraitResolution.split('x').map(Number);
    const headshotSize = 512;

    // Generate portrait
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
                addCharacterGalleryImage(character.id, {
                  imageUrl: dataUrl,
                  source: 'portrait',
                  referenceRole: 'portrait',
                  isPrimaryReference: true,
                  prompt,
                  sessionId: null,
                  messageId: null,
                });
                // Generate headshot after portrait is ready
                generateHeadshot(prompt, headshotSize, character, dataUrl);
              }
            })
            .catch(() => {
              // Fallback to URL if conversion fails (e.g. CORS)
              setPortraitCandidates((prev) => [imageUrl, ...prev]);
              if (isEditing) {
                addCharacterGalleryImage(character.id, {
                  imageUrl,
                  source: 'portrait',
                  referenceRole: 'portrait',
                  isPrimaryReference: true,
                  prompt,
                  sessionId: null,
                  messageId: null,
                });
                generateHeadshot(prompt, headshotSize, character, imageUrl);
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

  // ── Headshot generation ──────────────────────────────────────────────
  const generateHeadshot = (
    basePrompt: string,
    size: number,
    char: RoleplayCharacter,
    portraitUrl: string
  ) => {
    const headshotPrompt = `${basePrompt}, headshot, face close-up, portrait, square format`;
    swarmClient.generateImage(
      {
        prompt: headshotPrompt,
        ...(effectiveModel ? { model: effectiveModel } : {}),
        width: size,
        height: size,
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
          fetchAsDataUrl(imageUrl)
            .then((dataUrl) => {
              updateCharacterAvatar(char.id, portraitUrl, dataUrl);
            })
            .catch(() => {
              updateCharacterAvatar(char.id, portraitUrl, imageUrl);
            });
        },
        onError: () => {
          // Still update avatar even if headshot fails
          updateCharacterAvatar(char.id, portraitUrl);
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
          updateCharacterAvatar(character.id, dataUrl, dataUrl);
          addCharacterGalleryImage(character.id, {
            imageUrl: dataUrl,
            source: 'upload',
            referenceRole: 'portrait',
            isPrimaryReference: true,
            prompt: 'Uploaded portrait',
            sessionId: null,
            messageId: null,
          });
        }
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <Grid gap="lg" align="flex-start" className="roleplay-character-editor-grid">
      <Grid.Col span={{ base: 12, md: 5 }}>
        <Stack gap="sm" className="roleplay-portrait-studio">
          <Stack gap={2}>
            <Text size="sm" fw={700}>
              Portrait Studio
            </Text>
            <Text size="xs" c="dimmed">
              Build the image that appears on this character card and guides scene generation.
            </Text>
          </Stack>
          <div className="roleplay-portrait-studio__frame">
            {currentPortrait ? (
              <img
                src={currentPortrait}
                alt="Character portrait"
                className="roleplay-portrait-studio__image"
              />
            ) : (
              <div className="roleplay-portrait-studio__empty">
                <CharacterAvatar character={avatarPreview} size={64} />
                <Text size="xs" c="dimmed">
                  No portrait yet
                </Text>
              </div>
            )}

            {/* Generating overlay */}
            {isGeneratingPortrait && (
              <div className="roleplay-portrait-studio__overlay">
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
                  className="roleplay-portrait-studio__remove"
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
              <Group gap={8} wrap="nowrap" pb={4} className="roleplay-portrait-candidates">
                {portraitCandidates.map((url, i) => (
                  <Tooltip
                    key={i}
                    label={i === 0 ? 'Current portrait' : `Select portrait ${i + 1}`}
                  >
                    <div
                      onClick={() => selectPortrait(i)}
                      className="roleplay-portrait-candidate"
                      data-active={i === 0}
                    >
                      <img
                        src={url}
                        alt={`Portrait ${i + 1}`}
                      />
                      {i === 0 && (
                        <div className="roleplay-portrait-candidate__check">
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
              disabled={!currentVisualProfile.permanentAnchor || isGeneratingPortrait}
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
            description="Legacy field kept for older cards. The visual profile below is used for continuity prompts."
            placeholder="silver hair, violet eyes, leather armor, anime style, detailed illustration"
            value={appearancePrompt}
            onChange={(e) => setAppearancePrompt(e.currentTarget.value)}
            minRows={3}
            maxRows={5}
            autosize
            size="sm"
          />

          {/* ── Image Consistency ─────────────────────────────── */}
          <Divider label="Visual Profile" labelPosition="center" mt={4} />
          <Textarea
            label="Permanent Visual Anchor"
            description="Stable face, body, age range, hair, eyes, markings, and identity traits."
            placeholder="adult woman, pale skin, sharp green eyes, heart-shaped face, long black hair with blunt fringe..."
            value={visualPermanentAnchor}
            onChange={(e) => setVisualPermanentAnchor(e.currentTarget.value)}
            minRows={3}
            maxRows={6}
            autosize
            size="sm"
          />
          <Textarea
            label="Default Attire"
            placeholder="black fitted turtleneck, long charcoal-grey wool coat, silver pendant..."
            value={visualDefaultAttire}
            onChange={(e) => setVisualDefaultAttire(e.currentTarget.value)}
            minRows={2}
            maxRows={4}
            autosize
            size="sm"
          />
          <Textarea
            label="Style Anchor"
            placeholder="cinematic semi-realistic anime, soft rim lighting, detailed eyes, high detail..."
            value={visualStyleAnchor}
            onChange={(e) => setVisualStyleAnchor(e.currentTarget.value)}
            minRows={2}
            maxRows={4}
            autosize
            size="sm"
          />
          <Textarea
            label="Negative Anchor"
            placeholder="different eye color, short hair, missing beauty mark, different face, inconsistent age..."
            value={visualNegativeAnchor}
            onChange={(e) => setVisualNegativeAnchor(e.currentTarget.value)}
            minRows={2}
            maxRows={4}
            autosize
            size="sm"
          />

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
      <Grid.Col span={{ base: 12, md: 7 }}>
        <Stack gap="sm" h="100%" className="roleplay-character-definition-panel">
          <Tabs defaultValue="profile" keepMounted={false} className="roleplay-character-editor-tabs">
            <Tabs.List grow>
              <Tabs.Tab value="profile">Profile</Tabs.Tab>
              <Tabs.Tab value="personality">Personality</Tabs.Tab>
              <Tabs.Tab value="opening">Opening</Tabs.Tab>
              <Tabs.Tab value="advanced">Advanced</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="profile" pt="sm">
              <Stack gap="sm">
              <TextInput
                label="Name"
                placeholder="Character name"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                required
              />
              <Grid gap="xs">
                <Grid.Col span={{ base: 12, sm: 6 }}>
                  <TextInput
                    label="Creator"
                    placeholder="Author name"
                    value={creator}
                    onChange={(e) => setCreator(e.currentTarget.value)}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 6 }}>
                  <TextInput
                    label="Character Version"
                    placeholder="1.0"
                    value={characterVersion}
                    onChange={(e) => setCharacterVersion(e.currentTarget.value)}
                  />
                </Grid.Col>
              </Grid>
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
              <TagsInput
                label="Tags"
                value={tags}
                onChange={handleTagsChange}
                placeholder="Add character tags"
              />
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="personality" pt="sm">
              <Stack gap="sm">
                <Textarea
                  label="Description"
                  description="Maps to Tavern card description."
                  value={description}
                  onChange={(e) => setDescription(e.currentTarget.value)}
                  minRows={4}
                  autosize
                />
                <Textarea
                  label="Scenario"
                  description="Maps to Tavern card scenario."
                  value={scenario}
                  onChange={(e) => setScenario(e.currentTarget.value)}
                  minRows={4}
                  autosize
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
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="advanced" pt="sm">
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
                  label="Creator Notes"
                  description="Maps to Tavern V2 creator_notes. Kept separate from post-history instructions."
                  value={creatorNotes}
                  onChange={(e) => setCreatorNotes(e.currentTarget.value)}
                  minRows={3}
                  autosize
                />
                <Textarea
                  label="Post-History Instructions"
                  description="Maps to Tavern V2 post_history_instructions and is inserted after chat history."
                  value={postHistoryInstructions}
                  onChange={(e) => setPostHistoryInstructions(e.currentTarget.value)}
                  minRows={3}
                  autosize
                />
                <Textarea
                  label="Character Note"
                  description="Optional Tavern-style note inserted as its own prompt block."
                  value={characterNote}
                  onChange={(e) => setCharacterNote(e.currentTarget.value)}
                  minRows={2}
                  autosize
                />
                <Grid gap="xs">
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <Select
                      label="Character Note Role"
                      data={[
                        { value: 'system', label: 'System' },
                        { value: 'user', label: 'User' },
                        { value: 'assistant', label: 'Assistant' },
                      ]}
                      value={characterNoteRole}
                      onChange={(value) =>
                        value && setCharacterNoteRole(value as RoleplayPromptBlockRole)
                      }
                      allowDeselect={false}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <NumberInput
                      label="Character Note Depth"
                      description="Blank inserts before history."
                      min={0}
                      value={characterNoteDepth ?? ''}
                      onChange={(value) =>
                        setCharacterNoteDepth(typeof value === 'number' ? value : null)
                      }
                    />
                  </Grid.Col>
                </Grid>
                <Accordion variant="separated" radius="sm">
                  <Accordion.Item value="source">
                    <Accordion.Control>
                      <Text size="sm" fw={500}>
                        Source & Compatibility
                      </Text>
                    </Accordion.Control>
                    <Accordion.Panel>
                      <Stack gap="xs">
                        <Text size="xs" c="dimmed">
                          Format: {character?.sourceFormat ?? 'native'}
                          {character?.sourceImportedAt
                            ? ` - Imported ${new Date(character.sourceImportedAt).toLocaleString()}`
                            : ''}
                        </Text>
                        <Text size="xs" c="dimmed">
                          Provider: {sourceProvider?.label ?? (sourceProviderId.trim() || 'Manual')}
                          {character?.sourceLastCheckedAt
                            ? ` - Last checked ${new Date(character.sourceLastCheckedAt).toLocaleString()}`
                            : ''}
                        </Text>
                        {character ? (
                          <Group gap="xs">
                            <SwarmButton
                              tone="secondary"
                              emphasis="soft"
                              size="xs"
                              leftSection={<IconRefresh size={12} />}
                              disabled={
                                isReimportingSource ||
                                sourceProviderId.trim() === 'local-file' ||
                                (!sourceUrl.trim() &&
                                  !character.sourceDownloadUrl &&
                                  !sourceExternalId.trim())
                              }
                              onClick={() => void handleReimportSource()}
                            >
                              {isReimportingSource ? 'Re-importing...' : 'Re-import Source'}
                            </SwarmButton>
                            <SwarmButton
                              tone="secondary"
                              emphasis="ghost"
                              size="xs"
                              leftSection={<IconExternalLink size={12} />}
                              disabled={!sourceOpenUrl}
                              onClick={handleOpenSource}
                            >
                              Open Source
                            </SwarmButton>
                          </Group>
                        ) : null}
                        <TextInput
                          label="Source URL"
                          placeholder="https://..."
                          value={sourceUrl}
                          onChange={(e) => setSourceUrl(e.currentTarget.value)}
                        />
                        <Grid gap="xs">
                          <Grid.Col span={{ base: 12, sm: 6 }}>
                            <TextInput
                              label="Provider"
                              placeholder="direct-url, local-file, sillytavern-bridge"
                              value={sourceProviderId}
                              onChange={(e) => setSourceProviderId(e.currentTarget.value)}
                            />
                          </Grid.Col>
                          <Grid.Col span={{ base: 12, sm: 6 }}>
                            <TextInput
                              label="External ID"
                              value={sourceExternalId}
                              onChange={(e) => setSourceExternalId(e.currentTarget.value)}
                            />
                          </Grid.Col>
                        </Grid>
                        <Grid gap="xs">
                          <Grid.Col span={{ base: 12, sm: 6 }}>
                            <TextInput
                              label="License"
                              value={sourceLicense}
                              onChange={(e) => setSourceLicense(e.currentTarget.value)}
                            />
                          </Grid.Col>
                          <Grid.Col span={{ base: 12, sm: 6 }}>
                            <TextInput
                              label="Content Rating"
                              value={sourceContentRating}
                              onChange={(e) => setSourceContentRating(e.currentTarget.value)}
                            />
                          </Grid.Col>
                        </Grid>
                      </Stack>
                    </Accordion.Panel>
                  </Accordion.Item>
                </Accordion>
                <Divider label="Lore, Visuals & Examples" labelPosition="center" />
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
                  description="How the AI is asked to describe the current scene for image generation."
                  placeholder="Describe the current visual scene in a single vivid sentence suitable as an image prompt..."
                  value={sceneSuggestionPrompt}
                  onChange={(e) => setSceneSuggestionPrompt(e.currentTarget.value)}
                  minRows={2}
                  maxRows={5}
                  autosize
                />
                <TagsInput
                  label="Expression / Sprite Slots"
                  description="Named expression cues for chat staging. Each slot can carry its own prompt and optional gallery image."
                  data={expressionSprites.map((sprite) => sprite.label)}
                  value={expressionSprites.map((sprite) => sprite.label)}
                  onChange={(labels) =>
                    setExpressionSprites((current) => labelsToExpressionSprites(labels, current))
                  }
                  placeholder="smile, blush, angry, wounded, focused"
                />
                {expressionSprites.length > 0 ? (
                  <Stack gap="xs" className="roleplay-expression-sprite-list">
                    {expressionSprites.map((sprite) => (
                      <div key={sprite.id} className="roleplay-expression-sprite-row">
                        <Group align="flex-start" wrap="nowrap">
                          <div className="roleplay-expression-sprite-thumb">
                            {sprite.imageUrl ? (
                              <img src={resolveAssetUrl(sprite.imageUrl)} alt={sprite.label} />
                            ) : (
                              <span>{sprite.label.slice(0, 2).toUpperCase()}</span>
                            )}
                          </div>
                          <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
                            <Group grow align="flex-start">
                              <Textarea
                                label={`${sprite.label} Prompt`}
                                value={sprite.prompt ?? ''}
                                onChange={(event) =>
                                  updateExpressionSprite(sprite.id, {
                                    prompt: event.currentTarget.value,
                                  })
                                }
                                minRows={2}
                                autosize
                                placeholder="facial expression, pose, sprite cue, emotion"
                              />
                              <Select
                                label="Sprite Image"
                                data={expressionImageOptions}
                                value={sprite.imageUrl ?? ''}
                                onChange={(value) =>
                                  updateExpressionSprite(sprite.id, {
                                    imageUrl: value || null,
                                  })
                                }
                                searchable
                                allowDeselect={false}
                              />
                            </Group>
                            <Text size="xs" c="dimmed">
                              Used by stage controls and image prompt continuity when this expression is active.
                            </Text>
                          </Stack>
                        </Group>
                      </div>
                    ))}
                  </Stack>
                ) : null}
                <Textarea
                  label="Example Dialogues"
                  description="Maps to Tavern card mes_example."
                  placeholder="<START>\n{{user}}: Hello.\n{{char}}: Hello there."
                  value={exampleMessages}
                  onChange={(e) => setExampleMessages(e.currentTarget.value)}
                  minRows={8}
                  autosize
                  styles={{ input: { fontFamily: 'monospace', fontSize: 12 } }}
                />
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="opening" pt="sm">
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
          <span>{character ? `Edit - ${character.name}` : 'New Character'}</span>
        </Group>
      }
      size="min(1480px, calc(100vw - 32px))"
      scrollAreaComponent={ScrollArea.Autosize}
      classNames={{
        content: 'roleplay-character-editor-modal',
        body: 'roleplay-character-editor-body',
      }}
    >
      {opened && <CharacterEditorForm key={formKey} character={character} onClose={onClose} />}
    </Modal>
  );
}
